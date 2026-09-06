/**
 * Leaderboard.
 *
 * The app has no server, so the rival keepers are simulated locally: a
 * fixed roster whose levels are derived from a seeded PRNG plus the
 * number of days since a fixed anchor date. That makes them stable
 * within a day, gently climbing over time, and identical on every
 * device - no data ever leaves the browser.
 */

const ANCHOR = Date.UTC(2026, 0, 1); // levels grow from this date onward

const ROSTER = [
  ['Marble Mae', 'Sir Lumps'], ['Gravel Gus', 'Chonk'], ['Pyrite Pia', 'Glitter'],
  ['Basalt Bo', 'Nugget'], ['Quarry Quinn', 'Biscuit'], ['Flint Fay', 'Sparky'],
  ['Slate Sam', 'Grumbles'], ['Onyx Ola', 'Midnight'], ['Cobble Cass', 'Pebbleton'],
  ['Shale Shay', 'Wobble'], ['Geode Gil', 'Sprinkle'], ['Chalk Chi', 'Dusty'],
  ['Amber Ade', 'Toffee'], ['Jasper Jo', 'Rumble'], ['Talc Tam', 'Squish'],
  ['Boulder Bex', 'Tank'], ['Pumice Pat', 'Floaty'], ['Quartz Kit', 'Prism'],
  ['Granite Gwen', 'Stoney'], ['Ruby Rex', 'Blush'], ['Mica Moss', 'Flaky'],
  ['Coral Cyn', 'Reef'], ['Ash Avi', 'Cinder'], ['Opal Odie', 'Shimmer'],
];

/** Small deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysSinceAnchor(now) {
  return Math.max(0, Math.floor((now - ANCHOR) / 86400000));
}

/**
 * The simulated rivals for a given moment.
 * @returns {Array<{id:string,keeper:string,rock:string,level:number,xp:number}>}
 */
export function rivals(now = Date.now()) {
  const day = daysSinceAnchor(now);
  return ROSTER.map(([keeper, rock], i) => {
    const rand = rng(i * 7919 + 13);
    const start = 1 + Math.floor(rand() * 10);          // where they began
    // Square-root growth: keepers climb quickly at first and then slow
    // down, so the board still has a spread years after the anchor date
    // instead of everyone sitting pinned at the cap.
    const pace = 0.02 + rand() ** 2 * 0.75;
    const wobble = rng(i * 31 + day)() * 2 - 1;         // stable within the day
    const level = Math.max(1, Math.min(99,
      Math.round(start + pace * Math.sqrt(day) * 2.2 + wobble)));
    const xp = Math.floor(rng(i * 977 + day)() * (80 + level * 45));
    return { id: `rival-${i}`, keeper, rock, level, xp, isPlayer: false };
  });
}

/** Sorts a copy of `entries`. Ties break on XP, then keeper name. */
export function sortEntries(entries, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.level !== b.level) return sign * (a.level - b.level);
    if (a.xp !== b.xp) return sign * (a.xp - b.xp);
    return a.keeper.localeCompare(b.keeper);
  });
}

/** Full board: rivals plus the player, sorted, with 1-based ranks. */
export function board(state, dir = 'desc', now = Date.now()) {
  const player = {
    id: 'player',
    keeper: state.playerName || 'You',
    rock: state.rockName || 'Pebbles',
    level: state.level,
    xp: Math.floor(state.xp),
    isPlayer: true,
  };
  const sorted = sortEntries([...rivals(now), player], dir);
  return sorted.map((entry, i) => ({ ...entry, rank: i + 1 }));
}

/** The player's standing, counted from the top regardless of sort order. */
export function standing(state, now = Date.now()) {
  const ranked = board(state, 'desc', now);
  const me = ranked.find((e) => e.isPlayer);
  return { place: me ? me.rank : ranked.length, total: ranked.length };
}
