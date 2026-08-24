-- A Revolut payment link as a first-class payout option beside the UK bank
-- fields. It's a public, shareable link — unlike the account number it needs
-- no masking — but the same visibility rules apply: co-players of a shared
-- unsettled (or recently closed) game only, via the existing payout_details
-- RLS. Format check is a typo-catcher, not verification, per app-logic.
alter table public.payout_details add column revolut_link text
  constraint revolut_link_format check (
    revolut_link is null
    or revolut_link ~ '^(https://)?revolut\.me/[A-Za-z0-9._-]{2,64}$'
  );
