-- Realtime on the two tables clients subscribe to. The event is a
-- cache-invalidation signal only — clients refetch through the API and never
-- derive a net from the payload. RLS (20260823090200) governs who receives
-- events.

alter publication supabase_realtime add table public.entries;
alter publication supabase_realtime add table public.game_members;
