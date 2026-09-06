/**
 * Draws the rock. Everything lives in one 240x200 SVG scene: the rock
 * domes up to about y=62 and sits on the ground line at y=172, which is
 * the coordinate space the cosmetics in config.js are authored against.
 */

import { itemById } from './config.js';
import { careScore, mood } from './engine.js';

const ROCK_BODY = 'M40,172 C28,142 40,104 74,86 C100,72 116,58 146,66 C184,76 204,110 204,144 C204,164 194,172 176,172 Z';
const ROCK_SHADE = 'M124,172 C170,166 192,138 186,96 C199,112 205,132 204,146 C203,165 193,172 176,172 Z';

const SPECKS = [
  [72, 142, 5], [98, 154, 4], [122, 132, 3.4], [150, 152, 4.6], [172, 130, 3.8],
  [86, 116, 3.2], [134, 162, 4.2], [180, 152, 3.4], [110, 100, 3], [158, 92, 3.6],
];

const SPARKLES = [[64, 84, 9], [188, 100, 7], [148, 56, 6], [46, 132, 5]];

const MOUTHS = {
  radiant: `<path d="M102,144 q24,26 48,-4" fill="none" stroke="#2b2733" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="78" cy="150" rx="9" ry="6" fill="#ff8fa6" opacity=".62"/>
    <ellipse cx="176" cy="144" rx="9" ry="6" fill="#ff8fa6" opacity=".62"/>`,
  happy: `<path d="M106,145 q20,16 40,-3" fill="none" stroke="#2b2733" stroke-width="5" stroke-linecap="round"/>`,
  meh: `<path d="M108,150 L148,147" fill="none" stroke="#2b2733" stroke-width="5" stroke-linecap="round"/>`,
  sad: `<path d="M106,155 q20,-13 40,-3" fill="none" stroke="#2b2733" stroke-width="5" stroke-linecap="round"/>`,
  awful: `<path d="M104,157 q22,-16 44,-4" fill="none" stroke="#2b2733" stroke-width="5" stroke-linecap="round"/>
    <path d="M96,132 l-14,-7 M158,127 l14,-8" stroke="#2b2733" stroke-width="4" stroke-linecap="round"/>
    <path d="M99,132 q6,12 0,17 q-6,-5 0,-17 Z" fill="#6fb7e8"/>`,
};

const star = (x, y, r) =>
  `<path d="M${x},${y - r} L${x + r * 0.28},${y - r * 0.28} L${x + r},${y} L${x + r * 0.28},${y + r * 0.28} L${x},${y + r} L${x - r * 0.28},${y + r * 0.28} L${x - r},${y} L${x - r * 0.28},${y - r * 0.28} Z" fill="#fff6c9" opacity=".9"/>`;

let sceneCount = 0;

/** Builds the SVG markup for one scene. */
export function sceneSvg({ equipped, stats, moodId, decor = true }) {
  // Unique per scene: several of these SVGs share one document.
  const uid = `rk${(sceneCount += 1)}`;
  const skin = itemById(equipped.skin) || itemById('skin_granite');
  const eyes = itemById(equipped.eyes) || itemById('eyes_googly');
  const hat = itemById(equipped.hat);
  const acc = itemById(equipped.acc);
  const bg = itemById(equipped.bg);

  const clean = stats?.clean ?? 100;
  const shine = stats?.shine ?? 100;
  const moss = stats?.moss ?? 0;

  let grime = '';
  if (decor && clean < 62) {
    const count = Math.min(SPECKS.length, Math.ceil((62 - clean) / 6));
    grime = SPECKS.slice(0, count)
      .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r * 1.25}" ry="${r}" fill="#5c4a2e" opacity=".55"/>`)
      .join('');
  }

  let glow = '';
  if (decor && shine > 68) {
    const n = shine > 88 ? 4 : shine > 78 ? 3 : 2;
    glow = SPARKLES.slice(0, n).map(([x, y, r]) => star(x, y, r)).join('');
  }

  let mossPatch = '';
  if (decor && moss > 52) {
    const o = Math.min(0.95, (moss - 52) / 48 + 0.35);
    mossPatch = `<g opacity="${o.toFixed(2)}" fill="#5f9e57">
      <ellipse cx="66" cy="160" rx="20" ry="9"/>
      <ellipse cx="188" cy="158" rx="16" ry="8"/>
      <ellipse cx="128" cy="170" rx="26" ry="7"/>
    </g>`;
  } else if (decor && moss < 22) {
    mossPatch = `<g stroke="#5b4b3f" stroke-width="2" fill="none" opacity=".5" stroke-linecap="round">
      <path d="M64,146 l10,10 -5,8"/><path d="M188,148 l-9,11 6,9"/>
    </g>`;
  }

  return `
<svg class="rock-svg" viewBox="0 0 240 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
  <defs><clipPath id="clip-${uid}"><path d="${ROCK_BODY}"/></clipPath></defs>
  ${bg?.svg || ''}
  <ellipse cx="122" cy="176" rx="92" ry="13" fill="#000" opacity=".22"/>
  <g class="rock-body">
    <path d="${ROCK_BODY}" fill="${skin.fill}"/>
    <path d="${ROCK_SHADE}" fill="${skin.shade}" opacity=".85"/>
    <ellipse cx="88" cy="104" rx="24" ry="15" fill="${skin.light}" opacity=".55" transform="rotate(-28 88 104)"/>
    <g clip-path="url(#clip-${uid})">${mossPatch}${grime}</g>
    ${eyes.svg}
    ${MOUTHS[moodId] || MOUTHS.happy}
    ${acc?.svg || ''}
    ${hat?.svg || ''}
  </g>
  ${glow}
</svg>`;
}

/** A signature of everything that affects the drawing, to avoid redraws. */
function signature(state) {
  const s = state.stats;
  return [
    state.equipped.skin, state.equipped.eyes, state.equipped.hat,
    state.equipped.acc, state.equipped.bg, mood(state).id,
    Math.round(s.clean / 6), Math.round(s.shine / 6), Math.round(s.moss / 6),
  ].join('|');
}

/** Draws the live rock into `el`, skipping the work when nothing changed. */
export function drawRock(el, state) {
  const sig = signature(state);
  if (el.dataset.sig === sig) return;
  el.dataset.sig = sig;
  const bg = itemById(state.equipped.bg);
  el.style.background = bg?.css || '#2a2739';
  el.innerHTML = sceneSvg({
    equipped: state.equipped,
    stats: state.stats,
    moodId: mood(state).id,
  });
}

/** A clean preview of the rock wearing `item`, for shop cards. */
export function previewSvg(state, item) {
  const equipped = { ...state.equipped, [item.slot]: item.id };
  const moodId = careScore(state.stats) >= 45 ? 'happy' : 'meh';
  return sceneSvg({
    equipped,
    stats: { clean: 100, shine: 60, moss: 40 },
    moodId,
    decor: false,
  });
}

export function previewBackground(state, item) {
  const bg = item.slot === 'bg' ? item : itemById(state.equipped.bg);
  return bg?.css || '#2a2739';
}
