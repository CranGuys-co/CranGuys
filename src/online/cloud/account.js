// Accounts: sign in with a code emailed to you (no passwords), sign out, and calls to the cg-api Edge Function,
// which does everything that changes a signed-in player's progress (supabase/functions/cg-api/handler.js).
import { getClient } from './client.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (e) => String(e || '').trim().toLowerCase();

// Email a sign-in code (and link). New emails get an account made for them.
export async function sendCode(email) {
  email = cleanEmail(email);
  if (!EMAIL.test(email)) throw new Error('That doesn’t look like an email address.');
  const sb = await getClient();
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
  if (error) throw new Error(/rate|seconds/i.test(error.message) ? 'Too many emails — wait a minute and try again.' : error.message);
  return email;
}

// Type in the code from the email.
export async function verifyCode(email, code) {
  const token = String(code || '').replace(/\D/g, '');
  if (token.length < 6) throw new Error('The code is the 6 numbers in the email.');
  const sb = await getClient();
  const { data, error } = await sb.auth.verifyOtp({ email: cleanEmail(email), token, type: 'email' });
  if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code didn’t work — check it, or ask for a new one (only the newest email works).' : error.message);
  return data.user;
}

export async function currentUser() {
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}

// Signed in or out somewhere else (another tab, the emailed link, an expired session).
export async function onAuthChange(fn) {
  const sb = await getClient();
  sb.auth.onAuthStateChange((event, session) => setTimeout(() => fn(event, session ? session.user : null), 0));
}

export async function signOut() {
  const sb = await getClient();
  await sb.auth.signOut({ scope: 'local' }).catch(() => {});
}

// Call cg-api. Refusals (not enough Cranberries, name taken…) throw an Error with the message to show and
// .code; a network problem throws with .net = true so the caller can try again.
export async function call(action, body = {}) {
  const sb = await getClient();
  let res;
  try { res = await sb.functions.invoke('cg-api', { body: { action, ...body } }); }
  catch (e) { const err = new Error('Couldn’t reach the game server — check your connection.'); err.net = true; throw err; }
  const { data, error } = res;
  if (!error) return data;
  const ctx = error.context;
  if (ctx && typeof ctx.json === 'function' && ctx.status) {
    let j = {}; try { j = await ctx.json(); } catch { /* not JSON */ }
    const err = new Error(j.message || 'Something went wrong — try again.');
    err.code = j.error || 'error'; err.status = ctx.status; err.net = ctx.status >= 500;
    throw err;
  }
  const err = new Error('Couldn’t reach the game server — check your connection.'); err.net = true; throw err;
}
