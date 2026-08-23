-- fish-tracker RLS.
-- The backend uses the service role and bypasses these; they protect direct
-- client reads and Realtime. Clients get SELECT only — every write goes
-- through the API — except payout_details, which the owner manages directly.
--
-- Two token shapes reach these policies:
--   registered: Supabase Auth JWT, auth.uid() = auth.users.id -> users.auth_user_id
--   guest:      backend-minted JWT, auth.uid() = users.id, claims
--               fish_guest = "true" and game_id = the one game it is valid for.

alter table public.users          enable row level security;
alter table public.payout_details enable row level security;
alter table public.games          enable row level security;
alter table public.game_members   enable row level security;
alter table public.entries        enable row level security;
alter table public.settlements    enable row level security;
alter table public.adjustments    enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so membership lookups don't recurse into RLS;
-- STABLE so the planner caches them per statement rather than per row.
-- ---------------------------------------------------------------------------

create or replace function public.jwt_is_guest()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'fish_guest'), '') = 'true'
$$;

create or replace function public.jwt_game_id()
returns uuid
language sql stable
set search_path = ''
as $$
  select nullif((select auth.jwt() ->> 'game_id'), '')::uuid
$$;

-- The ledger identity behind the current token.
create or replace function public.current_ledger_user_id()
returns uuid
language sql stable
security definer
set search_path = ''
as $$
  select case
    when public.jwt_is_guest() then (select auth.uid())
    else (select u.id from public.users u where u.auth_user_id = (select auth.uid()))
  end
$$;

-- Member of game g? A guest token is additionally valid only for the game_id
-- baked into it, regardless of membership rows.
create or replace function public.is_game_member(g uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select (not public.jwt_is_guest() or public.jwt_game_id() = g)
     and exists (
       select 1 from public.game_members gm
       where gm.game_id = g
         and gm.user_id = public.current_ledger_user_id()
     )
$$;

create or replace function public.shares_game_with(target uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.game_members me
    join public.game_members them on them.game_id = me.game_id
    where me.user_id = public.current_ledger_user_id()
      and them.user_id = target
      and (not public.jwt_is_guest() or public.jwt_game_id() = me.game_id)
  )
$$;

-- Payout details stay visible to co-players of a shared game until 7 days
-- after that game closes (decided 2026-08-23); the owner always sees their own.
create or replace function public.payout_visible_to_current(owner_id uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.game_members me
    join public.game_members them on them.game_id = me.game_id
    join public.games g on g.id = me.game_id
    where me.user_id = public.current_ledger_user_id()
      and them.user_id = owner_id
      and (g.closed_at is null or g.closed_at > now() - interval '7 days')
      and (not public.jwt_is_guest() or public.jwt_game_id() = g.id)
  )
$$;

revoke execute on function
  public.jwt_is_guest(),
  public.jwt_game_id(),
  public.current_ledger_user_id(),
  public.is_game_member(uuid),
  public.shares_game_with(uuid),
  public.payout_visible_to_current(uuid)
from public, anon;

grant execute on function
  public.jwt_is_guest(),
  public.jwt_game_id(),
  public.current_ledger_user_id(),
  public.is_game_member(uuid),
  public.shares_game_with(uuid),
  public.payout_visible_to_current(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants: clients read; only payout_details is client-writable (owner only).
-- anon gets nothing — the guest path goes through the API, which returns an
-- authenticated-role token.
-- ---------------------------------------------------------------------------

revoke all on public.users, public.payout_details, public.games,
              public.game_members, public.entries, public.settlements,
              public.adjustments
from anon, authenticated;

grant select on public.games, public.game_members, public.entries,
                public.settlements, public.adjustments
to authenticated;

-- Co-players may read exactly id, display_name, is_guest — nothing else
-- (column-level grant; own default_currency comes via the API).
grant select (id, display_name, is_guest) on public.users to authenticated;

grant select, insert, update, delete on public.payout_details to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

create policy "members read their games"
  on public.games for select to authenticated
  using (public.is_game_member(id));

create policy "members read the roster"
  on public.game_members for select to authenticated
  using (public.is_game_member(game_id));

create policy "members read the ledger"
  on public.entries for select to authenticated
  using (public.is_game_member(game_id));

create policy "members read the settlement"
  on public.settlements for select to authenticated
  using (public.is_game_member(game_id));

create policy "members read adjustments"
  on public.adjustments for select to authenticated
  using (public.is_game_member(game_id));

create policy "read own row and co-players"
  on public.users for select to authenticated
  using (id = public.current_ledger_user_id() or public.shares_game_with(id));

create policy "payout details: owner and settling co-players read"
  on public.payout_details for select to authenticated
  using (
    user_id = public.current_ledger_user_id()
    or public.payout_visible_to_current(user_id)
  );

create policy "payout details: owner inserts"
  on public.payout_details for insert to authenticated
  with check (user_id = public.current_ledger_user_id() and not public.jwt_is_guest());

create policy "payout details: owner updates"
  on public.payout_details for update to authenticated
  using (user_id = public.current_ledger_user_id() and not public.jwt_is_guest())
  with check (user_id = public.current_ledger_user_id() and not public.jwt_is_guest());

create policy "payout details: owner removes"
  on public.payout_details for delete to authenticated
  using (user_id = public.current_ledger_user_id() and not public.jwt_is_guest());
