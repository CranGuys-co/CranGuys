// Public settings for CranGuys's online services (Supabase). See SUPABASE_SETUP.md.
//
// Paste your project's URL and publishable key here (Supabase dashboard → Project Settings → API Keys). The
// publishable key is meant to be in browser code: on its own it can only do what the Row Level Security rules
// in supabase/migrations allow. The secret key must NEVER go here or anywhere in this repository; only the
// cg-api Edge Function uses it, and Supabase hands it over on its own servers.
//
// While these are empty the game works exactly as before: guests only, progress on this device, and online
// play through the public brokers.
export const SUPABASE_URL = 'https://ojyjxspkxteasphfmosr.supabase.co';              // e.g. 'https://abcdefghijklmnopqrst.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_8-LLvyqBTBE2_Nd1x9QTLw_DDaz4szd';  // e.g. 'sb_publishable_…'

// Where the sign-in session is kept in this browser (localStorage key).
export const AUTH_STORAGE_KEY = 'cranguys.auth';

// Tests and trying out a project before publishing it: window.CG_SUPABASE = { url, key }, or the same JSON in
// localStorage 'cg.supabase'. Set CG_SUPABASE = false (or localStorage 'cg.supabase' = 'off') to switch it off.
export function supabaseSettings() {
  let o = null;
  try {
    o = typeof window !== 'undefined' && 'CG_SUPABASE' in window ? window.CG_SUPABASE : JSON.parse(localStorage.getItem('cg.supabase') || 'null');
  } catch { o = null; }
  if (o === false || o === 'off') return null;
  const url = (o && o.url) || SUPABASE_URL, key = (o && o.key) || SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  let base = String(url).trim();
  try { base = new URL(base).origin; } catch { base = base.replace(/\/+$/, ''); } // just https://<ref>.supabase.co, even if /rest/v1/ was pasted too
  return { url: base, key: String(key).trim() };
}
// Is there a Supabase project to talk to?
export const cloudOn = () => !!supabaseSettings();
