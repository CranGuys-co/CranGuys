// Supabase Edge Function entry point for cg-api (the rules are in handler.js).
// Uses the project's secret key, which Supabase provides to the function on its own servers only. It never
// goes in the game's code or this repository.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { handle, CORS } from './handler.js';

function secretKey(): string {
  const named = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (named) {
    try {
      const keys = JSON.parse(named) as Record<string, string>;
      const key = keys.default ?? Object.values(keys)[0];
      if (key) return key;
    } catch {
      // fall through to the single-key variables
    }
  }
  return Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

const url = Deno.env.get('SUPABASE_URL') ?? '';
const key = secretKey();
const admin = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;

const PROFILE = 'data, rev, last_result_at, banned';
const BOOKING = 'user_id, kind, rp_from, booked_at, res, place, won, settled_at';
const unique = (e: { code?: string; message?: string } | null, name: string) => !!e && e.code === '23505' && String(e.message).includes(name);

const db = {
  async userFromToken(token: string): Promise<string | null> {
    const { data, error } = await admin!.auth.getUser(token);
    return error || !data?.user ? null : data.user.id;
  },
  async load(uid: string) {
    const { data, error } = await admin!.from('cg_profiles').select(PROFILE).eq('user_id', uid).maybeSingle();
    if (error) throw error;
    return data;
  },
  async insert(row: Record<string, unknown>) {
    const { error } = await admin!.from('cg_profiles').insert(row);
    if (!error) return 'ok';
    if (unique(error, 'cg_profiles_name_key')) return 'name_taken';
    if (unique(error, 'cg_profiles_pkey')) return 'exists';
    throw error;
  },
  async update(uid: string, rev: number, cols: Record<string, unknown>) {
    const { data, error } = await admin!.from('cg_profiles').update(cols).eq('user_id', uid).eq('rev', rev).select('rev');
    if (unique(error, 'cg_profiles_name_key')) return 'name_taken';
    if (error) throw error;
    return data && data.length ? 'ok' : 'conflict';
  },
  async bookings(mid: string) {
    const { data, error } = await admin!.from('cg_ranked').select(BOOKING).eq('mid', mid).limit(80);
    if (error) throw error;
    return data ?? [];
  },
  async book(row: Record<string, unknown>) {
    const { error } = await admin!.from('cg_ranked').upsert(row, { onConflict: 'mid,user_id', ignoreDuplicates: true });
    if (error) throw error;
  },
  async settle(mid: string, uid: string, cols: Record<string, unknown>) {
    const { error } = await admin!.from('cg_ranked').update(cols).eq('mid', mid).eq('user_id', uid).is('settled_at', null);
    if (error) throw error;
  },
  async setRecord(map: string, uid: string, name: string, ms: number, color: string, tag: string | null) {
    const { data, error } = await admin!.rpc('cg_set_record', { p_map: map, p_user: uid, p_name: name, p_ms: ms, p_color: color, p_tag: tag });
    if (error) throw error;
    return !!data;
  },
  async deleteUser(uid: string) {
    const { error } = await admin!.auth.admin.deleteUser(uid);
    if (error) throw error;
  },
};

Deno.serve(async (req: Request) => {
  if (!admin) {
    console.error('cg-api: SUPABASE_URL or the secret key is missing from the function environment');
    return new Response(JSON.stringify({ error: 'server_not_configured', message: 'The game server isn’t set up yet.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  try {
    return await handle(req, db);
  } catch (e) {
    console.error('cg-api failed', e);
    return new Response(JSON.stringify({ error: 'server_error', message: 'Something went wrong on the server — try again.' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
