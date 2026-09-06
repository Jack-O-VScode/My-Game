/**
 * Supabase-backed online leaderboard.
 *
 * There are no accounts. Each device mints a device_id plus a private
 * secret on first run and keeps them outside the save file, so "Start
 * over" replaces the pet on the board rather than adding a second one:
 * one pet per device, for the life of that browser profile.
 *
 * Everything here fails soft. If Supabase is not configured, the network
 * is down, or the server answers with an error, the caller gets a plain
 * `{ ok: false, error }` and the game falls back to local practice
 * rivals — the game itself never depends on the network.
 */

import { SUPABASE } from './config.js';

/** Kept apart from the save so wiping the pet keeps the same board row. */
const DEVICE_KEY = 'pet-rock-device';
/** Local override of the built-in keys, for trying it out before deploying. */
const CONFIG_KEY = 'pet-rock-supabase';

const TIMEOUT_MS = 8000;
const BOARD_LIMIT = 100;
/** `select=*` would touch the secret column, which clients may not read. */
const COLUMNS = 'device_id,keeper,rock_name,level,xp,best_level,care,updated_at';

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

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** This device's identity on the leaderboard, created once and reused. */
export function identity() {
  const saved = readJson(DEVICE_KEY);
  if (saved && typeof saved.id === 'string' && typeof saved.secret === 'string') return saved;
  const fresh = { id: uuid(), secret: uuid() };
  writeJson(DEVICE_KEY, fresh);
  return fresh;
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

/** Publishes this device's pet. The server clamps whatever it is sent. */
export async function submitPet(state, care) {
  const me = identity();
  return request('/rest/v1/rpc/submit_pet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_device: me.id,
      p_secret: me.secret,
      p_keeper: state.playerName,
      p_rock: state.rockName,
      p_level: state.level,
      p_xp: Math.floor(state.xp),
      p_best: state.bestLevel,
      p_care: Math.round(care),
    }),
  });
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
export function rowsToEntries(rows, deviceId) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === 'object' && typeof row.device_id === 'string')
    .map((row) => ({
      id: `pet-${row.device_id}`,
      keeper: text(row.keeper, 'Keeper'),
      rock: text(row.rock_name, 'Pebbles'),
      level: clampInt(row.level, 1, 999, 1),
      xp: clampInt(row.xp, 0, 1000000, 0),
      care: clampInt(row.care, 0, 100, 0),
      isPlayer: row.device_id === deviceId,
      online: true,
    }));
}

/** Fetches the top of the board. */
export async function fetchBoard(limit = BOARD_LIMIT) {
  const query = `/rest/v1/pets?select=${COLUMNS}&order=level.desc,xp.desc&limit=${limit}`;
  const result = await request(query, { method: 'GET' });
  if (!result.ok) return result;
  const rows = await result.res.json().catch(() => null);
  if (!Array.isArray(rows)) return { ok: false, error: 'bad-response' };
  return { ok: true, entries: rowsToEntries(rows, identity().id) };
}

/** Human-readable reason for a failed call, for the status line. */
export function describeError(error, detail = '') {
  switch (error) {
    case 'not-configured': return 'No Supabase project connected';
    case 'offline': return 'This device is offline';
    case 'timeout': return 'Supabase did not answer in time';
    case 'network': return 'Could not reach Supabase';
    case 'bad-response': return 'Supabase sent an unexpected reply';
    case 'http-401':
    case 'http-403': return 'Supabase rejected the key — check the anon key and that schema.sql ran';
    case 'http-404': return 'Table or function missing — run supabase/schema.sql';
    default:
      return detail ? `Supabase error (${error})` : `Supabase error (${error})`;
  }
}
