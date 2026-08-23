import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
// Placeholder keeps module import safe in tests; real key comes from .env.
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'public-anon-key-not-configured';

export const supabase = createClient(url, anonKey);
