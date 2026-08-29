-- Who seated a player, and therefore who can be handed the game
-- (app-logic, 2026-08-29).
--
-- A guest may now receive host by transfer. A host-added player never may:
-- that row holds no credential (nothing was ever minted for it), so handing
-- it the game would strand the ledger with nobody able to verify or close.
--
-- Until now the two kinds of guest were deliberately indistinguishable —
-- the absence of a token was the whole state. Eligibility makes the
-- difference load-bearing, so it becomes a column: who put this person at
-- the table. NULL means they seated themselves, with a code, on a device
-- they hold. That is the same fact the audit trail wants anyway.

alter table public.game_members
  add column seated_by uuid references public.users (id);

comment on column public.game_members.seated_by is
  'The host who seated this player, when they did not join themselves. NULL means they joined with the code and hold a credential — only such a member can be handed the game.';

-- Backfill. Host-added players first became possible when the feature
-- deployed on 2026-08-28 20:30 UTC, so anything older joined itself. Among
-- the rows since, a guest who has never logged an entry *for themselves*
-- cannot be shown to hold a token, so it is marked host-seated. The error
-- runs one way on purpose: a mislabelled row cannot be handed the game,
-- which costs a little convenience, where the opposite would brick a table.
update public.game_members gm
set seated_by = g.host_id
from public.games g, public.users u
where gm.game_id = g.id
  and gm.user_id = u.id
  and gm.user_id <> g.host_id
  and u.is_guest
  and u.created_at >= timestamptz '2026-08-28 20:30:00+00'
  and not exists (
    select 1 from public.entries e
    where e.user_id = u.id and e.logged_by = u.id
  );
