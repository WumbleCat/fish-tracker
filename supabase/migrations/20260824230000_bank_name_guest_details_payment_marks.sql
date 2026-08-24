-- Three decisions of 2026-08-24 (app-logic):
--   1. Payout details carry the bank's name alongside the account name.
--   2. Guests may hold payout details. A guest identity exists for exactly
--      one game, so the row is scoped to that session by construction; the
--      visibility rule (co-players of a shared game) is unchanged.
--   3. The host records which settlement payments have been paid. A mark is
--      a fact about cash changing hands, recorded beside the settlement —
--      it never alters the settlement, and it is not a ledger entry.

-- 1. bank name --------------------------------------------------------------
alter table public.payout_details add column bank_name text
  constraint bank_name_length check (
    bank_name is null or char_length(bank_name) between 1 and 100
  );

-- 2. guests may hold details ------------------------------------------------
drop trigger if exists payout_details_guard on public.payout_details;
drop function if exists public.enforce_payout_owner_not_guest();

create or replace function public.touch_payout_details()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger payout_details_touch
  before insert or update on public.payout_details
  for each row execute function public.touch_payout_details();

drop policy if exists "payout details: owner inserts" on public.payout_details;
drop policy if exists "payout details: owner updates" on public.payout_details;
drop policy if exists "payout details: owner removes" on public.payout_details;

create policy "payout details: owner inserts"
  on public.payout_details for insert to authenticated
  with check (user_id = ledger.current_ledger_user_id());

create policy "payout details: owner updates"
  on public.payout_details for update to authenticated
  using (user_id = ledger.current_ledger_user_id())
  with check (user_id = ledger.current_ledger_user_id());

create policy "payout details: owner removes"
  on public.payout_details for delete to authenticated
  using (user_id = ledger.current_ledger_user_id());

-- 3. payment marks ----------------------------------------------------------
create table public.payment_marks (
  game_id uuid not null references public.games (id),
  from_user uuid not null references public.users (id),
  to_user uuid not null references public.users (id),
  paid_at timestamptz,
  marked_by uuid references public.users (id),
  updated_at timestamptz not null default now(),
  primary key (game_id, from_user, to_user)
);

alter table public.payment_marks enable row level security;
revoke all on public.payment_marks from anon, authenticated;
grant select on public.payment_marks to authenticated;

-- every member sees the marks; only the API (host-checked) writes them
create policy "members read payment marks"
  on public.payment_marks for select to authenticated
  using (ledger.is_game_member(game_id));

alter publication supabase_realtime add table public.payment_marks;
