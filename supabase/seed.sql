-- Dev seed: LOCAL STACK ONLY (`supabase db reset`). Never apply to the hosted
-- project. Produces one finished, balanced game and one mid-flight game with
-- pending, rejected and amended entries.
--
-- Sign in as alice@example.com / password123 or bob@example.com / password123.

do $$
declare
  alice_auth uuid := '11111111-1111-1111-1111-111111111111';
  bob_auth   uuid := '22222222-2222-2222-2222-222222222222';
  alice_id uuid;
  bob_id   uuid;
  charlie_id uuid := '33333333-3333-3333-3333-333333333333'; -- guest
  g1 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';         -- finished
  g2 uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';         -- mid-flight
  e_rejected uuid;
begin
  -- --- auth users (local GoTrue accepts direct inserts) --------------------
  insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
     confirmation_token, recovery_token, email_change_token_new, email_change)
  values
    ('00000000-0000-0000-0000-000000000000', alice_auth, 'authenticated', 'authenticated',
     'alice@example.com', crypt('password123', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"display_name":"Alice"}',
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', bob_auth, 'authenticated', 'authenticated',
     'bob@example.com', crypt('password123', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"display_name":"Bob"}',
     now(), now(), '', '', '', '');

  insert into auth.identities
    (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), alice_auth, alice_auth::text,
     jsonb_build_object('sub', alice_auth::text, 'email', 'alice@example.com', 'email_verified', true),
     'email', now(), now(), now()),
    (gen_random_uuid(), bob_auth, bob_auth::text,
     jsonb_build_object('sub', bob_auth::text, 'email', 'bob@example.com', 'email_verified', true),
     'email', now(), now(), now());

  -- public.users rows were created by the on_auth_user_created trigger
  select id into alice_id from public.users where auth_user_id = alice_auth;
  select id into bob_id   from public.users where auth_user_id = bob_auth;

  -- guest: a users row with no auth identity, scoped to g2
  insert into public.users (id, auth_user_id, display_name, is_guest)
  values (charlie_id, null, 'Charlie', true);

  -- alice keeps payout details so the settle screens have something to render
  insert into public.payout_details (user_id, account_name, sort_code, account_number)
  values (alice_id, 'A Example', '040004', '12345678');

  -- --- game 1: finished and balanced ---------------------------------------
  -- alice: buy-ins 10000, cash-out 4000  -> net -6000
  -- bob:   buy-in   5000, cash-out 11000 -> net +6000
  insert into public.games (id, name, join_code, state, host_id, currency, currency_exponent, stake_minor, created_at, closed_at)
  values (g1, 'Friday at Alice''s', 'ABCD22', 'closed', alice_id, 'GBP', 2, 5000,
          now() - interval '7 days', now() - interval '7 days' + interval '5 hours');

  insert into public.game_members (game_id, user_id, role, joined_at) values
    (g1, alice_id, 'host',   now() - interval '7 days'),
    (g1, bob_id,   'player', now() - interval '7 days');

  insert into public.entries (game_id, user_id, entry_type, amount_minor, state, created_at, logged_by, verified_by, verified_at) values
    (g1, alice_id, 'buy_in',   5000,  'verified', now() - interval '7 days' + interval '10 minutes', alice_id, alice_id, now() - interval '7 days' + interval '11 minutes'),
    (g1, bob_id,   'buy_in',   5000,  'verified', now() - interval '7 days' + interval '12 minutes', bob_id,   alice_id, now() - interval '7 days' + interval '13 minutes'),
    (g1, alice_id, 'rebuy',    5000,  'verified', now() - interval '7 days' + interval '2 hours',    alice_id, alice_id, now() - interval '7 days' + interval '2 hours 1 minute'),
    (g1, alice_id, 'cash_out', 4000,  'verified', now() - interval '7 days' + interval '4 hours 50 minutes', alice_id, alice_id, now() - interval '7 days' + interval '4 hours 55 minutes'),
    (g1, bob_id,   'cash_out', 11000, 'verified', now() - interval '7 days' + interval '4 hours 51 minutes', bob_id,   alice_id, now() - interval '7 days' + interval '4 hours 55 minutes');

  insert into public.settlements (game_id, computed_at, payments, discrepancy_minor)
  values (g1, now() - interval '7 days' + interval '5 hours',
          jsonb_build_array(jsonb_build_object(
            'from_user', alice_id, 'to_user', bob_id, 'amount_minor', 6000)),
          0);

  -- --- game 2: mid-flight, hosted by bob ------------------------------------
  -- verified buy-ins: bob 2000, alice 2000, charlie 2000
  -- charlie has a pending rebuy; alice mistyped a rebuy (rejected) and amended it
  insert into public.games (id, name, join_code, state, host_id, currency, currency_exponent, stake_minor, created_at)
  values (g2, 'Tonight at Bob''s', 'XYZW34', 'running', bob_id, 'GBP', 2, 2000, now() - interval '2 hours');

  insert into public.game_members (game_id, user_id, role, joined_at) values
    (g2, bob_id,     'host',   now() - interval '2 hours'),
    (g2, alice_id,   'player', now() - interval '110 minutes'),
    (g2, charlie_id, 'player', now() - interval '100 minutes');

  insert into public.entries (game_id, user_id, entry_type, amount_minor, state, created_at, logged_by, verified_by, verified_at) values
    (g2, bob_id,     'buy_in', 2000, 'verified', now() - interval '115 minutes', bob_id,     bob_id, now() - interval '114 minutes'),
    (g2, alice_id,   'buy_in', 2000, 'verified', now() - interval '109 minutes', alice_id,   bob_id, now() - interval '108 minutes'),
    (g2, charlie_id, 'buy_in', 2000, 'verified', now() - interval '99 minutes',  charlie_id, bob_id, now() - interval '98 minutes');

  insert into public.entries (game_id, user_id, entry_type, amount_minor, state, created_at, logged_by) values
    (g2, charlie_id, 'rebuy', 2000, 'pending', now() - interval '20 minutes', charlie_id);

  insert into public.entries (game_id, user_id, entry_type, amount_minor, state, created_at, logged_by, rejection_note)
  values (g2, alice_id, 'rebuy', 4000, 'rejected', now() - interval '30 minutes', alice_id, 'You put in 20, not 40')
  returning id into e_rejected;

  insert into public.entries (game_id, user_id, entry_type, amount_minor, state, created_at, logged_by, amends_entry_id)
  values (g2, alice_id, 'rebuy', 2000, 'pending', now() - interval '25 minutes', alice_id, e_rejected);
end $$;
