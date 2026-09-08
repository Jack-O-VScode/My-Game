/**
 * Accounts: sign up, sign in, and keeping one save in step across
 * devices.
 *
 * The password is only ever posted to the database function that hashes
 * it — it is never stored, logged, or kept in memory after the call. What
 * lives on the device is a session token, which the server holds only as
 * a SHA-256 hash and can expire or revoke.
 */

import { rpc } from './online.js';
import { normalise } from './engine.js';

const SESSION_KEY = 'pet-rock-session';

let session = null; // { token, username, accountId, expiresAt }

/* ------------------------------- storage ------------------------------ */

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.token === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeSession(value) {
  try {
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode: the session simply will not survive a reload */
  }
}

export function current() {
  if (!session) session = readSession();
  return session;
}

export function isSignedIn() {
  return Boolean(current()?.token);
}

export function username() {
  return current()?.username || null;
}

export function accountId() {
  return current()?.accountId || null;
}

/* ------------------------------ validation ---------------------------- */

/** Mirrors the checks in schema.sql so mistakes are caught before a round trip. */
export function validateCredentials(name, password) {
  const clean = String(name || '').trim();
  if (clean.length < 3 || clean.length > 18) {
    return { ok: false, error: 'Username must be 3 to 18 characters.' };
  }
  if (!/^[A-Za-z0-9 _.-]+$/.test(clean)) {
    return { ok: false, error: 'Letters, numbers, spaces, dot, dash and underscore only.' };
  }
  if (String(password || '').length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  return { ok: true, username: clean };
}

/* ------------------------------- payloads ----------------------------- */

function adopt(payload) {
  session = {
    token: payload.token,
    username: payload.username,
    accountId: payload.account_id,
    expiresAt: payload.expires_at || null,
  };
  writeSession(session);
  return session;
}

/** The save the server holds, repaired, or null if the account is new. */
function serverState(payload, now) {
  const save = payload?.save;
  if (!save || typeof save !== 'object' || !('level' in save)) return null;
  const state = normalise(save, now);
  state.rockName = payload.rock_name || state.rockName;
  return state;
}

/* -------------------------------- actions ----------------------------- */

/**
 * Creates an account and carries this device's current progress into it,
 * so registering never costs a player the rock they already have.
 */
export async function register(name, password, rockName, state, now = Date.now()) {
  const checked = validateCredentials(name, password);
  if (!checked.ok) return { ok: false, error: 'invalid', message: checked.error };

  const result = await rpc('register', {
    p_username: checked.username,
    p_password: password,
    p_rock: rockName,
    p_state: state || {},
  });
  if (!result.ok) return result;

  adopt(result.data);
  return { ok: true, session, state: serverState(result.data, now) };
}

export async function login(name, password, now = Date.now()) {
  const clean = String(name || '').trim();
  if (!clean || !password) return { ok: false, message: 'Enter your username and password.' };

  const result = await rpc('login', { p_username: clean, p_password: password });
  if (!result.ok) return result;

  adopt(result.data);
  return { ok: true, session, state: serverState(result.data, now) };
}

/** Picks the account back up from a stored token, with no password. */
export async function resume(now = Date.now()) {
  const saved = current();
  if (!saved?.token) return { ok: false, error: 'no-session' };

  const result = await rpc('resume', { p_token: saved.token });
  if (!result.ok) {
    // A rejected token is spent: drop it rather than retrying forever.
    if (result.error === 'http-400' || result.error === 'http-401') signOutLocal();
    return result;
  }

  adopt({ ...result.data, token: saved.token });
  return {
    ok: true,
    session,
    state: serverState(result.data, now),
    clock: Number(result.data?.client_clock) || 0,
  };
}

export function signOutLocal() {
  session = null;
  writeSession(null);
}

export async function signOut() {
  const saved = current();
  signOutLocal();
  if (saved?.token) await rpc('sign_out', { p_token: saved.token });
  return { ok: true };
}

/**
 * Pushes progress and takes back whatever the server considers current.
 * The higher client clock wins, so a second device that has been played
 * more recently is adopted rather than overwritten.
 */
export async function sync(state, now = Date.now()) {
  const saved = current();
  if (!saved?.token) return { ok: false, error: 'no-session' };

  const result = await rpc('sync_pet', {
    p_token: saved.token,
    p_state: state,
    p_clock: Math.floor(state.lastTick || 0),
  });
  if (!result.ok) {
    if (result.error === 'http-400' || result.error === 'http-401') signOutLocal();
    return result;
  }

  const theirs = serverState(result.data, now);
  const theirClock = Number(result.data?.client_clock) || 0;
  const ourClock = Math.floor(state.lastTick || 0);
  return {
    ok: true,
    // Only hand back a different save when the server really is ahead.
    state: theirs && theirClock > ourClock ? theirs : null,
  };
}
