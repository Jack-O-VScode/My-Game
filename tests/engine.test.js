import assert from 'node:assert/strict';
import test from 'node:test';

import { STATS, TUNING, xpForLevel } from '../js/config.js';
import {
  addXp, applyAction, buy, canBuy, careScore, claimDaily, cooldownLeft,
  equip, needs, newState, normalise, simulate, xpRate,
} from '../js/engine.js';
import { board, rivals, sortEntries, standing } from '../js/leaderboard.js';

const HOUR = 3600000;
const T0 = Date.UTC(2026, 5, 1, 12, 0, 0);

const withStats = (value, now = T0) => {
  const s = newState(now);
  for (const stat of STATS) s.stats[stat.id] = value;
  return s;
};

/* --------------------------------- xp --------------------------------- */

test('xp rate rewards good care and punishes neglect', () => {
  assert.equal(xpRate(TUNING.xpNeutralCare), 0);
  assert.equal(xpRate(100), TUNING.xpPerHourMax);
  assert.equal(xpRate(0), TUNING.xpPerHourMin);
  assert.ok(xpRate(80) > 0 && xpRate(30) < 0);
});

test('levels climb and pay coins', () => {
  const s = newState(T0);
  const events = addXp(s, xpForLevel(1) + xpForLevel(2) + 5);
  assert.equal(s.level, 3);
  assert.equal(s.xp, 5);
  assert.equal(events.filter((e) => e.type === 'levelup').length, 2);
  assert.ok(s.coins > TUNING.startingCoins, 'level ups pay out');
  assert.equal(s.bestLevel, 3);
});

test('levels fall back into the previous bar when xp goes negative', () => {
  const s = newState(T0);
  s.level = 4;
  s.xp = 10;
  const events = addXp(s, -30);
  assert.equal(s.level, 3);
  assert.equal(s.xp, xpForLevel(3) - 20);
  assert.equal(events[0].type, 'leveldown');
  assert.equal(s.bestLevel, 4, 'best level is a high-water mark');
});

test('level 1 is the floor', () => {
  const s = newState(T0);
  addXp(s, -5000);
  assert.equal(s.level, 1);
  assert.equal(s.xp, 0);
});

/* ------------------------------ simulation ---------------------------- */

test('stats decay while you are away', () => {
  const s = withStats(100);
  simulate(s, T0 + 4 * HOUR);
  for (const stat of STATS) {
    assert.ok(Math.abs(s.stats[stat.id] - (100 - stat.decay * 4)) < 0.001, stat.id);
  }
  assert.equal(s.lastTick, T0 + 4 * HOUR);
});

test('a well kept rock gains levels over a few hours', () => {
  const s = withStats(100);
  const { events } = simulate(s, T0 + 6 * HOUR);
  assert.ok(events.some((e) => e.type === 'levelup'), 'expected a level up');
  assert.ok(s.level > 1);
});

test('a neglected rock loses levels', () => {
  const s = withStats(0);
  s.level = 5;
  s.xp = 10;
  const { events } = simulate(s, T0 + 20 * HOUR);
  assert.ok(events.some((e) => e.type === 'leveldown'), 'expected a level down');
  assert.ok(s.level < 5);
});

test('offline time is capped', () => {
  const short = withStats(0);
  short.level = 40;
  simulate(short, T0 + TUNING.offlineCapHours * HOUR);

  const forever = withStats(0);
  forever.level = 40;
  simulate(forever, T0 + 365 * 24 * HOUR);

  assert.equal(short.level, forever.level, 'a week away costs the same as the cap');
});

test('stats never leave 0..100', () => {
  const s = withStats(50);
  simulate(s, T0 + 100 * HOUR);
  for (const stat of STATS) {
    assert.ok(s.stats[stat.id] >= 0 && s.stats[stat.id] <= 100);
  }
});

test('simulate ignores clocks that jump backwards', () => {
  const s = withStats(60);
  const before = { ...s.stats };
  simulate(s, T0 - HOUR);
  assert.deepEqual(s.stats, before);
});

/* -------------------------------- actions ----------------------------- */

test('care restores its stat, pays coins and starts a cooldown', () => {
  const s = withStats(40);
  const res = applyAction(s, 'scrub', T0);
  assert.equal(res.ok, true);
  assert.equal(s.stats.clean, 72);
  assert.ok(res.coins > 0);
  assert.ok(cooldownLeft(s, 'scrub', T0) > 0);

  const again = applyAction(s, 'scrub', T0 + 1000);
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'cooldown');
});

test('topping up a full stat earns nothing', () => {
  const s = withStats(100);
  const res = applyAction(s, 'play', T0);
  assert.equal(res.gained, 0);
  assert.equal(res.coins, 0);
  assert.equal(s.stats.joy, 100);
});

test('needs lists only the stats that are running low', () => {
  const s = withStats(80);
  s.stats.moss = 10;
  assert.deepEqual(needs(s).map((n) => n.id), ['moss']);
});

/* --------------------------------- daily ------------------------------ */

test('daily bonus builds a streak and only pays once a day', () => {
  const s = newState(T0);
  const first = claimDaily(s, '2026-06-01');
  assert.equal(first.claimed, true);
  assert.equal(first.streak, 1);
  assert.equal(claimDaily(s, '2026-06-01').claimed, false);

  const second = claimDaily(s, '2026-06-02');
  assert.equal(second.streak, 2);
  assert.ok(second.coins > first.coins);

  const afterGap = claimDaily(s, '2026-06-10');
  assert.equal(afterGap.streak, 1, 'a missed day resets the streak');
});

/* --------------------------------- shop ------------------------------- */

test('buying needs coins and the right level', () => {
  const s = newState(T0);
  s.coins = 10000;
  assert.equal(canBuy(s, 'hat_crown').reason, 'level');

  s.level = 20;
  s.coins = 0;
  assert.equal(canBuy(s, 'hat_crown').reason, 'coins');

  s.coins = 10000;
  const before = s.coins;
  const res = buy(s, 'hat_crown');
  assert.equal(res.ok, true);
  assert.ok(s.owned.includes('hat_crown'));
  assert.equal(s.coins, before - res.item.price);
  assert.equal(s.equipped.hat, 'hat_crown', 'a purchase is worn immediately');
  assert.equal(canBuy(s, 'hat_crown').reason, 'owned');
});

test('only owned items can be equipped and core slots cannot be emptied', () => {
  const s = newState(T0);
  assert.equal(equip(s, 'hat', 'hat_crown').reason, 'locked');
  assert.equal(equip(s, 'skin', null).reason, 'required');
  assert.equal(equip(s, 'hat', null).ok, true);
  assert.equal(s.equipped.hat, null);
});

/* -------------------------------- saves ------------------------------- */

test('normalise repairs junk saves', () => {
  const s = normalise({
    level: -4, xp: 'nope', coins: -100, stats: { clean: 999, joy: null },
    owned: ['hat_crown', 'not_a_real_item'], equipped: { hat: 'hat_crown', skin: 'bogus' },
    lastTick: T0 + 999 * HOUR, rockName: 'x'.repeat(50),
  }, T0);

  assert.equal(s.level, 1);
  assert.equal(s.xp, 0);
  assert.equal(s.coins, 0);
  assert.equal(s.stats.clean, 100);
  assert.equal(s.stats.joy, 80);
  assert.ok(s.owned.includes('hat_crown'));
  assert.ok(!s.owned.includes('not_a_real_item'));
  assert.equal(s.equipped.hat, 'hat_crown');
  assert.equal(s.equipped.skin, 'skin_granite', 'unknown items fall back to the default');
  assert.ok(s.lastTick <= T0, 'a future timestamp cannot bank free progress');
  assert.equal(s.rockName.length, 18);
});

test('normalise survives nonsense input', () => {
  for (const junk of [null, undefined, 42, 'hello', []]) {
    const s = normalise(junk, T0);
    assert.equal(s.level, 1);
    assert.equal(careScore(s.stats), 80);
  }
});

/* ----------------------------- leaderboard ---------------------------- */

test('rivals are stable within a day and grow over time', () => {
  const a = rivals(T0);
  const b = rivals(T0 + 6 * HOUR);
  assert.deepEqual(a, b, 'same day, same rivals');

  const later = rivals(T0 + 200 * 24 * HOUR);
  const avg = (list) => list.reduce((n, r) => n + r.level, 0) / list.length;
  assert.ok(avg(later) > avg(a), 'rivals level up over the months');
  assert.ok(a.every((r) => r.level >= 1 && r.level <= 99));
});

test('sorting flips direction and keeps everyone', () => {
  const s = newState(T0);
  s.level = 12;
  const desc = board(s, 'desc', T0);
  const asc = board(s, 'asc', T0);

  assert.equal(desc.length, rivals(T0).length + 1);
  assert.equal(asc.length, desc.length);
  assert.deepEqual(desc.map((e) => e.level), [...asc.map((e) => e.level)].reverse());
  for (let i = 1; i < desc.length; i += 1) assert.ok(desc[i - 1].level >= desc[i].level);
  for (let i = 1; i < asc.length; i += 1) assert.ok(asc[i - 1].level <= asc[i].level);
  assert.deepEqual(desc.map((e) => e.rank), desc.map((_, i) => i + 1));
});

test('the player appears exactly once, with their own level', () => {
  const s = newState(T0);
  s.level = 7;
  s.rockName = 'Boulder';
  const mine = board(s, 'desc', T0).filter((e) => e.isPlayer);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].level, 7);
  assert.equal(mine[0].rock, 'Boulder');
});

test('standing is measured from the top whatever the sort order', () => {
  const low = newState(T0);
  low.level = 1;
  const high = newState(T0);
  high.level = 99;
  assert.equal(standing(high, T0).place, 1);
  assert.ok(standing(low, T0).place > standing(high, T0).place);
});

test('sortEntries breaks ties on xp then name', () => {
  const entries = [
    { keeper: 'B', level: 3, xp: 10 },
    { keeper: 'A', level: 3, xp: 10 },
    { keeper: 'C', level: 3, xp: 50 },
  ];
  assert.deepEqual(sortEntries(entries, 'desc').map((e) => e.keeper), ['C', 'A', 'B']);
});
