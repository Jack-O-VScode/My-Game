/**
 * Badges and daily quests: the short-term goals that give a reason to
 * open the app today, and the long-term ones that give a reason to keep
 * going between level-ups.
 *
 * Pure logic. Everything takes a state object and returns what changed,
 * so it can be exercised without a browser.
 */

import { COSMETICS, STATS } from './config.js';

const OWNABLE = COSMETICS.length;

/* ------------------------------- badges ------------------------------- */

export const BADGES = [
  { id: 'first_touch', icon: '👋', name: 'First Contact', blurb: 'Care for your rock once.',
    coins: 20, test: (s) => s.totals.actions >= 1 },
  { id: 'scrubber', icon: '🧽', name: 'Spotless', blurb: 'Scrub 25 times.',
    coins: 40, test: (s) => s.totals.scrub >= 25 },
  { id: 'gardener', icon: '🌿', name: 'Gardener', blurb: 'Water the moss 25 times.',
    coins: 40, test: (s) => s.totals.water >= 25 },
  { id: 'entertainer', icon: '🎲', name: 'Entertainer', blurb: 'Play 25 times.',
    coins: 40, test: (s) => s.totals.play >= 25 },
  { id: 'pristine', icon: '💎', name: 'Pristine', blurb: 'Get every need above 90% at once.',
    coins: 80, test: (s) => STATS.every((st) => s.stats[st.id] >= 90) },
  { id: 'level5', icon: '🪨', name: 'Rock Solid', blurb: 'Reach level 5.',
    coins: 50, test: (s) => s.level >= 5 },
  { id: 'level10', icon: '⛰️', name: 'Boulder Class', blurb: 'Reach level 10.',
    coins: 100, test: (s) => s.level >= 10 },
  { id: 'level25', icon: '🗿', name: 'Monolith', blurb: 'Reach level 25.',
    coins: 250, test: (s) => s.level >= 25 },
  { id: 'dapper', icon: '🎩', name: 'Dapper', blurb: 'Own 5 cosmetics.',
    coins: 40, test: (s) => s.owned.length >= 5 },
  { id: 'collector', icon: '🛍️', name: 'Collector', blurb: 'Own 15 cosmetics.',
    coins: 120, test: (s) => s.owned.length >= 15 },
  { id: 'completionist', icon: '🏆', name: 'Completionist', blurb: 'Own every cosmetic.',
    coins: 400, test: (s) => s.owned.length >= OWNABLE },
  { id: 'regular', icon: '📅', name: 'Regular', blurb: 'Visit 3 days running.',
    coins: 60, test: (s) => s.streak >= 3 },
  { id: 'devoted', icon: '❤️', name: 'Devoted', blurb: 'Visit 7 days running.',
    coins: 150, test: (s) => s.streak >= 7 },
  { id: 'wealthy', icon: '🪙', name: 'Rock Rich', blurb: 'Hold 1000 coins at once.',
    coins: 100, test: (s) => s.coins >= 1000 },
];

export const BADGE_BY_ID = new Map(BADGES.map((b) => [b.id, b]));

/* ---------------------------- daily quests ---------------------------- */

export const QUESTS = [
  { id: 'q_rounds', icon: '🔁', name: 'Do the rounds', target: 4,
    text: 'Use all four care actions', coins: 30,
    progress: (s) => ['scrub', 'polish', 'play', 'water'].filter((a) => s.counts[a] > 0).length },
  { id: 'q_busy', icon: '💪', name: 'Busy keeper', target: 8,
    text: 'Care for your rock 8 times', coins: 30,
    progress: (s) => s.counts.actions },
  { id: 'q_scrub', icon: '🧼', name: 'Deep clean', target: 3,
    text: 'Scrub three times', coins: 25,
    progress: (s) => s.counts.scrub },
  { id: 'q_water', icon: '💧', name: 'Well watered', target: 3,
    text: 'Water the moss three times', coins: 25,
    progress: (s) => s.counts.water },
  { id: 'q_shop', icon: '🛍️', name: 'Treat yourself', target: 1,
    text: 'Buy something from the boutique', coins: 35,
    progress: (s) => s.counts.buys },
  { id: 'q_shine', icon: '✨', name: 'Polished up', target: 1,
    text: 'Get Shine to 90%', coins: 30,
    progress: (s) => s.counts.shine90 },
  { id: 'q_happy', icon: '💛', name: 'Thoroughly spoiled', target: 1,
    text: 'Get every need above 80% at once', coins: 40,
    progress: (s) => s.counts.allHigh },
];

export const QUEST_BY_ID = new Map(QUESTS.map((q) => [q.id, q]));

/** All three quests done pays this on top. */
export const QUEST_SWEEP_BONUS = 50;

/** Small deterministic hash, so everyone gets the same quests each day. */
function hashDay(day) {
  let h = 2166136261;
  for (let i = 0; i < day.length; i += 1) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The three quests for a given YYYY-MM-DD, identical for every player. */
export function questsForDay(day) {
  const pool = [...QUESTS];
  const picked = [];
  let seed = hashDay(String(day));
  while (picked.length < 3 && pool.length) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    picked.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return picked;
}

/* ------------------------------ progress ------------------------------ */

export function freshCounts() {
  return { scrub: 0, polish: 0, play: 0, water: 0, actions: 0, buys: 0, shine90: 0, allHigh: 0 };
}

export function freshTotals() {
  return { scrub: 0, polish: 0, play: 0, water: 0, actions: 0, buys: 0 };
}

/** Called when a care action lands. */
export function recordAction(state, actionId) {
  if (state.counts[actionId] !== undefined) state.counts[actionId] += 1;
  if (state.totals[actionId] !== undefined) state.totals[actionId] += 1;
  state.counts.actions += 1;
  state.totals.actions += 1;
}

/** Called when something is bought. */
export function recordPurchase(state) {
  state.counts.buys += 1;
  state.totals.buys += 1;
}

/** Starts a new quest day, keeping lifetime totals. */
export function rollDay(state, day) {
  state.today = day;
  state.counts = freshCounts();
  state.quests = { ids: questsForDay(day).map((q) => q.id), done: [], sweep: false };
}

/**
 * Advances quest and badge state. Call it every tick; it is cheap and
 * only reports things that changed this call.
 *
 * @returns {{badges: object[], quests: object[], sweep: boolean, coins: number}}
 */
export function update(state, day) {
  if (state.today !== day) rollDay(state, day);

  // Threshold quests need a moment recorded when they are met.
  if (state.stats.shine >= 90) state.counts.shine90 = 1;
  if (STATS.every((st) => state.stats[st.id] > 80)) state.counts.allHigh = 1;

  const earned = { badges: [], quests: [], sweep: false, coins: 0 };

  for (const id of state.quests.ids) {
    if (state.quests.done.includes(id)) continue;
    const quest = QUEST_BY_ID.get(id);
    if (!quest || quest.progress(state) < quest.target) continue;
    state.quests.done.push(id);
    state.coins += quest.coins;
    earned.quests.push(quest);
    earned.coins += quest.coins;
  }

  if (!state.quests.sweep && state.quests.done.length >= state.quests.ids.length
      && state.quests.ids.length > 0) {
    state.quests.sweep = true;
    state.coins += QUEST_SWEEP_BONUS;
    earned.sweep = true;
    earned.coins += QUEST_SWEEP_BONUS;
  }

  for (const badge of BADGES) {
    if (state.unlocked.includes(badge.id)) continue;
    if (!badge.test(state)) continue;
    state.unlocked.push(badge.id);
    state.coins += badge.coins;
    earned.badges.push(badge);
    earned.coins += badge.coins;
  }

  return earned;
}

/** Today's quests with their progress, for rendering. */
export function questBoard(state) {
  return state.quests.ids.map((id) => {
    const quest = QUEST_BY_ID.get(id);
    if (!quest) return null;
    const done = state.quests.done.includes(id);
    return {
      ...quest,
      done,
      have: Math.min(quest.target, quest.progress(state)),
    };
  }).filter(Boolean);
}

export function badgeBoard(state) {
  return BADGES.map((b) => ({ ...b, earned: state.unlocked.includes(b.id) }));
}
