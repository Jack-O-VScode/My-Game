/**
 * A stand-in for Supabase's PostgREST API, for local development and for
 * the end-to-end test in tests/online.e2e.mjs. It is NOT part of the game
 * and is never deployed.
 *
 * It mirrors the contract in supabase/schema.sql closely enough to be a
 * useful test double:
 *   - GET  /rest/v1/pets           -> the leaderboard, ordered
 *   - POST /rest/v1/rpc/submit_pet -> upsert guarded by the device secret
 *   - apikey / Authorization are required, as they are on a real project
 *   - the same clamping the SQL function applies
 *   - CORS preflight, so a browser on another port can call it
 *
 *   node tools/mock-supabase.js [--port 8081] [--key test-anon-key]
 */

import { createServer } from 'node:http';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = Number(flag('port', 8081));
const ANON_KEY = flag('key', 'test-anon-key');

/** username_lower -> account, and account_id -> pet: one pet per account. */
const accounts = new Map();
const sessions = new Map();   // sha256(token) -> account_id
const pets = new Map();

let nextId = 1;
const newId = () => `acc-${nextId++}`;

// scrypt stands in for the bcrypt the real schema uses: the point is that
// the mock never keeps a password in the clear either.
const hashPassword = (password, salt = randomBytes(16).toString('hex')) =>
  `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;

const passwordMatches = (password, stored) => {
  const [salt, digest] = String(stored).split(':');
  const attempt = scryptSync(password, salt, 32);
  const known = Buffer.from(digest, 'hex');
  return attempt.length === known.length && timingSafeEqual(attempt, known);
};

const tokenHash = (token) => createHash('sha256').update(String(token)).digest('hex');

const clamp = (v, lo, hi, fallback) => {
  // `Number(null)` is 0, so a missing value must be rejected before coercion
  // or an absent ?limit= would silently become the minimum.
  if (v === null || v === undefined || v === '') return fallback;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

const name = (v, fallback) => {
  const s = String(v ?? '').trim().slice(0, 18);
  return s || fallback;
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'apikey,authorization,content-type,prefer');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function send(res, status, body) {
  cors(res);
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(json);
}

const fail = (res, status, code, message) =>
  send(res, status, { code, details: null, hint: null, message });

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return null;
  }
}

function payload(account, token) {
  const pet = pets.get(account.id);
  return {
    account_id: account.id,
    username: account.username,
    token,
    save: pet.save,
    client_clock: pet.client_clock,
    rock_name: pet.rock_name,
    updated_at: pet.updated_at,
  };
}

function applySave(account, state, clock) {
  const pet = pets.get(account.id);
  const level = clamp(state?.level, 1, 999, 1);
  Object.assign(pet, {
    rock_name: name(state?.rockName, pet.rock_name),
    level,
    xp: clamp(state?.xp, 0, 1000000, 0),
    best_level: Math.max(pet.best_level, clamp(state?.bestLevel, 1, 999, level), level),
    care: clamp(state?.care, 0, 100, 0),
    equipped: state?.equipped && typeof state.equipped === 'object' ? state.equipped : {},
    badges: Array.isArray(state?.unlocked) ? state.unlocked.length : 0,
    save: state,
    client_clock: Math.max(pet.client_clock, Number(clock) || 0),
    updated_at: new Date().toISOString(),
  });
}

function startSession(accountId) {
  const token = randomBytes(32).toString('hex');
  sessions.set(tokenHash(token), accountId);
  return token;
}

function rpc(res, fn, body) {
  if (fn === 'register') {
    const username = String(body.p_username || '').trim();
    const lower = username.toLowerCase();
    if (username.length < 3 || username.length > 18) {
      return fail(res, 400, '22023', 'Username must be 3 to 18 characters');
    }
    if (!/^[A-Za-z0-9 _.-]+$/.test(username)) {
      return fail(res, 400, '22023', 'Username can use letters, numbers, spaces, dot, dash and underscore');
    }
    if (String(body.p_password || '').length < 8) {
      return fail(res, 400, '22023', 'Password must be at least 8 characters');
    }
    if (accounts.has(lower)) return fail(res, 400, '23505', 'That username is taken');

    const account = {
      id: newId(), username, username_lower: lower,
      password_hash: hashPassword(body.p_password), failed: 0, lockedUntil: 0,
    };
    accounts.set(lower, account);
    pets.set(account.id, {
      account_id: account.id, username_lower: lower,
      rock_name: name(body.p_rock, 'Pebbles'),
      level: 1, xp: 0, best_level: 1, care: 0, equipped: {}, badges: 0,
      save: {}, client_clock: 0, updated_at: new Date().toISOString(),
    });
    if (body.p_state && body.p_state.level !== undefined) {
      applySave(account, body.p_state, body.p_state.lastTick);
      pets.get(account.id).rock_name = name(body.p_rock, pets.get(account.id).rock_name);
    }
    console.log(`[mock] register ${username} (${accounts.size} accounts)`);
    return send(res, 200, payload(account, startSession(account.id)));
  }

  if (fn === 'login') {
    const account = accounts.get(String(body.p_username || '').trim().toLowerCase());
    if (!account) return fail(res, 400, '28P01', 'Wrong username or password');
    if (account.lockedUntil > Date.now()) {
      return fail(res, 400, '28P01', 'Too many attempts. Try again in a few minutes');
    }
    if (!passwordMatches(String(body.p_password || ''), account.password_hash)) {
      account.failed += 1;
      if (account.failed >= 5) account.lockedUntil = Date.now() + 15 * 60000;
      console.log(`[mock] login REJECTED for ${account.username}`);
      return fail(res, 400, '28P01', 'Wrong username or password');
    }
    account.failed = 0;
    account.lockedUntil = 0;
    console.log(`[mock] login ${account.username}`);
    return send(res, 200, payload(account, startSession(account.id)));
  }

  const accountFor = (token) => {
    const id = sessions.get(tokenHash(token || ''));
    return id ? [...accounts.values()].find((a) => a.id === id) : null;
  };

  if (fn === 'resume' || fn === 'sync_pet') {
    const account = accountFor(body.p_token);
    if (!account) return fail(res, 400, '28000', 'Session expired');
    if (fn === 'sync_pet') {
      const stored = pets.get(account.id).client_clock;
      if ((Number(body.p_clock) || 0) >= stored) applySave(account, body.p_state, body.p_clock);
    }
    return send(res, 200, payload(account, body.p_token));
  }

  if (fn === 'sign_out') {
    sessions.delete(tokenHash(body.p_token || ''));
    return send(res, 204);
  }

  return fail(res, 404, 'PGRST202', `no function ${fn}`);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204).end();
    return;
  }

  // Real projects reject anything without a valid key.
  const key = req.headers.apikey || (req.headers.authorization || '').replace(/^Bearer /, '');
  if (key !== ANON_KEY) {
    return fail(res, 401, 'PGRST301', 'Invalid API key');
  }

  if (req.method === 'GET' && url.pathname === '/rest/v1/pets') {
    const limit = clamp(url.searchParams.get('limit'), 1, 1000, 100);
    const rows = [...pets.values()]
      .map(({ save, client_clock, ...visible }) => ({   // neither column is granted
        ...visible,
        accounts: { username: accounts.get(visible.username_lower)?.username },
      }))
      .map(({ username_lower, ...row }) => row)
      .sort((a, b) => b.level - a.level || b.xp - a.xp)
      .slice(0, limit);
    console.log(`[mock] GET pets -> ${rows.length} rows`);
    return send(res, 200, rows);
  }

  if (req.method === 'POST' && url.pathname.startsWith('/rest/v1/rpc/')) {
    const fn = url.pathname.split('/').pop();
    const body = (await readBody(req)) || {};
    return rpc(res, fn, body);
  }

  return fail(res, 404, 'PGRST202', `no route for ${req.method} ${url.pathname}`);
});

server.listen(PORT, () => {
  console.log(`[mock] Supabase stand-in on http://localhost:${PORT} (key: ${ANON_KEY})`);
});
