/**
 * End-to-end check of the online leaderboard against the mock Supabase in
 * tools/mock-supabase.js. Two browser contexts stand in for two devices.
 *
 *   node tests/online.e2e.mjs
 *
 * Needs Playwright and a Chromium build; it is deliberately kept out of
 * `npm test` so the unit suite stays dependency-free.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE_PORT = 8090;
const API_PORT = 8091;
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-anon-key-for-tests.signature';
const API = `http://localhost:${API_PORT}`;
const SITE = `http://localhost:${SITE_PORT}/`;

const results = [];
const check = (label, pass, detail = '') => {
  results.push({ label, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const LOG = process.env.E2E_LOG;

function start(script, args = [], env = {}) {
  const child = spawn('node', [script, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Startup failures (a port already in use, say) must not be swallowed:
  // a silently dead server turns into a confusing test failure later.
  child.stderr.on('data', (d) => console.error(`[${script}] ${String(d).trim()}`));
  if (LOG) child.stdout.on('data', (d) => process.stdout.write(String(d)));
  else child.stdout.resume();
  return child;
}

const siteServer = start('tools/serve.js', [], { PORT: String(SITE_PORT) });
const api = start('tools/mock-supabase.js', ['--port', String(API_PORT), '--key', KEY]);
await wait(900);

const browser = await chromium.launch();
const errors = [];

const seed = (level, keeper, rock, withConfig) => `
  if (!localStorage.getItem('pet-rock-sim')) {
    localStorage.setItem('pet-rock-sim', JSON.stringify({
      v: 1, rockName: ${JSON.stringify(rock)}, playerName: ${JSON.stringify(keeper)},
      level: ${level}, xp: 30, bestLevel: ${level}, coins: 500,
      stats: { clean: 90, shine: 90, joy: 90, moss: 80 },
      owned: ['skin_granite','eyes_googly','bg_meadow'],
      equipped: { skin:'skin_granite', eyes:'eyes_googly', hat:null, acc:null, bg:'bg_meadow' },
      lastTick: Date.now(), createdAt: Date.now(), sound: false, sortDir: 'desc',
      lastDay: new Date().toISOString().slice(0,10),
    }));
    ${withConfig ? `localStorage.setItem('pet-rock-supabase', JSON.stringify({ url: ${JSON.stringify(API)}, anonKey: ${JSON.stringify(KEY)} }));` : ''}
  }`;

async function open(level, keeper, rock, withConfig) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await ctx.addInitScript(seed(level, keeper, rock, withConfig));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${keeper}: ${e.message}`));
  page.on('console', (m) => {
    // Failed fetches are expected once the mock backend is stopped on purpose.
    const text = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(text)) {
      errors.push(`${keeper}: ${text}`);
    }
  });
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await wait(600);
  return { ctx, page };
}

const rows = (page) => page.$$eval('.row-entry', (list) => list.map((el) => ({
  rank: el.querySelector('.rank').textContent.trim(),
  who: el.querySelector('.who-name').textContent.trim(),
  level: Number(el.querySelector('.lvl').textContent.replace(/\D/g, '')),
  me: el.className.includes('me'),
})));

/* -- device A connects through the UI, which exercises the real form ---- */
const a = await open(7, 'Ada', 'Granite', false);
await a.page.click('.tab[data-screen="more"]');
await wait(300);
check('starts in practice mode',
  (await a.page.textContent('#online-status')).includes('Not connected'));

await a.page.click('#online-config');
await wait(300);
const boxes = await a.page.$$('#modal-body .field input');
await boxes[0].fill(API);
await boxes[1].fill(KEY);
await a.page.click('#modal-ok');
await wait(1200);
check('connect form reports a live connection',
  (await a.page.textContent('#online-status')).includes('Connected'),
  await a.page.textContent('#online-status'));

/* -- device B joins, already configured ---------------------------------- */
const b = await open(14, 'Boris', 'Tank', true);
await b.page.click('.tab[data-screen="board"]');
await wait(1500);

const bRows = await rows(b.page);
check('device B sees both devices on one board', bRows.length === 2,
  bRows.map((r) => `${r.who} Lv${r.level}`).join(', '));
check('higher level ranks first', bRows[0].who.startsWith('Boris') && bRows[0].level === 14);
check('device B is highlighted as itself, and only itself',
  bRows.filter((r) => r.me).length === 1 && bRows.find((r) => r.me).who.includes('Boris'));
check('live status line shows the online count',
  (await b.page.textContent('#board-status')).includes('Live'),
  await b.page.textContent('#board-status'));

/* -- the sort toggle still flips a live board ---------------------------- */
await b.page.click('#sort-btn');
await wait(400);
const asc = await rows(b.page);
check('sort toggle reverses the live board',
  asc[0].who.startsWith('Ada') && asc[0].level === 7,
  asc.map((r) => `${r.who} Lv${r.level}`).join(', '));
await b.page.click('#sort-btn');
await wait(300);

/* -- device A sees B too ------------------------------------------------- */
await a.page.click('.tab[data-screen="board"]');
await wait(1500);
const aRows = await rows(a.page);
check('device A sees device B', aRows.length === 2 && aRows.some((r) => r.who.includes('Boris')));
check('device A is highlighted as itself',
  aRows.filter((r) => r.me).length === 1 && aRows.find((r) => r.me).who.includes('Ada'));

/* -- one pet per device: starting over replaces the row ------------------ */
await a.page.click('.tab[data-screen="more"]');
await wait(300);
await a.page.click('#reset-btn');
await wait(300);
await a.page.click('#modal-ok');
await wait(1800);
await a.page.click('.tab[data-screen="board"]');
await wait(1800);
const afterReset = await rows(a.page);
check('starting over replaces the row instead of adding one',
  afterReset.length === 2, `${afterReset.length} rows: ${afterReset.map((r) => r.who).join(', ')}`);
check('the reset pet is back at level 1 on the board',
  afterReset.find((r) => r.me)?.level === 1);

const serverRows = await fetch(`${API}/rest/v1/pets`, { headers: { apikey: KEY } }).then((r) => r.json());
check('server holds exactly one row per device', serverRows.length === 2,
  serverRows.map((r) => `${r.keeper} Lv${r.level}`).join(', '));

/* -- a hostile client cannot overwrite another device -------------------- */
const victim = serverRows.find((r) => r.keeper !== 'Boris') || serverRows[0];
const forged = await fetch(`${API}/rest/v1/rpc/submit_pet`, {
  method: 'POST',
  headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_device: victim.device_id, p_secret: 'not-the-secret', p_level: 999 }),
});
check('another client cannot hijack a device row', forged.status === 403, `status ${forged.status}`);

/* -- losing the backend falls back to practice rivals -------------------- */
api.kill();
await wait(600);
await b.page.click('#board-status');
await wait(2500);
const status = await b.page.textContent('#board-status');
const offlineRows = await rows(b.page);
check('backend loss is reported, not hidden', status.includes('⚠️'), status);
check('board falls back to practice rivals', offlineRows.length > 5,
  `${offlineRows.length} rows`);
await b.page.click('.tab[data-screen="care"]');
await wait(400);
await b.page.click('[data-action="scrub"]');
await wait(400);
check('care actions still work with the backend down',
  await b.page.isVisible('.rock-svg'));

check('no console errors anywhere', errors.length === 0, errors.join(' | ') || 'clean');

await browser.close();
siteServer.kill();
try { api.kill(); } catch {}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
