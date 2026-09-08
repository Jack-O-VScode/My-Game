import assert from 'node:assert/strict';
import test from 'node:test';

import { normaliseUrl, rowsToEntries, validateConfig, describeError } from '../js/online.js';
import { board, standing } from '../js/leaderboard.js';
import { validateCredentials } from '../js/account.js';
import { newState } from '../js/engine.js';

const T0 = Date.UTC(2026, 5, 1, 12, 0, 0);
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.looks-like-a-real-anon-key.sig';

const remote = (...rows) => rowsToEntries(rows, 'me-account');
const row = (id, keeper, level, xp = 0) => ({
  account_id: id,
  accounts: { username: keeper },
  rock_name: `${keeper}'s rock`,
  level,
  xp,
  care: 70,
  badges: 2,
  equipped: { skin: 'skin_basalt', hat: 'hat_crown' },
});

/* ------------------------------- config ------------------------------- */

test('project URLs are validated, trailing slashes ignored', () => {
  const ok = validateConfig('https://abcdefg.supabase.co/', KEY);
  assert.equal(ok.ok, true);
  assert.equal(ok.url, 'https://abcdefg.supabase.co', 'trailing slash trimmed');
  assert.equal(normaliseUrl('https://x.co///'), 'https://x.co');
});

test('a key sent over plain http is refused unless it is local', () => {
  assert.equal(validateConfig('http://my-project.example.com', KEY).ok, false);
  assert.equal(validateConfig('http://localhost:8091', KEY).ok, true, 'local dev is allowed');
  assert.equal(validateConfig('http://127.0.0.1:54321', KEY).ok, true);
});

test('obvious mistakes are caught with a readable message', () => {
  for (const [url, key] of [['', ''], ['not a url', KEY], ['ftp://x.co', KEY],
    ['https://abc.supabase.co', 'too-short']]) {
    const result = validateConfig(url, key);
    assert.equal(result.ok, false, `${url} ${key}`);
    assert.match(result.error, /\w/);
  }
});

test('every failure mode has a human-readable explanation', () => {
  for (const code of ['not-configured', 'offline', 'timeout', 'network',
    'bad-response', 'http-401', 'http-403', 'http-404', 'http-500']) {
    assert.match(describeError(code), /[a-z]/i);
  }
});

/* ------------------------------ row mapping --------------------------- */

test('rows from the server become entries, with your own account marked', () => {
  const entries = remote(row('me-account', 'Me', 5), row('other', 'Them', 9));
  assert.equal(entries.length, 2);
  assert.equal(entries.find((e) => e.isPlayer).keeper, 'Me');
  assert.equal(entries.filter((e) => e.isPlayer).length, 1);
  assert.ok(entries.every((e) => e.online));
  assert.deepEqual(entries[0].equipped, { skin: 'skin_basalt', hat: 'hat_crown' },
    'cosmetics travel so the board can draw everyone');
  assert.equal(entries[0].badges, 2);
});

test('hostile rows from other players cannot break the board', () => {
  const entries = rowsToEntries([
    null,
    'not a row',
    { accounts: { username: 'no id' } },
    { account_id: 'a', accounts: { username: '<img src=x onerror=alert(1)>'.repeat(9) },
      rock_name: null, level: 99999, xp: -5, care: 'wat', badges: -3, equipped: 'nope' },
    { account_id: 'b', accounts: null, rock_name: '   ', level: null, xp: null, care: null },
  ], 'me-account');

  assert.equal(entries.length, 2, 'malformed rows are dropped');
  const [a, b] = entries;
  assert.equal(a.keeper.length, 18, 'names are truncated, never trusted for length');
  assert.equal(a.rock, 'Pebbles', 'missing rock name falls back');
  assert.equal(a.level, 999, 'level is clamped to the maximum');
  assert.equal(a.xp, 0, 'negative xp is clamped');
  assert.equal(a.care, 0, 'unparseable care falls back');
  assert.equal(a.badges, 0, 'negative badge counts are clamped');
  assert.deepEqual(a.equipped, {}, 'a non-object equipped set cannot reach the renderer');
  assert.equal(b.keeper, 'Keeper', 'a missing account falls back');
  assert.equal(b.level, 1, 'null level falls back to 1, not 0');
});

/* --------------------------- board integration ------------------------ */

test('a live board replaces the practice rivals', () => {
  const state = newState(T0);
  state.level = 8;
  const ranked = board(state, 'desc', T0, remote(row('other', 'Them', 20)));

  assert.equal(ranked.length, 2, 'only real keepers, no simulated ones');
  assert.equal(ranked[0].keeper, 'Them');
  assert.equal(ranked[1].isPlayer, true);
  assert.deepEqual(ranked.map((e) => e.rank), [1, 2]);
});

test('the local pet always wins over its own stale server row', () => {
  const state = newState(T0);
  state.level = 12;                       // just levelled up, not synced yet
  state.playerName = 'Fresh';
  const ranked = board(state, 'desc', T0, remote(row('me-account', 'Stale', 3), row('o', 'Them', 6)));

  const me = ranked.filter((e) => e.isPlayer);
  assert.equal(me.length, 1, 'the player appears exactly once');
  assert.equal(me[0].level, 12, 'the board agrees with the header');
  assert.equal(me[0].keeper, 'Fresh');
  assert.equal(ranked[0].isPlayer, true, 'and is ranked on the live level');
});

test('sorting a live board flips both ways and keeps everyone', () => {
  const state = newState(T0);
  state.level = 10;
  const rows = remote(row('a', 'A', 30), row('b', 'B', 2), row('c', 'C', 17));
  const desc = board(state, 'desc', T0, rows);
  const asc = board(state, 'asc', T0, rows);

  assert.deepEqual(desc.map((e) => e.level), [30, 17, 10, 2]);
  assert.deepEqual(asc.map((e) => e.level), [2, 10, 17, 30]);
  assert.deepEqual(desc.map((e) => e.rank), [1, 2, 3, 4]);
  assert.equal(desc.length, asc.length);
});

test('an empty or failed fetch falls back to practice rivals', () => {
  const state = newState(T0);
  for (const empty of [null, [], undefined]) {
    const ranked = board(state, 'desc', T0, empty);
    assert.ok(ranked.length > 5, 'practice rivals stand in');
    assert.equal(ranked.filter((e) => e.isPlayer).length, 1);
  }
});

test('standing is measured against the live board when there is one', () => {
  const state = newState(T0);
  state.level = 5;
  const rows = remote(row('a', 'A', 30), row('b', 'B', 2));
  assert.deepEqual(standing(state, T0, rows), { place: 2, total: 3 });
});

/* ------------------------- account credentials ------------------------ */

test('usernames and passwords are checked before any round trip', () => {
  const good = validateCredentials('  Jack_O ', 'longenough1');
  assert.equal(good.ok, true);
  assert.equal(good.username, 'Jack_O', 'surrounding spaces are trimmed');

  for (const [name, pass] of [
    ['ab', 'longenough1'],                    // too short
    ['x'.repeat(19), 'longenough1'],          // too long
    ['bad/name', 'longenough1'],              // illegal character
    ['Jack', 'short'],                        // password too short
    ['', ''],
  ]) {
    const result = validateCredentials(name, pass);
    assert.equal(result.ok, false, `${name} / ${pass}`);
    assert.match(result.error, /\w/);
  }
});
