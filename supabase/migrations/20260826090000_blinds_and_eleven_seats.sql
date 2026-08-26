-- Blinds, game events, and eleven seats (app-logic, 2026-08-26).
--
-- Three things, one migration because they ship as one feature:
--   1. games carries a small/big blind pair — the table's stakes, not money
--      in the ledger, and deliberately not a schedule of escalating levels.
--   2. game_events records the non-money things worth keeping: today, a
--      blind change. Append-only, never counted.
--   3. A table now seats eleven, up from nine.

-- ---------------------------------------------------------------------------
-- 1. Blinds on the game
-- ---------------------------------------------------------------------------

alter table public.games
  add column small_blind_minor bigint,
  add column big_blind_minor bigint;

-- Positive when present, set as a pair, big >= small. A big blind with no
-- small blind is not a state worth being able to represent.
alter table public.games
  add constraint blinds_positive check (
    (small_blind_minor is null or small_blind_minor > 0)
    and (big_blind_minor is null or big_blind_minor > 0)
  ),
  add constraint blinds_set_together check (
    (small_blind_minor is null) = (big_blind_minor is null)
  ),
  add constraint blinds_ordered check (
    small_blind_minor is null
    or big_blind_minor >= small_blind_minor
  );

comment on column public.games.small_blind_minor is
  'Small blind in minor units. Stakes, not ledger money: never summed into a net, total or settlement.';
comment on column public.games.big_blind_minor is
  'Big blind in minor units. See small_blind_minor.';

-- ---------------------------------------------------------------------------
-- 2. Game events
-- ---------------------------------------------------------------------------

create type public.game_event_type as enum ('blinds_changed');

create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id),
  event_type public.game_event_type not null,
  actor_user_id uuid not null references public.users (id),
  created_at timestamptz not null default now(),

  -- blinds_changed payload. Explicit columns rather than jsonb: this is a
  -- ledger, and a typed column that the database can check beats a blob that
  -- it cannot. from_* are null for the first setting of the blinds.
  from_small_blind_minor bigint,
  from_big_blind_minor bigint,
  to_small_blind_minor bigint,
  to_big_blind_minor bigint,

  constraint blinds_event_has_new_values check (
    event_type <> 'blinds_changed'
    or (to_small_blind_minor is not null and to_big_blind_minor is not null)
  ),
  constraint blinds_event_amounts_positive check (
    (from_small_blind_minor is null or from_small_blind_minor > 0)
    and (from_big_blind_minor is null or from_big_blind_minor > 0)
    and (to_small_blind_minor is null or to_small_blind_minor > 0)
    and (to_big_blind_minor is null or to_big_blind_minor > 0)
  ),
  -- A recorded change must actually be a change.
  constraint blinds_event_is_a_change check (
    event_type <> 'blinds_changed'
    or from_small_blind_minor is distinct from to_small_blind_minor
    or from_big_blind_minor is distinct from to_big_blind_minor
  )
);

create index game_events_game_created on public.game_events (game_id, created_at);

comment on table public.game_events is
  'Append-only record of non-money occurrences in a game. Never contributes to a net, total, reconciliation or settlement.';

-- Same guarantees as the money ledger: written once, never edited, never
-- deleted. forbid_update and forbid_delete come from 20260823165605.
create trigger game_events_no_update
  before update on public.game_events
  for each row execute function public.forbid_update();

create trigger game_events_no_delete
  before delete on public.game_events
  for each row execute function public.forbid_delete();

-- RLS: members read, exactly as they read the ledger beside it. Writes go
-- through the API, which holds the service role.
alter table public.game_events enable row level security;

revoke all on public.game_events from anon, authenticated;
grant select on public.game_events to authenticated;

-- ledger., not public. — the RLS helpers were moved out of the PostgREST-
-- exposed schema by 20260823170326.
create policy "members read game events"
  on public.game_events for select to authenticated
  using (ledger.is_game_member(game_id));

-- The log updates live for everyone at the table, like entries do.
alter publication supabase_realtime add table public.game_events;

-- ---------------------------------------------------------------------------
-- 3. Eleven seats
-- ---------------------------------------------------------------------------

-- Supersedes the nine of 20260824220000. The trigger stays the backstop
-- behind the service-layer check: no direct insert and no race between two
-- joins can seat a twelfth person.
create or replace function public.enforce_table_capacity()
returns trigger
language plpgsql
as $$
declare
  seated integer;
begin
  if new.departed_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.departed_at is null then
    return new;  -- was already seated; not a new seat
  end if;

  perform 1 from public.games where id = new.game_id for update;

  select count(*) into seated
  from public.game_members
  where game_id = new.game_id
    and departed_at is null
    and user_id <> new.user_id;

  if seated >= 11 then
    raise exception 'table_full' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
