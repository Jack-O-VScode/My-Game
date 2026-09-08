import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BADGES, QUESTS, QUEST_SWEEP_BONUS, questBoard, questsForDay, recordAction,
  recordPurchase, rollDay, update,
} from '../js/achievements.js';
import { COSMETICS } from '../js/config.js';
import { applyAction, buy, newState } from '../js/engine.js';

const DAY = '2026-09-08';
const T0 = Date.UTC(2026, 8, 8, 12, 0, 0);

const ready = (now = T0) => {
  const s = newState(now);
  rollDay(s, DAY);
  return s;
};

/* -------------------------------- quests ------------------------------ */

test('every keeper gets the same three quests on a given day', () => {
  const a = questsForDay(DAY).map((q) => q.id);
  const b = questsForDay(DAY).map((q) => q.id);
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.equal(new Set(a).size, 3, 'no duplicates');
  assert.ok(a.every((id) => QUESTS.some((q) => q.id === id)));
});

test('the quest set changes from day to day', () => {
  const days = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'];
  const sets = new Set(days.map((d) => questsForDay(d).map((q) => q.id).join(',')));
  assert.ok(sets.size > 1, 'quests should not be identical every day');
});

test('a quest pays out once, when its target is reached', () => {
  const s = ready();
  s.quests = { ids: ['q_scrub'], done: [], sweep: false };

  recordAction(s, 'scrub');
  recordAction(s, 'scrub');
  assert.equal(update(s, DAY).quests.length, 0, 'not yet');

  recordAction(s, 'scrub');
  const beforeFinal = s.coins;
  const earned = update(s, DAY);
  assert.equal(earned.quests.length, 1);
  assert.equal(earned.coins, earned.quests[0].coins + QUEST_SWEEP_BONUS);
  assert.equal(s.coins, beforeFinal + earned.coins);

  assert.equal(update(s, DAY).quests.length, 0, 'never pays twice');
});

test('finishing every quest pays the sweep bonus once', () => {
  const s = ready();
  s.quests = { ids: ['q_scrub', 'q_shop'], done: [], sweep: false };
  for (let i = 0; i < 3; i += 1) recordAction(s, 'scrub');
  recordPurchase(s);

  const earned = update(s, DAY);
  assert.equal(earned.sweep, true);
  assert.equal(earned.quests.length, 2);
  assert.equal(update(s, DAY).sweep, false, 'the bonus does not repeat');
});

test('quests reset at the turn of the day, badges and totals do not', () => {
  const s = ready();
  s.quests = { ids: ['q_scrub'], done: [], sweep: false };
  for (let i = 0; i < 3; i += 1) recordAction(s, 'scrub');
  update(s, DAY);
  assert.equal(s.quests.done.length, 1);
  assert.equal(s.totals.scrub, 3);

  update(s, '2026-09-09');
  assert.equal(s.quests.done.includes('q_scrub'), false, 'yesterday\'s progress is gone');
  assert.equal(s.counts.scrub, 0);
  assert.equal(s.totals.scrub, 3, 'lifetime totals survive');
  assert.ok(s.unlocked.includes('first_touch'), 'badges survive');
});

test('quest progress never overshoots its own target', () => {
  const s = ready();
  s.quests = { ids: ['q_scrub'], done: [], sweep: false };
  for (let i = 0; i < 9; i += 1) recordAction(s, 'scrub');
  const [quest] = questBoard(s);
  assert.equal(quest.have, quest.target);
});

/* -------------------------------- badges ------------------------------ */

test('a badge is awarded once and pays its coins', () => {
  const s = ready();
  const before = s.coins;
  recordAction(s, 'scrub');

  const earned = update(s, DAY);
  const badge = earned.badges.find((b) => b.id === 'first_touch');
  assert.ok(badge, 'caring once earns First Contact');
  assert.equal(s.coins, before + earned.coins);
  assert.ok(s.unlocked.includes('first_touch'));

  const again = update(s, DAY);
  assert.equal(again.badges.some((b) => b.id === 'first_touch'), false);
});

test('badges track levels, collections and streaks', () => {
  const s = ready();
  s.level = 25;
  s.streak = 7;
  s.coins = 1000;
  s.owned = COSMETICS.map((c) => c.id);
  const ids = update(s, DAY).badges.map((b) => b.id);

  for (const expected of ['level5', 'level10', 'level25', 'regular', 'devoted',
    'wealthy', 'dapper', 'collector', 'completionist']) {
    assert.ok(ids.includes(expected), `expected ${expected}`);
  }
});

test('the pristine badge needs every stat high at the same time', () => {
  const s = ready();
  s.stats = { clean: 95, shine: 95, joy: 95, moss: 20 };
  assert.equal(update(s, DAY).badges.some((b) => b.id === 'pristine'), false);
  s.stats.moss = 92;
  assert.equal(update(s, DAY).badges.some((b) => b.id === 'pristine'), true);
});

test('every badge has the fields the UI renders', () => {
  for (const badge of BADGES) {
    assert.match(badge.id, /^[a-z0-9_]+$/);
    assert.ok(badge.icon && badge.name && badge.blurb, badge.id);
    assert.ok(badge.coins > 0, badge.id);
    assert.equal(typeof badge.test, 'function', badge.id);
  }
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length, 'ids are unique');
});

/* --------------------------- engine plumbing -------------------------- */

test('playing the game actually moves the counters', () => {
  const s = newState(T0);
  rollDay(s, DAY);
  s.stats.clean = 10;
  applyAction(s, 'scrub', T0);
  assert.equal(s.counts.scrub, 1);
  assert.equal(s.totals.actions, 1);

  s.coins = 9999;
  s.level = 9;
  buy(s, 'hat_beanie');
  assert.equal(s.counts.buys, 1);
  assert.equal(s.totals.buys, 1);
});
