-- fish-tracker core schema: enums, tables, indexes.
-- Money is BIGINT minor units, always positive; direction comes from entry_type.
-- Nothing in the ledger is ever deleted or has its amount updated (enforced in
-- 20260823090100_integrity_triggers.sql).

create type public.game_state as enum
  ('draft', 'open', 'running', 'settling', 'closed', 'abandoned');

create type public.entry_type as enum
  ('buy_in', 'rebuy', 'cash_out');

create type public.entry_state as enum
  ('pending', 'verified', 'rejected', 'void');

create type public.member_role as enum
  ('player', 'host');

-- One row per person in the ledger, registered or guest. A guest has no
-- auth_user_id; claiming later sets auth_user_id and flips is_guest, on the
-- SAME row — entries never move between users.
create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users (id) on delete set null,
  display_name text not null
    constraint display_name_length check (char_length(display_name) between 1 and 60),
  is_guest boolean not null default false,
  default_currency char(3) not null default 'GBP'
    constraint default_currency_iso check (default_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  -- a guest by definition has no auth identity yet
  constraint guest_has_no_auth check (is_guest = false or auth_user_id is null)
);

create unique index users_auth_user_id_key
  on public.users (auth_user_id)
  where auth_user_id is not null;

-- Separate table so bank details are never joined in by accident and carry
-- their own tight RLS. Guests may not have a row (trigger-enforced).
create table public.payout_details (
  user_id uuid primary key references public.users (id),
  account_name text
    constraint account_name_length check (char_length(account_name) between 1 and 100),
  sort_code text
    constraint sort_code_format check (sort_code ~ '^[0-9]{6}$'),
  account_number text
    constraint account_number_format check (account_number ~ '^[0-9]{8}$'),
  payment_reference text
    constraint payment_reference_length check (char_length(payment_reference) between 1 and 200),
  updated_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint name_length check (char_length(name) between 1 and 80),
  -- short, uppercase, ambiguity-free alphabet (no 0/O/1/I)
  join_code text not null unique
    constraint join_code_format check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  state public.game_state not null default 'draft',
  host_id uuid not null references public.users (id),
  currency char(3) not null default 'GBP'
    constraint currency_iso check (currency ~ '^[A-Z]{3}$'),
  currency_exponent smallint not null default 2
    constraint currency_exponent_range check (currency_exponent between 0 and 4),
  stake_minor bigint
    constraint stake_positive check (stake_minor is null or stake_minor > 0),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  version integer not null default 1,
  constraint closed_at_iff_closed check ((state = 'closed') = (closed_at is not null))
);

create index games_host_id_idx on public.games (host_id);

create table public.game_members (
  game_id uuid not null references public.games (id),
  user_id uuid not null references public.users (id),
  role public.member_role not null default 'player',
  joined_at timestamptz not null default now(),
  departed_at timestamptz,
  departed_unsettled boolean not null default false,
  primary key (game_id, user_id),
  constraint departed_unsettled_requires_departed
    check (departed_unsettled = false or departed_at is not null)
);

create index game_members_user_id_idx on public.game_members (user_id);

-- The ledger. Append-only: state changes and new linked rows, never edits to
-- amounts, never deletes.
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id),
  user_id uuid not null references public.users (id),
  entry_type public.entry_type not null,
  amount_minor bigint not null,
  state public.entry_state not null default 'pending',
  created_at timestamptz not null default now(),
  -- the entry belongs to user_id; logged_by is whoever performed the action
  -- (the host may log on a player's behalf)
  logged_by uuid not null references public.users (id),
  verified_by uuid references public.users (id),
  verified_at timestamptz,
  rejection_note text,
  void_reason text,
  amends_entry_id uuid references public.entries (id),
  version integer not null default 1,
  constraint amount_positive check (amount_minor > 0),
  constraint verified_fields_together check ((verified_by is null) = (verified_at is null)),
  constraint void_requires_reason check (state <> 'void' or void_reason is not null)
);

create index entries_game_id_idx on public.entries (game_id);
create index entries_user_id_idx on public.entries (user_id);
create index entries_logged_by_idx on public.entries (logged_by);
create index entries_verified_by_idx on public.entries (verified_by) where verified_by is not null;
create index entries_amends_entry_id_idx on public.entries (amends_entry_id) where amends_entry_id is not null;

-- At most one PENDING cash-out per player per game. Decided 2026-08-23: a
-- player who rebuys after a verified cash-out gets a fresh cash-out slot, so
-- 'verified' is deliberately NOT in this predicate; the service layer rejects
-- a new cash-out unless every existing verified one predates a later verified
-- buy-in/rebuy.
create unique index one_active_cashout
  on public.entries (game_id, user_id)
  where entry_type = 'cash_out' and state = 'pending';

-- Written once at close; the settlement a player saw must stay retrievable.
-- payments is [{from_user, to_user, amount_minor}] — user ids only, NEVER
-- payout details.
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null unique references public.games (id),
  computed_at timestamptz not null default now(),
  payments jsonb not null,
  discrepancy_minor bigint not null default 0,
  acknowledged_by uuid references public.users (id),
  constraint discrepancy_requires_acknowledgement
    check (discrepancy_minor = 0 or acknowledged_by is not null)
);

create index settlements_acknowledged_by_idx
  on public.settlements (acknowledged_by) where acknowledged_by is not null;

-- Corrections against a CLOSED game sit beside the original settlement and
-- never alter it. Amounts positive; direction from the credit/debit field.
create table public.adjustments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id),
  user_id uuid not null references public.users (id),
  direction text not null
    constraint direction_valid check (direction in ('credit', 'debit')),
  amount_minor bigint not null
    constraint adjustment_amount_positive check (amount_minor > 0),
  note text not null
    constraint note_length check (char_length(note) between 1 and 500),
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create index adjustments_game_id_idx on public.adjustments (game_id);
create index adjustments_user_id_idx on public.adjustments (user_id);
create index adjustments_created_by_idx on public.adjustments (created_by);
