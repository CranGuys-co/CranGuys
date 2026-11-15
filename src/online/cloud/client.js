// The Supabase client, loaded only when it's needed: with no project set up (or a guest who never goes online)
// the game never downloads it.
import { supabaseSettings, AUTH_STORAGE_KEY } from './config.js';

let clientPromise = null;

export function getClient() {
  if (!clientPromise) {
    const s = supabaseSettings();
    if (!s) return Promise.reject(new Error('Online accounts aren’t set up for this copy of the game.'));
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(s.url, s.key, {
        auth: {
          storageKey: AUTH_STORAGE_KEY,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'implicit', // the emailed link works even if it's opened in another browser
        },
        realtime: { params: { eventsPerSecond: 20 } },
      }),
    ).catch((e) => { clientPromise = null; throw e; });
  }
  return clientPromise;
}

// True if this browser was signed in before, or has just come back from a sign-in link.
export function hasSessionHint() {
  try { if (localStorage.getItem(AUTH_STORAGE_KEY)) return true; } catch { /* storage blocked */ }
  return typeof location !== 'undefined' && /access_token=|error_description=|error_code=/.test(location.hash || '');
}

// Call a database function (the public ones in supabase/migrations: leaderboard, records, rooms, counts).
export async function rpc(name, args = {}) {
  const sb = await getClient();
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message || 'Database error');
  return data;
}
