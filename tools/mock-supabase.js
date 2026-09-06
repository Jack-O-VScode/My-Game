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

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = Number(flag('port', 8081));
const ANON_KEY = flag('key', 'test-anon-key');

/** device_id -> row, exactly one row per device. */
const pets = new Map();

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
      .map(({ secret, ...visible }) => visible)   // `secret` is not granted to anon
      .sort((a, b) => b.level - a.level || b.xp - a.xp)
      .slice(0, limit);
    console.log(`[mock] GET pets -> ${rows.length} rows`);
    return send(res, 200, rows);
  }

  if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/submit_pet') {
    const body = await readBody(req);
    if (!body || !body.p_device || !body.p_secret) {
      return fail(res, 400, '22023', 'device and secret are required');
    }

    const existing = pets.get(body.p_device);
    if (existing && existing.secret !== body.p_secret) {
      console.log(`[mock] submit_pet REJECTED (secret mismatch) ${body.p_device}`);
      return fail(res, 403, '42501', 'device secret mismatch');
    }

    const level = clamp(body.p_level, 1, 999, 1);
    const row = {
      device_id: body.p_device,
      secret: body.p_secret,
      keeper: name(body.p_keeper, 'Keeper'),
      rock_name: name(body.p_rock, 'Pebbles'),
      level,
      xp: clamp(body.p_xp, 0, 1000000, 0),
      best_level: Math.max(existing?.best_level || 0, clamp(body.p_best, 1, 999, level), level),
      care: clamp(body.p_care, 0, 100, 0),
      updated_at: new Date().toISOString(),
    };
    pets.set(body.p_device, row);
    console.log(`[mock] submit_pet ${row.keeper} Lv${row.level} (${pets.size} devices)`);
    return send(res, 204);
  }

  return fail(res, 404, 'PGRST202', `no route for ${req.method} ${url.pathname}`);
});

server.listen(PORT, () => {
  console.log(`[mock] Supabase stand-in on http://localhost:${PORT} (key: ${ANON_KEY})`);
});
