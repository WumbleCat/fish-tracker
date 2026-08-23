-- State changes are part of the live experience: "stop play & settle" and
-- close must flip every client's screen without a refresh. entries and
-- game_members were already published; games UPDATE events complete the set.
-- RLS still governs who receives events.
alter publication supabase_realtime add table public.games;
