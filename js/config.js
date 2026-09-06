/**
 * Static game data: tuning constants, stat/action definitions and the
 * cosmetics catalogue. Nothing in here mutates - it is safe to import
 * from the engine, the renderer and the tests alike.
 */

export const SAVE_KEY = 'pet-rock-sim';
export const SAVE_VERSION = 1;

/** Care stats. `decay` is points lost per real-world hour. */
export const STATS = [
  { id: 'clean', label: 'Clean', icon: '🧼', decay: 4.5, low: 'grubby' },
  { id: 'shine', label: 'Shine', icon: '✨', decay: 5.0, low: 'dull' },
  { id: 'joy', label: 'Joy', icon: '💛', decay: 5.5, low: 'lonely' },
  { id: 'moss', label: 'Moss', icon: '🌿', decay: 3.5, low: 'parched' },
];

/** One care action per stat. `gain` is the restore amount, capped at 100. */
export const ACTIONS = [
  { id: 'scrub', stat: 'clean', label: 'Scrub', icon: '🧽', gain: 32, cooldown: 12000 },
  { id: 'polish', stat: 'shine', label: 'Polish', icon: '🪄', gain: 30, cooldown: 15000 },
  { id: 'play', stat: 'joy', label: 'Play', icon: '🎲', gain: 28, cooldown: 10000 },
  { id: 'water', stat: 'moss', label: 'Water', icon: '💧', gain: 34, cooldown: 18000 },
];

export const TUNING = {
  /** Care score that breaks even on XP. Above it you gain, below it you lose. */
  xpNeutralCare: 55,
  xpSlope: 0.7,
  xpPerHourMax: 30,
  xpPerHourMin: -14,
  /** How much of an absence is simulated when you come back. */
  offlineCapHours: 24,
  /** Longest slice the simulation integrates in one step. */
  stepMinutes: 5,
  /** Instant reward for a care action. */
  xpPerAction: 3,
  /** Coins per point of stat actually restored. */
  coinsPerPoint: 0.35,
  startingCoins: 40,
  /** Daily check-in bonus: base + streak * step, capped. */
  dailyBase: 20,
  dailyStep: 6,
  dailyCap: 80,
};

/** XP required to advance *from* this level to the next. */
export function xpForLevel(level) {
  return 80 + (Math.max(1, level) - 1) * 45;
}

/** Coins granted on reaching a level. */
export function levelReward(level) {
  return 25 + level * 5;
}

export const MOODS = [
  { id: 'radiant', min: 85, label: 'Radiant', blurb: 'Positively glowing.' },
  { id: 'happy', min: 65, label: 'Content', blurb: 'A well-kept rock.' },
  { id: 'meh', min: 45, label: 'Restless', blurb: 'Could use some attention.' },
  { id: 'sad', min: 25, label: 'Grumpy', blurb: 'Feeling neglected.' },
  { id: 'awful', min: 0, label: 'Miserable', blurb: 'Please. Anything.' },
];

export function moodFor(care) {
  return MOODS.find((m) => care >= m.min) || MOODS[MOODS.length - 1];
}

/* ------------------------------------------------------------------ *
 * Cosmetics
 *
 * slot: skin | eyes | hat | acc | bg   (one equipped item per slot)
 * Items with price 0 are owned from the start.
 * SVG fragments are drawn into a 240x200 viewBox scene; the rock sits
 * on the ground line at y=172 and domes up to roughly y=62.
 * ------------------------------------------------------------------ */

export const SLOTS = [
  { id: 'skin', label: 'Rock' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'hat', label: 'Hats' },
  { id: 'acc', label: 'Extras' },
  { id: 'bg', label: 'Scenes' },
];

export const COSMETICS = [
  /* ---- skins: fill/shade/light drive the rock body paths ---- */
  { id: 'skin_granite', slot: 'skin', name: 'Granite', price: 0, level: 1, emoji: '🪨',
    fill: '#8d8b95', shade: '#6f6d78', light: '#a5a3ad' },
  { id: 'skin_basalt', slot: 'skin', name: 'Basalt', price: 110, level: 1, emoji: '🌑',
    fill: '#54525f', shade: '#3d3b47', light: '#6b6979' },
  { id: 'skin_sandstone', slot: 'skin', name: 'Sandstone', price: 140, level: 2, emoji: '🏜️',
    fill: '#c9a271', shade: '#a88356', light: '#dcbb8d' },
  { id: 'skin_quartz', slot: 'skin', name: 'Rose Quartz', price: 260, level: 4, emoji: '🌸',
    fill: '#e59ab4', shade: '#c47b96', light: '#f4bcd0' },
  { id: 'skin_emerald', slot: 'skin', name: 'Emerald', price: 340, level: 6, emoji: '💚',
    fill: '#4fb08a', shade: '#37876a', light: '#71cfa8' },
  { id: 'skin_obsidian', slot: 'skin', name: 'Obsidian', price: 460, level: 9, emoji: '⬛',
    fill: '#2a2733', shade: '#1b1922', light: '#443f52' },
  { id: 'skin_lava', slot: 'skin', name: 'Molten', price: 620, level: 12, emoji: '🌋',
    fill: '#b3452f', shade: '#7e2c1e', light: '#e8703f' },

  /* ---- eyes ---- */
  { id: 'eyes_googly', slot: 'eyes', name: 'Googly', price: 0, level: 1, emoji: '👀',
    svg: `<g>
      <ellipse cx="105" cy="117" rx="15" ry="15.5" fill="#fdfbf7"/>
      <ellipse cx="149" cy="113" rx="14" ry="14.5" fill="#fdfbf7"/>
      <circle cx="107" cy="120" r="6.4" fill="#24212c"/>
      <circle cx="151" cy="116" r="6" fill="#24212c"/>
      <circle cx="104.6" cy="117.4" r="2.1" fill="#fff"/>
      <circle cx="148.8" cy="113.4" r="2" fill="#fff"/>
    </g>` },
  { id: 'eyes_sleepy', slot: 'eyes', name: 'Sleepy', price: 90, level: 1, emoji: '😴',
    svg: `<g fill="none" stroke="#24212c" stroke-width="4" stroke-linecap="round">
      <path d="M93,118 q12,10 24,0"/>
      <path d="M137,114 q12,10 24,0"/>
    </g>` },
  { id: 'eyes_shades', slot: 'eyes', name: 'Shades', price: 170, level: 2, emoji: '😎',
    svg: `<g>
      <path d="M86,108 L168,102" stroke="#1d1a24" stroke-width="5" stroke-linecap="round"/>
      <rect x="86" y="105" width="36" height="24" rx="9" fill="#1d1a24"/>
      <rect x="130" y="101" width="36" height="24" rx="9" fill="#1d1a24"/>
      <path d="M92,112 l9,9" stroke="#6f8bd6" stroke-width="4" stroke-linecap="round" opacity=".8"/>
      <path d="M136,108 l9,9" stroke="#6f8bd6" stroke-width="4" stroke-linecap="round" opacity=".8"/>
    </g>` },
  { id: 'eyes_heart', slot: 'eyes', name: 'Smitten', price: 240, level: 4, emoji: '😍',
    svg: `<g fill="#e8556f">
      <path d="M105,127 C92,117 92,105 100,105 C104,105 105,109 105,110 C105,109 106,105 110,105 C118,105 118,117 105,127 Z"/>
      <path d="M149,123 C136,113 136,101 144,101 C148,101 149,105 149,106 C149,105 150,101 154,101 C162,101 162,113 149,123 Z"/>
    </g>` },
  { id: 'eyes_star', slot: 'eyes', name: 'Starstruck', price: 320, level: 5, emoji: '🤩',
    svg: `<g fill="#ffd166">
      <path d="M105,102 l4.4,9.6 10.6,1.2 -7.9,7.1 2.2,10.4 -9.3,-5.3 -9.3,5.3 2.2,-10.4 -7.9,-7.1 10.6,-1.2 Z"/>
      <path d="M149,98 l4.1,9 9.9,1.1 -7.4,6.6 2,9.7 -8.6,-4.9 -8.6,4.9 2,-9.7 -7.4,-6.6 9.9,-1.1 Z"/>
    </g>` },
  { id: 'eyes_monocle', slot: 'eyes', name: 'Distinguished', price: 380, level: 7, emoji: '🧐',
    svg: `<g>
      <ellipse cx="105" cy="117" rx="14" ry="14.5" fill="#fdfbf7"/>
      <circle cx="106" cy="119" r="6" fill="#24212c"/>
      <path d="M137,114 q12,-9 24,0" fill="none" stroke="#24212c" stroke-width="4" stroke-linecap="round"/>
      <circle cx="149" cy="120" r="17" fill="#cfe4ff" fill-opacity=".28" stroke="#e0c169" stroke-width="3.5"/>
      <path d="M160,133 q6,14 -2,22" fill="none" stroke="#e0c169" stroke-width="2.5" stroke-linecap="round"/>
    </g>` },

  /* ---- hats ---- */
  { id: 'hat_beanie', slot: 'hat', name: 'Beanie', price: 70, level: 1, emoji: '🧢',
    svg: `<g transform="translate(128,66) rotate(-6)">
      <path d="M-34,4 C-33,-21 -13,-33 5,-31 C25,-29 35,-14 34,4 Z" fill="#d8574f"/>
      <path d="M-34,4 C-33,-21 -13,-33 5,-31 C10,-30 14,-28 17,-25 C-2,-24 -18,-12 -22,4 Z" fill="#e8776c" opacity=".55"/>
      <rect x="-38" y="1" width="76" height="12" rx="6" fill="#f3e2cd"/>
      <circle cx="2" cy="-34" r="7" fill="#f3e2cd"/>
    </g>` },
  { id: 'hat_party', slot: 'hat', name: 'Party Cone', price: 130, level: 2, emoji: '🎉',
    svg: `<g transform="translate(126,64) rotate(-9)">
      <path d="M0,-48 L19,4 L-19,4 Z" fill="#ff7ab8"/>
      <path d="M0,-48 L7,-26 L-7,-22 Z" fill="#ffd166" opacity=".9"/>
      <path d="M-13,-9 L13,-9" stroke="#7bdff2" stroke-width="4" stroke-linecap="round"/>
      <circle cx="0" cy="-51" r="6" fill="#7bdff2"/>
    </g>` },
  { id: 'hat_top', slot: 'hat', name: 'Top Hat', price: 190, level: 3, emoji: '🎩',
    svg: `<g transform="translate(130,64) rotate(-5)">
      <ellipse cx="0" cy="4" rx="32" ry="8" fill="#241f2e"/>
      <rect x="-19" y="-38" width="38" height="42" rx="3" fill="#2f2a3c"/>
      <rect x="-19" y="-14" width="38" height="9" fill="#c9a227"/>
      <ellipse cx="0" cy="-38" rx="19" ry="5" fill="#3a3449"/>
    </g>` },
  { id: 'hat_cowboy', slot: 'hat', name: 'Ten Gallon', price: 280, level: 5, emoji: '🤠',
    svg: `<g transform="translate(128,66) rotate(-4)">
      <ellipse cx="0" cy="2" rx="43" ry="10" fill="#9b6a3c"/>
      <path d="M-19,2 C-21,-23 -7,-31 0,-31 C9,-31 21,-23 19,2 Z" fill="#835734"/>
      <rect x="-20" y="-7" width="40" height="7" rx="2" fill="#4f341f"/>
    </g>` },
  { id: 'hat_halo', slot: 'hat', name: 'Halo', price: 360, level: 6, emoji: '😇',
    svg: `<g transform="translate(128,44)">
      <ellipse rx="26" ry="8" fill="none" stroke="#ffe28a" stroke-width="6"/>
      <ellipse rx="26" ry="8" fill="none" stroke="#fff6d6" stroke-width="2"/>
    </g>` },
  { id: 'hat_crown', slot: 'hat', name: 'Crown', price: 520, level: 8, emoji: '👑',
    svg: `<g transform="translate(128,64)">
      <path d="M-29,5 L-29,-21 L-14,-8 L0,-27 L14,-8 L29,-21 L29,5 Z" fill="#f2c14e" stroke="#c1912b" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="0" cy="-1" r="4.2" fill="#e0524f"/>
      <circle cx="-17" cy="1" r="3.2" fill="#5ac8d8"/>
      <circle cx="17" cy="1" r="3.2" fill="#5ac8d8"/>
    </g>` },
  { id: 'hat_wizard', slot: 'hat', name: 'Wizard Hat', price: 640, level: 10, emoji: '🧙',
    svg: `<g transform="translate(126,64) rotate(-7)">
      <ellipse cx="0" cy="3" rx="38" ry="9" fill="#3b3170"/>
      <path d="M0,-56 C10,-30 16,-12 22,3 L-22,3 C-14,-14 -8,-32 0,-56 Z" fill="#4a3e8c"/>
      <path d="M4,-40 l3,6 6,1 -4.5,4.4 1,6.2 -5.5,-3 -5.5,3 1,-6.2 -4.5,-4.4 6,-1 Z" fill="#ffd166"/>
      <circle cx="-9" cy="-16" r="2.6" fill="#ffd166"/>
    </g>` },

  /* ---- extras ---- */
  { id: 'acc_bowtie', slot: 'acc', name: 'Bow Tie', price: 80, level: 1, emoji: '🎀',
    svg: `<g transform="translate(126,161)">
      <path d="M0,0 L-19,-9 L-19,9 Z" fill="#d8574f"/>
      <path d="M0,0 L19,-9 L19,9 Z" fill="#d8574f"/>
      <circle cx="0" cy="0" r="5" fill="#b0413a"/>
    </g>` },
  { id: 'acc_scarf', slot: 'acc', name: 'Scarf', price: 150, level: 2, emoji: '🧣',
    svg: `<g>
      <path d="M70,144 C98,159 156,161 192,140 L193,151 C157,171 96,169 68,155 Z" fill="#5d8ac9"/>
      <path d="M156,153 c10,4 14,10 13,18 l-13,-1 c1,-6 -2,-10 -8,-13 Z" fill="#4a75ad"/>
      <path d="M86,153 l-2,8 M106,159 l-1,8 M126,161 l-1,8" stroke="#7ba7de" stroke-width="3" stroke-linecap="round"/>
    </g>` },
  { id: 'acc_moss', slot: 'acc', name: 'Moss Wig', price: 180, level: 3, emoji: '🌿',
    svg: `<g fill="#5aa860">
      <ellipse cx="112" cy="70" rx="20" ry="11"/>
      <ellipse cx="140" cy="66" rx="17" ry="9"/>
      <ellipse cx="126" cy="61" rx="13" ry="8" fill="#6dbd72"/>
      <ellipse cx="156" cy="74" rx="11" ry="7" fill="#4e9455"/>
    </g>` },
  { id: 'acc_headphones', slot: 'acc', name: 'Headphones', price: 300, level: 4, emoji: '🎧',
    svg: `<g>
      <path d="M62,132 C64,86 96,58 130,58 C166,58 196,88 197,132" fill="none" stroke="#2f2a3c" stroke-width="9" stroke-linecap="round"/>
      <rect x="50" y="122" width="24" height="34" rx="11" fill="#e0524f"/>
      <rect x="186" y="122" width="24" height="34" rx="11" fill="#e0524f"/>
    </g>` },
  { id: 'acc_umbrella', slot: 'acc', name: 'Tiny Umbrella', price: 400, level: 6, emoji: '☂️',
    svg: `<g transform="translate(198,72) rotate(16)">
      <path d="M-30,0 A30,26 0 0 1 30,0 Z" fill="#e0524f"/>
      <path d="M-30,0 A30,26 0 0 1 -10,0 A20,20 0 0 0 10,0 A20,20 0 0 0 30,0" fill="#f4f0e6" opacity=".85"/>
      <path d="M0,0 L0,42 q0,8 -8,8" fill="none" stroke="#6b5a44" stroke-width="4" stroke-linecap="round"/>
    </g>` },
  { id: 'acc_jetpack', slot: 'acc', name: 'Jet Pack', price: 580, level: 9, emoji: '🚀',
    svg: `<g>
      <rect x="34" y="104" width="24" height="48" rx="11" fill="#b8bcc7"/>
      <rect x="39" y="110" width="14" height="16" rx="6" fill="#8f94a3"/>
      <path d="M46,152 C40,166 42,180 46,188 C50,180 52,166 46,152 Z" fill="#ff9d3f"/>
      <path d="M46,158 C43,168 44,176 46,181 C48,176 49,168 46,158 Z" fill="#ffe08a"/>
    </g>` },

  /* ---- scenes (background css + optional decorative svg layer) ---- */
  { id: 'bg_meadow', slot: 'bg', name: 'Meadow', price: 0, level: 1, emoji: '🌾',
    css: 'linear-gradient(180deg,#7fc4e8 0%,#bfe3c6 62%,#7fae6b 100%)',
    svg: `<g>
      <ellipse cx="46" cy="182" rx="70" ry="24" fill="#6ba05e" opacity=".55"/>
      <ellipse cx="206" cy="186" rx="64" ry="22" fill="#6ba05e" opacity=".45"/>
      <circle cx="34" cy="40" r="16" fill="#fff3b0" opacity=".9"/>
    </g>` },
  { id: 'bg_beach', slot: 'bg', name: 'Beach', price: 190, level: 2, emoji: '🏖️',
    css: 'linear-gradient(180deg,#ffd79a 0%,#8fd3e8 46%,#f0dfae 62%,#e6cb8e 100%)',
    svg: `<g>
      <circle cx="200" cy="42" r="20" fill="#ffb86b" opacity=".95"/>
      <path d="M0,120 q30,-8 60,0 t60,0 t60,0 t60,0 v10 H0 Z" fill="#ffffff" opacity=".35"/>
      <path d="M0,132 q30,-8 60,0 t60,0 t60,0 t60,0 v8 H0 Z" fill="#ffffff" opacity=".25"/>
    </g>` },
  { id: 'bg_sunset', slot: 'bg', name: 'Sunset', price: 250, level: 3, emoji: '🌇',
    css: 'linear-gradient(180deg,#4a3070 0%,#c25b7c 46%,#f6a06a 78%,#f7cf9a 100%)',
    svg: `<g>
      <circle cx="128" cy="120" r="34" fill="#ffd9a0" opacity=".8"/>
      <path d="M0,150 L52,104 L96,150 Z" fill="#5b3a63" opacity=".8"/>
      <path d="M120,152 L176,96 L240,152 Z" fill="#4a2f54" opacity=".85"/>
    </g>` },
  { id: 'bg_cave', slot: 'bg', name: 'Crystal Cave', price: 340, level: 5, emoji: '🔮',
    css: 'linear-gradient(180deg,#221a35 0%,#3b2a5c 60%,#241b38 100%)',
    svg: `<g>
      <path d="M0,0 L18,44 L36,0 Z" fill="#4b3a72"/>
      <path d="M54,0 L66,30 L78,0 Z" fill="#4b3a72"/>
      <path d="M204,0 L216,38 L228,0 Z" fill="#4b3a72"/>
      <path d="M18,196 L28,150 L38,196 Z" fill="#7d5fc4" opacity=".8"/>
      <path d="M210,198 L220,156 L230,198 Z" fill="#7d5fc4" opacity=".8"/>
      <circle cx="196" cy="60" r="3" fill="#c9b6ff" opacity=".9"/>
      <circle cx="44" cy="88" r="2.4" fill="#c9b6ff" opacity=".8"/>
    </g>` },
  { id: 'bg_space', slot: 'bg', name: 'Low Orbit', price: 480, level: 7, emoji: '🌌',
    css: 'linear-gradient(180deg,#0b0a1e 0%,#1c1740 60%,#2a1f52 100%)',
    svg: `<g fill="#ffffff">
      <circle cx="24" cy="30" r="1.8" opacity=".9"/><circle cx="70" cy="18" r="1.2" opacity=".7"/>
      <circle cx="118" cy="38" r="1.6" opacity=".8"/><circle cx="176" cy="22" r="1.3" opacity=".7"/>
      <circle cx="214" cy="52" r="1.9" opacity=".9"/><circle cx="52" cy="72" r="1.1" opacity=".6"/>
      <circle cx="196" cy="96" r="1.4" opacity=".7"/>
      <g opacity=".95"><circle cx="204" cy="36" r="15" fill="#c98b5e"/>
      <ellipse cx="204" cy="36" rx="25" ry="6" fill="none" stroke="#e8c79a" stroke-width="3" opacity=".85"/></g>
    </g>` },
  { id: 'bg_aurora', slot: 'bg', name: 'Aurora', price: 620, level: 10, emoji: '🌠',
    css: 'linear-gradient(180deg,#07142b 0%,#0f3350 45%,#123a4d 100%)',
    svg: `<g opacity=".55">
      <path d="M-10,80 C40,30 80,110 130,54 C170,10 210,72 250,40 L250,0 L-10,0 Z" fill="#3ee0a0" opacity=".45"/>
      <path d="M-10,104 C40,60 90,124 140,78 C180,42 216,96 250,70 L250,20 L-10,20 Z" fill="#5aa8e8" opacity=".4"/>
      <circle cx="40" cy="26" r="1.6" fill="#fff"/><circle cx="150" cy="16" r="1.3" fill="#fff"/>
      <ellipse cx="128" cy="192" rx="120" ry="26" fill="#0d2a3d" opacity=".8"/>
    </g>` },
];

export const DEFAULT_EQUIPPED = {
  skin: 'skin_granite',
  eyes: 'eyes_googly',
  hat: null,
  acc: null,
  bg: 'bg_meadow',
};

export const FREE_ITEMS = COSMETICS.filter((c) => c.price === 0).map((c) => c.id);

const BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

export function itemById(id) {
  return id ? BY_ID.get(id) || null : null;
}
