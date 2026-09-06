/**
 * Pure game logic. Every function here takes a state object and returns
 * a result - no DOM, no storage, no timers - so it can be exercised by
 * the unit tests in tests/engine.test.js.
 */

import {
  ACTIONS, DEFAULT_EQUIPPED, FREE_ITEMS, SAVE_VERSION,
  STATS, TUNING, itemById, moodFor, levelReward, xpForLevel,
} from './config.js';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const HOUR = 3600000;

export function newState(now = Date.now()) {
  const stats = {};
  for (const s of STATS) stats[s.id] = 80;
  return {
    v: SAVE_VERSION,
    rockName: 'Pebbles',
    playerName: 'You',
    level: 1,
    xp: 0,
    bestLevel: 1,
    coins: TUNING.startingCoins,
    stats,
    owned: [...FREE_ITEMS],
    equipped: { ...DEFAULT_EQUIPPED },
    cooldowns: {},
    careCount: 0,
    streak: 0,
    lastDay: null,
    createdAt: now,
    lastTick: now,
    sound: true,
    sortDir: 'desc',
  };
}

/** Repairs a loaded save so a partial or older blob can't crash the game. */
export function normalise(raw, now = Date.now()) {
  const base = newState(now);
  if (!raw || typeof raw !== 'object') return base;
  const s = { ...base, ...raw, v: SAVE_VERSION };

  s.stats = { ...base.stats };
  for (const stat of STATS) {
    // Only real numbers win: `null` coerces to 0 and would silently
    // starve a stat that was merely missing from the save.
    const val = raw.stats?.[stat.id];
    if (typeof val === 'number' && Number.isFinite(val)) s.stats[stat.id] = clamp(val, 0, 100);
  }

  s.level = clamp(Math.floor(Number(raw.level) || 1), 1, 999);
  s.xp = Math.max(0, Number(raw.xp) || 0);
  s.bestLevel = Math.max(s.level, Math.floor(Number(raw.bestLevel) || 1));
  s.coins = Math.max(0, Math.floor(Number(raw.coins) || 0));
  s.careCount = Math.max(0, Math.floor(Number(raw.careCount) || 0));
  s.streak = Math.max(0, Math.floor(Number(raw.streak) || 0));
  s.rockName = String(raw.rockName || base.rockName).slice(0, 18) || base.rockName;
  s.playerName = String(raw.playerName || base.playerName).slice(0, 18) || base.playerName;

  const ownedSet = new Set(FREE_ITEMS);
  if (Array.isArray(raw.owned)) {
    for (const id of raw.owned) if (itemById(id)) ownedSet.add(id);
  }
  s.owned = [...ownedSet];

  s.equipped = { ...DEFAULT_EQUIPPED };
  for (const [slot, id] of Object.entries(raw.equipped || {})) {
    const item = itemById(id);
    if (item && item.slot === slot && ownedSet.has(id)) s.equipped[slot] = id;
  }

  s.cooldowns = {};
  for (const a of ACTIONS) {
    const t = Number(raw.cooldowns?.[a.id]);
    if (Number.isFinite(t) && t > now) s.cooldowns[a.id] = Math.min(t, now + a.cooldown);
  }

  const last = Number(raw.lastTick);
  s.lastTick = Number.isFinite(last) ? Math.min(last, now) : now;
  s.createdAt = Number(raw.createdAt) || s.lastTick;
  s.sound = raw.sound !== false;
  s.sortDir = raw.sortDir === 'asc' ? 'asc' : 'desc';
  s.lastDay = typeof raw.lastDay === 'string' ? raw.lastDay : null;
  return s;
}

/** Average of all care stats, 0-100. */
export function careScore(stats) {
  let total = 0;
  for (const s of STATS) total += clamp(Number(stats[s.id]) || 0, 0, 100);
  return total / STATS.length;
}

/** XP earned (or lost) per hour at a given care score. */
export function xpRate(care) {
  const raw = (care - TUNING.xpNeutralCare) * TUNING.xpSlope;
  return clamp(raw, TUNING.xpPerHourMin, TUNING.xpPerHourMax);
}

/**
 * Applies XP, rolling the level up or down as thresholds are crossed.
 * Mutates `state` and pushes {type, level} onto `events`.
 */
export function addXp(state, amount, events = []) {
  // Keep the high-water mark honest even if the level was set directly.
  state.bestLevel = Math.max(state.bestLevel || 1, state.level);
  state.xp += amount;

  while (state.xp >= xpForLevel(state.level)) {
    state.xp -= xpForLevel(state.level);
    state.level += 1;
    const reward = levelReward(state.level);
    state.coins += reward;
    state.bestLevel = Math.max(state.bestLevel, state.level);
    events.push({ type: 'levelup', level: state.level, coins: reward });
  }

  while (state.xp < 0 && state.level > 1) {
    state.level -= 1;
    // Drop back into the previous level's bar rather than resetting it.
    state.xp += xpForLevel(state.level);
    events.push({ type: 'leveldown', level: state.level });
  }

  if (state.xp < 0) state.xp = 0; // floored at level 1
  return events;
}

/**
 * Advances the world from state.lastTick to `now`: stats decay, XP moves
 * with the care score. Long absences are integrated in small steps so a
 * rock that decays halfway through the gap stops bleeding XP at the old
 * rate. Time away is capped by TUNING.offlineCapHours.
 */
export function simulate(state, now = Date.now()) {
  const events = [];
  const elapsedMs = now - state.lastTick;
  if (!(elapsedMs > 0)) {
    state.lastTick = now;
    return { events, elapsedMs: 0, cappedMs: 0 };
  }

  const cappedMs = Math.min(elapsedMs, TUNING.offlineCapHours * HOUR);
  const stepMs = TUNING.stepMinutes * 60000;
  let remaining = cappedMs;
  let xpDelta = 0;

  while (remaining > 0) {
    const slice = Math.min(stepMs, remaining);
    const hours = slice / HOUR;
    xpDelta += xpRate(careScore(state.stats)) * hours;
    for (const stat of STATS) {
      state.stats[stat.id] = clamp(state.stats[stat.id] - stat.decay * hours, 0, 100);
    }
    remaining -= slice;
  }

  addXp(state, xpDelta, events);
  state.lastTick = now;
  return { events, elapsedMs, cappedMs, xpDelta };
}

export function actionById(id) {
  return ACTIONS.find((a) => a.id === id) || null;
}

export function cooldownLeft(state, actionId, now = Date.now()) {
  return Math.max(0, (state.cooldowns[actionId] || 0) - now);
}

/**
 * Performs a care action. Coins scale with the stat points actually
 * restored, so hammering a full bar earns nothing.
 */
export function applyAction(state, actionId, now = Date.now()) {
  const action = actionById(actionId);
  if (!action) return { ok: false, reason: 'unknown' };
  if (cooldownLeft(state, actionId, now) > 0) {
    return { ok: false, reason: 'cooldown', waitMs: cooldownLeft(state, actionId, now) };
  }

  const before = state.stats[action.stat];
  const after = clamp(before + action.gain, 0, 100);
  const gained = after - before;
  state.stats[action.stat] = after;
  state.cooldowns[actionId] = now + action.cooldown;
  state.careCount += 1;

  const coins = Math.round(gained * TUNING.coinsPerPoint);
  state.coins += coins;

  const events = [];
  addXp(state, gained > 0 ? TUNING.xpPerAction : 0, events);
  return { ok: true, gained: Math.round(gained), coins, events, stat: action.stat };
}

/** Once-per-day check-in bonus. `day` is a YYYY-MM-DD local date key. */
export function claimDaily(state, day) {
  if (state.lastDay === day) return { claimed: false };
  const prev = state.lastDay ? new Date(`${state.lastDay}T00:00:00`) : null;
  const today = new Date(`${day}T00:00:00`);
  const gapDays = prev ? Math.round((today - prev) / 86400000) : null;

  state.streak = gapDays === 1 ? state.streak + 1 : 1;
  state.lastDay = day;
  const coins = Math.min(
    TUNING.dailyCap,
    TUNING.dailyBase + (state.streak - 1) * TUNING.dailyStep,
  );
  state.coins += coins;
  return { claimed: true, coins, streak: state.streak };
}

export function canBuy(state, itemId) {
  const item = itemById(itemId);
  if (!item) return { ok: false, reason: 'unknown' };
  if (state.owned.includes(itemId)) return { ok: false, reason: 'owned' };
  if (state.level < item.level) return { ok: false, reason: 'level', need: item.level };
  if (state.coins < item.price) return { ok: false, reason: 'coins', need: item.price };
  return { ok: true, item };
}

export function buy(state, itemId) {
  const check = canBuy(state, itemId);
  if (!check.ok) return check;
  state.coins -= check.item.price;
  state.owned.push(itemId);
  state.equipped[check.item.slot] = itemId;
  return { ok: true, item: check.item };
}

/** Equips an owned item, or clears the slot when itemId is null. */
export function equip(state, slot, itemId) {
  if (itemId === null) {
    if (slot === 'skin' || slot === 'eyes' || slot === 'bg') return { ok: false, reason: 'required' };
    state.equipped[slot] = null;
    return { ok: true };
  }
  const item = itemById(itemId);
  if (!item || item.slot !== slot) return { ok: false, reason: 'unknown' };
  if (!state.owned.includes(itemId)) return { ok: false, reason: 'locked' };
  state.equipped[slot] = itemId;
  return { ok: true, item };
}

export function mood(state) {
  return moodFor(careScore(state.stats));
}

/** Stats that have fallen far enough to nag the player about. */
export function needs(state) {
  return STATS.filter((s) => state.stats[s.id] < 35);
}
