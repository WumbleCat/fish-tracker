-- fish-tracker integrity triggers.
-- These run for every role including service_role: the API bypasses RLS but
-- not these. They are the database's own copy of the append-only contract.

-- ---------------------------------------------------------------------------
-- New auth user -> public.users row
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (auth_user_id, display_name, is_guest, default_currency)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1),
      'player'
    ),
    false,
    coalesce(nullif(new.raw_user_meta_data ->> 'default_currency', ''), 'GBP')
  )
  on conflict (auth_user_id) where auth_user_id is not null do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Currency immutability: locked the moment the game holds any entry
-- ---------------------------------------------------------------------------
create or replace function public.enforce_currency_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.currency is distinct from old.currency
      or new.currency_exponent is distinct from old.currency_exponent)
     and exists (select 1 from public.entries e where e.game_id = old.id)
  then
    raise exception 'currency_locked: currency is immutable once a game holds entries'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger games_currency_lock
  before update on public.games
  for each row execute function public.enforce_currency_lock();

-- ---------------------------------------------------------------------------
-- Entries are append-only: no edits to identity or amount, no deletes
-- ---------------------------------------------------------------------------
create or replace function public.enforce_entry_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.amount_minor  is distinct from old.amount_minor
     or new.entry_type is distinct from old.entry_type
     or new.game_id    is distinct from old.game_id
     or new.user_id    is distinct from old.user_id
     or new.logged_by  is distinct from old.logged_by
     or new.amends_entry_id is distinct from old.amends_entry_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'entries_append_only: amount, type, ownership and lineage are immutable — log a new entry instead'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger entries_immutable_columns
  before update on public.entries
  for each row execute function public.enforce_entry_immutability();

create or replace function public.forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ledger_no_delete: % rows are never deleted; reject, void or adjust instead', tg_table_name
    using errcode = 'P0001';
  return null;
end;
$$;

create trigger entries_no_delete
  before delete on public.entries
  for each row execute function public.forbid_delete();

create trigger settlements_no_delete
  before delete on public.settlements
  for each row execute function public.forbid_delete();

create trigger adjustments_no_delete
  before delete on public.adjustments
  for each row execute function public.forbid_delete();

-- Settlements and adjustments are written once, never edited.
create or replace function public.forbid_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ledger_write_once: % rows are written once and never updated', tg_table_name
    using errcode = 'P0001';
  return null;
end;
$$;

create trigger settlements_no_update
  before update on public.settlements
  for each row execute function public.forbid_update();

create trigger adjustments_no_update
  before update on public.adjustments
  for each row execute function public.forbid_update();

-- ---------------------------------------------------------------------------
-- Payout details: never for guests; keep updated_at honest
-- ---------------------------------------------------------------------------
create or replace function public.enforce_payout_owner_not_guest()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.users u where u.id = new.user_id and u.is_guest) then
    raise exception 'guest_not_permitted: guests cannot hold payout details'
      using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger payout_details_guard
  before insert or update on public.payout_details
  for each row execute function public.enforce_payout_owner_not_guest();

-- ---------------------------------------------------------------------------
-- Adjustments only ever reference a closed game
-- ---------------------------------------------------------------------------
create or replace function public.enforce_adjustment_targets_closed_game()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.games g where g.id = new.game_id and g.state = 'closed') then
    raise exception 'game_not_closed: adjustments only apply to closed games'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger adjustments_closed_game_only
  before insert on public.adjustments
  for each row execute function public.enforce_adjustment_targets_closed_game();
