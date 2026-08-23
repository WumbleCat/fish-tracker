-- Two additions the mobile client needs from the schema (mobile-design):
--
-- 1. entries.client_key — a client-generated idempotency key for the offline
--    entry queue. A flaky reconnect replaying the same queued buy-in must not
--    log it twice; the unique index makes the replay collapse onto the
--    original row. Applies only to entry creation (append-only inserts are
--    safe to replay); verifications and state changes are never queued.
--
-- 2. push_tokens — one Expo push token per device per user, so the host's
--    phone hears about new pending entries. Tokens are credentials-adjacent:
--    RLS denies clients entirely (API writes via service role only).

alter table public.entries add column client_key uuid;

create unique index entries_client_key_unique
  on public.entries (game_id, user_id, client_key)
  where client_key is not null;

create table public.push_tokens (
  user_id uuid not null references public.users (id),
  token text not null
    constraint token_length check (char_length(token) between 1 and 400),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
-- no policies on purpose: nothing reaches this table except the service role
