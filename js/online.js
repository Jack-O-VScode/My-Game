/**
 * Supabase transport: project configuration, calling database functions,
 * and reading the shared leaderboard. Accounts are handled in account.js.
 *
 * Everything here fails soft. If Supabase is not configured, the network
 * is down, or the server answers with an error, the caller gets a plain
 * `{ ok: false, error }` and the game falls back to local practice
 * rivals — the game itself never depends on the network.
 */

import { SUPABASE } from './config.js';

/** Local override of the built-in keys, for trying a project out. */
const CONFIG_KEY = 'pet-rock-supabase';

const TIMEOUT_MS = 8000;
const BOARD_LIMIT = 100;

/**
 * Named columns only: `select=*` would reach for password hashes, which
 * carry no grant. `accounts(username)` follows the foreign key, and
 * `equipped` is what lets the board draw everyone's actual rock.
 */
const COLUMNS = 'account_id,rock_name,level,xp,best_level,care,equipped,badges,updated_at,accounts(username)';

/* ------------------------------- storage ------------------------------ */

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------- config ------------------------------ */

/** Built-in keys from config.js, overridden by anything saved locally. */
export function config() {
  const override = readJson(CONFIG_KEY) || {};
  const url = normaliseUrl(override.url || SUPABASE.url);
  const anonKey = String(override.anonKey || SUPABASE.anonKey || '').trim();
  return { url, anonKey, local: Boolean(override.url && override.anonKey) };
}

export function normaliseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function isConfigured() {
  const { url, anonKey } = config();
  return Boolean(url && anonKey);
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Validates a pasted project URL + anon key. Pure, so it is unit tested. */
export function validateConfig(url, anonKey) {
  const cleanUrl = normaliseUrl(url);
  const cleanKey = String(anonKey || '').trim();
  if (!cleanUrl && !cleanKey) return { ok: false, error: 'Enter your project URL and anon key.' };

  let parsed;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    return { ok: false, error: 'Project URL should look like https://abcdefg.supabase.co' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Project URL should start with https://' };
  }
  // Plain http is allowed only against your own machine — a self-hosted
  // instance or the mock server — never for sending a key across a network.
  if (parsed.protocol === 'http:' && !LOCAL_HOSTS.has(parsed.hostname)) {
    return { ok: false, error: 'Use https:// so your key is not sent in the clear.' };
  }
  if (!parsed.hostname) return { ok: false, error: 'That URL has no host name.' };
  if (cleanKey.length < 20) return { ok: false, error: 'That anon key looks too short.' };

  return { ok: true, url: cleanUrl, anonKey: cleanKey };
}

export function saveConfig(url, anonKey) {
  const checked = validateConfig(url, anonKey);
  if (!checked.ok) return checked;
  writeJson(CONFIG_KEY, { url: checked.url, anonKey: checked.anonKey });
  return { ok: true };
}

export function clearConfig() {
  writeJson(CONFIG_KEY, null);
}

/* ------------------------------- requests ----------------------------- */

async function request(path, options = {}) {
  const { url, anonKey } = config();
  if (!url || !anonKey) return { ok: false, error: 'not-configured' };
  if (globalThis.navigator && navigator.onLine === false) return { ok: false, error: 'offline' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `http-${res.status}`, detail: detail.slice(0, 300) };
    }
    return { ok: true, res };
  } catch (err) {
    return { ok: false, error: err?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls a database function. Errors come back with the message the
 * function raised ("That username is taken"), which is written to be
 * shown to the player as-is.
 */
export async function rpc(name, body) {
  const result = await request(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

  if (!result.ok) {
    let message = '';
    try {
      message = JSON.parse(result.detail || '{}').message || '';
    } catch {
      message = '';
    }
    return { ...result, message };
  }

  const text = await result.res.text().catch(() => '');
  if (!text) return { ok: true, data: null };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'bad-response' };
  }
}

const clampInt = (value, lo, hi, fallback) => {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

const text = (value, fallback) => {
  const s = String(value ?? '').trim().slice(0, 18);
  return s || fallback;
};

/**
 * Turns rows from PostgREST into leaderboard entries. Pure, and defensive:
 * these rows are written by other players, so nothing is trusted.
 */
export function rowsToEntries(rows, accountId) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === 'object' && typeof row.account_id === 'string')
    .map((row) => ({
      id: `pet-${row.account_id}`,
      keeper: text(row.accounts?.username, 'Keeper'),
      rock: text(row.rock_name, 'Pebbles'),
      level: clampInt(row.level, 1, 999, 1),
      xp: clampInt(row.xp, 0, 1000000, 0),
      care: clampInt(row.care, 0, 100, 0),
      badges: clampInt(row.badges, 0, 999, 0),
      equipped: row.equipped && typeof row.equipped === 'object' ? row.equipped : {},
      isPlayer: row.account_id === accountId,
      online: true,
    }));
}

/** Fetches the top of the board. */
export async function fetchBoard(accountId, limit = BOARD_LIMIT) {
  const query = `/rest/v1/pets?select=${COLUMNS}&order=level.desc,xp.desc&limit=${limit}`;
  const result = await request(query, { method: 'GET' });
  if (!result.ok) return result;
  const rows = await result.res.json().catch(() => null);
  if (!Array.isArray(rows)) return { ok: false, error: 'bad-response' };
  return { ok: true, entries: rowsToEntries(rows, accountId) };
}

/** Human-readable reason for a failed call, for the status line. */
export function describeError(error, detail = '', message = '') {
  if (message) return message;
  switch (error) {
    case 'not-configured': return 'No Supabase project connected';
    case 'offline': return 'This device is offline';
    case 'timeout': return 'Supabase did not answer in time';
    case 'network': return 'Could not reach Supabase';
    case 'bad-response': return 'Supabase sent an unexpected reply';
    case 'http-401':
    case 'http-403': return 'Supabase rejected the key — check the anon key and that schema.sql ran';
    case 'http-404': return 'Tables or functions missing — run supabase/schema.sql';
    default:
      return detail ? `Supabase error (${error})` : `Supabase error (${error})`;
  }
}
