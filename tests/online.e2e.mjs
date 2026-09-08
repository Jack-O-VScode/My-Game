/**
 * End-to-end check of accounts, cross-device saves, daily goals and the
 * shared board, driven against tools/mock-supabase.js.
 *
 *   node tests/online.e2e.mjs
 *
 * Browser contexts stand in for separate devices. Needs Playwright, which
 * is why this is kept out of `npm test`.
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
// Never the built-in project: the app ships with real credentials, and a
// device left unconfigured here would reach the live leaderboard.
const DEAD_END = 'http://localhost:1';

const results = [];
const check = (label, pass, detail = '') => {
  results.push({ label, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function start(script, args = [], env = {}) {
  const child = spawn('node', [script, ...args], {
    cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => console.error(`[${script}] ${String(d).trim()}`));
  if (process.env.E2E_LOG) child.stdout.on('data', (d) => process.stdout.write(String(d)));
  else child.stdout.resume();
  return child;
}

const siteServer = start('tools/serve.js', [], { PORT: String(SITE_PORT) });
const api = start('tools/mock-supabase.js', ['--port', String(API_PORT), '--key', KEY]);
await wait(900);

const browser = await chromium.launch();
const errors = [];

/** One device: a fresh browser profile pointed at the mock backend. */
async function device(label, { reachable = true, save = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  await ctx.addInitScript(`
    localStorage.setItem('pet-rock-supabase', JSON.stringify({
      url: ${JSON.stringify(reachable ? API : DEAD_END)}, anonKey: ${JSON.stringify(KEY)} }));
    ${save ? `localStorage.setItem('pet-rock-sim', ${JSON.stringify(JSON.stringify(save))});` : ''}`);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(text)) {
      errors.push(`${label}: ${text}`);
    }
  });
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await wait(1200);
  return { ctx, page };
}

const gateOpen = (page) => page.isVisible('#auth-user');

/** Waits for the dialog to actually close, rather than guessing at a delay. */
const noModal = (page) => page.waitForFunction(
  () => !document.getElementById('modal')?.open, null, { timeout: 15000 });

/**
 * Submits the sign-in form and waits for it to settle: either the form is
 * gone, or it is showing an error. Sleeping a fixed time here races with
 * the round trip, and typing into a form that has not closed yet lands the
 * next answer in the wrong field.
 */
async function fillGate(page, mode, user, pass) {
  await page.waitForSelector('#auth-user', { state: 'visible', timeout: 15000 });
  await page.click(`#modal-body .tab-chip[data-mode="${mode}"]`);
  await page.fill('#auth-user', user);
  await page.fill('#auth-pass', pass);
  await page.click('#modal-ok');
  await page.waitForFunction(() => {
    const error = document.getElementById('auth-error');
    if (!document.getElementById('auth-user')) return true;
    const text = error?.textContent?.trim() || '';
    return text && text !== 'Just a moment…';
  }, null, { timeout: 15000 }).catch(() => {});
}

/** Answers the "name your rock" prompt that follows registration. */
async function nameRock(page, name) {
  await page.waitForFunction(
    () => document.getElementById('modal-title')?.textContent === 'Name your rock',
    null, { timeout: 15000 });
  await page.fill('#modal-body input[type="text"]', name);
  await page.click('#modal-ok');
  await noModal(page);
}

/** Switches screens once nothing is covering the tab bar. */
async function go(page, screen) {
  await noModal(page).catch(() => {});
  await page.click(`.tab[data-screen="${screen}"]`);
}

const rows = (page) => page.$$eval('.row-entry', (list) => list.map((el) => ({
  who: el.querySelector('.who-name').textContent.trim(),
  rock: el.querySelector('.who-rock').textContent.trim(),
  level: Number(el.querySelector('.lvl').textContent.replace(/\D/g, '')),
  me: el.className.includes('me'),
  hasRock: Boolean(el.querySelector('.row-rock svg')),
})));

/* ------------------------- first run asks to join --------------------- */

const a = await device('A');
check('a first run asks for an account', await gateOpen(a.page));

await a.page.fill('#auth-user', 'Ada');
await a.page.fill('#auth-pass', 'short');
await a.page.click('#modal-ok');
await wait(500);
check('a weak password is refused with a reason',
  (await a.page.textContent('#auth-error')).includes('8 characters'),
  await a.page.textContent('#auth-error'));

await fillGate(a.page, 'register', 'Ada', 'granite123');
check('registering then asks for the rock name',
  (await a.page.textContent('#modal-title')) === 'Name your rock');
await nameRock(a.page, 'Rocky');
await wait(900);

check('the keeper name becomes the account name',
  (await a.page.textContent('#mood-line')).length > 0
  && (await a.page.evaluate(() => JSON.parse(localStorage.getItem('pet-rock-sim')).playerName)) === 'Ada');
check('the rock is named as asked',
  (await a.page.textContent('#rock-name')).trim() === 'Rocky',
  await a.page.textContent('#rock-name'));

/* --------------------------- duplicate names -------------------------- */

const dup = await device('Dup');
await fillGate(dup.page, 'register', 'ADA', 'granite123');
check('usernames are taken case-insensitively',
  (await dup.page.textContent('#auth-error')).includes('taken'),
  await dup.page.textContent('#auth-error'));
await dup.page.click('#auth-skip');
await noModal(dup.page);
await wait(300);
check('a player can decline and play locally', !(await gateOpen(dup.page)));
check('declining is remembered', await dup.page.evaluate(
  () => JSON.parse(localStorage.getItem('pet-rock-sim')).introDone === true));

/* ------------------- signing in on a second device -------------------- */

// Give Ada some progress worth carrying across.
await go(a.page, 'care');
for (const act of ['scrub', 'polish', 'play', 'water']) {
  await a.page.click(`[data-action="${act}"]`).catch(() => {});
  await wait(250);
}
// Progress is pushed on a cooldown rather than on every tap, so give
// device A time to publish before another device signs in.
await wait(13000);
const aCoins = Number(await a.page.textContent('#coin-count'));

const b = await device('B');
check('the second device also asks to sign in', await gateOpen(b.page));
await fillGate(b.page, 'login', 'ada', 'wrongpass');
check('a wrong password is rejected',
  (await b.page.textContent('#auth-error')).toLowerCase().includes('wrong'),
  await b.page.textContent('#auth-error'));

await fillGate(b.page, 'login', 'ada', 'granite123');
await wait(1500);
check('signing in does not ask to name a rock again', !(await b.page.isVisible('#modal-body input[type="text"]')));
check('the rock came with the account',
  (await b.page.textContent('#rock-name')).trim() === 'Rocky',
  await b.page.textContent('#rock-name'));
const bCoins = Number(await b.page.textContent('#coin-count'));
check('progress came with the account', bCoins === aCoins, `device A ${aCoins} / device B ${bCoins}`);

/* ---------------------- a second keeper joins ------------------------- */

const c = await device('C');
await fillGate(c.page, 'register', 'Boris', 'basalt9876');
await nameRock(c.page, 'Tank');
await wait(1200);

await go(c.page, 'board');
await wait(1800);
const board = await rows(c.page);
check('both keepers share one board', board.length === 2,
  board.map((r) => `${r.who} (${r.rock})`).join(', '));
check('every row draws that keeper\'s own rock', board.every((r) => r.hasRock));
check('usernames are what other keepers see',
  board.some((r) => r.who.startsWith('Ada')) && board.some((r) => r.who.startsWith('Boris')));
check('only your own row is marked', board.filter((r) => r.me).length === 1);

await c.page.click('#sort-btn');
await wait(500);
const asc = await rows(c.page);
check('the sort toggle still flips a live board',
  asc[0].level <= asc[asc.length - 1].level,
  asc.map((r) => `${r.who} Lv${r.level}`).join(', '));

/* ----------- an existing player keeps the rock they already had ------- */

// This is the path the players who started before accounts existed take:
// their progress lives in this browser, and registering must carry it over
// rather than handing them a fresh level 1 pet.
const veteran = await device('Veteran', {
  save: {
    v: 1, rockName: 'AQUA', playerName: 'Quiet Slate', level: 9, xp: 40, bestLevel: 9,
    coins: 742, stats: { clean: 88, shine: 82, joy: 90, moss: 77 },
    owned: ['skin_granite', 'eyes_googly', 'bg_meadow', 'hat_beanie', 'acc_scarf'],
    equipped: { skin: 'skin_granite', eyes: 'eyes_googly', hat: 'hat_beanie', acc: 'acc_scarf', bg: 'bg_meadow' },
    lastTick: Date.now(), createdAt: Date.now(), sound: false, sortDir: 'desc',
  },
});
check('an existing player is asked to make an account', await gateOpen(veteran.page));
check('their rock is still there behind the dialog',
  (await veteran.page.textContent('#rock-name')).trim() === 'AQUA');

await fillGate(veteran.page, 'register', 'Jack', 'sandstone42');
await nameRock(veteran.page, 'AQUA');
await wait(1200);
check('registering keeps the level they had',
  (await veteran.page.textContent('#level')).trim() === '9',
  `level ${await veteran.page.textContent('#level')}`);
check('registering keeps their coins',
  Number(await veteran.page.textContent('#coin-count')) >= 742,
  await veteran.page.textContent('#coin-count'));
check('registering keeps their cosmetics',
  await veteran.page.evaluate(() =>
    JSON.parse(localStorage.getItem('pet-rock-sim')).equipped.hat === 'hat_beanie'));

await wait(13000);
const back = await device('VeteranPhone');
await fillGate(back.page, 'login', 'Jack', 'sandstone42');
await wait(1500);
check('and it follows them to a new device',
  (await back.page.textContent('#level')).trim() === '9'
  && (await back.page.textContent('#rock-name')).trim() === 'AQUA',
  `Lv ${await back.page.textContent('#level')} ${await back.page.textContent('#rock-name')}`);

/* ------------------------------- goals -------------------------------- */

// Earn something before checking that earning it shows up.
await go(c.page, 'care');
await c.page.click('[data-action="scrub"]');
await wait(1400);
await go(c.page, 'goals');
await wait(700);
check('three daily goals are shown', (await c.page.locator('.quest').count()) === 3);
check('badges are listed', (await c.page.locator('.badge').count()) >= 10);
check('caring for the rock earns a badge',
  (await c.page.locator('.badge.earned').count()) >= 1,
  `${await c.page.locator('.badge.earned').count()} earned`);

/* -------------------------- account settings -------------------------- */

await go(c.page, 'more');
await wait(500);
check('the account is named in settings',
  (await c.page.textContent('#account-status')).includes('Boris'),
  await c.page.textContent('#account-status'));

await c.page.click('#account-signout');
await c.page.waitForSelector('#modal[open]', { timeout: 10000 });
await c.page.click('#modal-ok');
await noModal(c.page);
await wait(600);
check('signing out returns to a local game',
  (await c.page.textContent('#account-status')).includes('this device only'));
check('the session token is gone',
  await c.page.evaluate(() => localStorage.getItem('pet-rock-session')) === null);

/* --------------------- the game survives no backend ------------------- */

api.kill();
await wait(600);
await go(b.page, 'board');
await wait(2600);
check('losing the backend is reported, not hidden',
  (await b.page.textContent('#board-status')).includes('⚠️'),
  await b.page.textContent('#board-status'));
await go(b.page, 'care');
await wait(400);
await b.page.click('[data-action="scrub"]').catch(() => {});
await wait(400);
check('the game keeps playing with the backend down', await b.page.isVisible('.rock-svg'));

check('no console errors anywhere', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');

await browser.close();
siteServer.kill();
try { api.kill(); } catch {}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
