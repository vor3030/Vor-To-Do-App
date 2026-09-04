// =====================================================================
// Vor-To-Do — Supabase configuration
//
// 1. Create a free project at https://supabase.com
// 2. In the dashboard, open the SQL Editor and run supabase-setup.sql
// 3. Go to Project Settings → API:
//      - Copy the "Project URL"  → paste below as url
//      - Copy the "anon public" key → paste below as anonKey
//
// The anon key is safe to expose in the browser — your data is
// protected by Row Level Security (see supabase-setup.sql).
// =====================================================================

window.SUPABASE_CONFIG = {
    url: 'YOUR_SUPABASE_URL',       // e.g. 'https://abcdefghij.supabase.co'
    anonKey: 'YOUR_SUPABASE_ANON_KEY'
};
