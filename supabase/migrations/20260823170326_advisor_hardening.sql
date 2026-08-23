-- Advisor hardening. get_advisors (security) flagged, after the initial apply:
--   0028: public.handle_new_auth_user() executable by anon (SECURITY DEFINER)
--   0029: the SECURITY DEFINER RLS helpers executable by authenticated
-- RLS policies evaluate these helpers as the querying role, so `authenticated`
-- must keep EXECUTE; the fix is to move them to `ledger`, a schema PostgREST
-- does not expose, so /rest/v1/rpc/* can no longer reach them.
-- ALTER ... SET SCHEMA preserves function OIDs, so every policy keeps working;
-- bodies are then re-created because their schema-qualified cross-references
-- still say `public.`.

create schema if not exists ledger;
revoke all on schema ledger from public;
grant usage on schema ledger to authenticated, service_role;

alter function public.jwt_is_guest() set schema ledger;
alter function public.jwt_game_id() set schema ledger;
alter function public.current_ledger_user_id() set schema ledger;
alter function public.is_game_member(uuid) set schema ledger;
alter function public.shares_game_with(uuid) set schema ledger;
alter function public.payout_visible_to_current(uuid) set schema ledger;

create or replace function ledger.current_ledger_user_id()
returns uuid
language sql stable
security definer
set search_path = ''
as $$
  select case
    when ledger.jwt_is_guest() then (select auth.uid())
    else (select u.id from public.users u where u.auth_user_id = (select auth.uid()))
  end
$$;

create or replace function ledger.is_game_member(g uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select (not ledger.jwt_is_guest() or ledger.jwt_game_id() = g)
     and exists (
       select 1 from public.game_members gm
       where gm.game_id = g
         and gm.user_id = ledger.current_ledger_user_id()
     )
$$;

create or replace function ledger.shares_game_with(target uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.game_members me
    join public.game_members them on them.game_id = me.game_id
    where me.user_id = ledger.current_ledger_user_id()
      and them.user_id = target
      and (not ledger.jwt_is_guest() or ledger.jwt_game_id() = me.game_id)
  )
$$;

create or replace function ledger.payout_visible_to_current(owner_id uuid)
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
    where me.user_id = ledger.current_ledger_user_id()
      and them.user_id = owner_id
      and (g.closed_at is null or g.closed_at > now() - interval '7 days')
      and (not ledger.jwt_is_guest() or ledger.jwt_game_id() = g.id)
  )
$$;

-- Trigger functions need no caller EXECUTE: triggers fire regardless of the
-- DML role's privileges on the function (checked only at CREATE TRIGGER time).
revoke execute on function
  public.handle_new_auth_user(),
  public.enforce_currency_lock(),
  public.enforce_entry_immutability(),
  public.forbid_delete(),
  public.forbid_update(),
  public.enforce_payout_owner_not_guest(),
  public.enforce_adjustment_targets_closed_game()
from public, anon, authenticated;
