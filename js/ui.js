/**
 * DOM layer: renders state into the page and reports intent back to
 * main.js through the handlers passed to initUI(). It never mutates the
 * game state itself.
 */

import { ACTIONS, COSMETICS, SLOTS, STATS, xpForLevel } from './config.js';
import { careScore, cooldownLeft, mood, needs } from './engine.js';
import { board, standing } from './leaderboard.js';
import { describeError } from './online.js';
import { drawRock, previewBackground, previewSvg } from './render.js';

const STAT_COLOR = { clean: '#6fc9e8', shine: '#ffd166', joy: '#ff8fb0', moss: '#7ddc8f' };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

let handlers = {};
let activeSlot = 'skin';
let els = {};

export function initUI(h) {
  handlers = h;
  els = {
    rockName: $('rock-name'), moodLine: $('mood-line'), coinCount: $('coin-count'),
    coins: $('coins'), level: $('level'), xpFill: $('xp-fill'), xpText: $('xp-text'),
    xpTrack: $('xp-track'), stage: $('stage'), needNote: $('need-note'),
    stats: $('stats'), actions: $('actions'), shopTabs: $('shop-tabs'),
    shopGrid: $('shop-grid'), board: $('board'), sortBtn: $('sort-btn'),
    sortLabel: $('sort-label'), standing: $('standing'),
    boardStatus: $('board-status'), boardNote: $('board-note'),
    onlineStatus: $('online-status'), onlineConfig: $('online-config'),
    onlineClear: $('online-clear'), onlineDevice: $('online-device'),
    toasts: $('toasts'), modal: $('modal'), inputRock: $('input-rock'),
    inputKeeper: $('input-keeper'), soundToggle: $('sound-toggle'),
    installCard: $('install-card'), installBtn: $('install-btn'), installHint: $('install-hint'),
    resetBtn: $('reset-btn'), versionLine: $('version-line'),
  };

  buildStats();
  buildActions();
  buildShopTabs();

  document.querySelectorAll('.tab[data-screen]').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });

  els.sortBtn.addEventListener('click', () => handlers.onSort?.());
  els.boardStatus.addEventListener('click', () => handlers.onRefresh?.());
  els.onlineConfig.addEventListener('click', () => handlers.onConnect?.());
  els.onlineClear.addEventListener('click', () => handlers.onDisconnect?.());
  els.rockName.addEventListener('click', () => handlers.onRenameRock?.());
  els.installBtn.addEventListener('click', () => handlers.onInstall?.());
  els.resetBtn.addEventListener('click', () => handlers.onReset?.());
  els.soundToggle.addEventListener('change', () => handlers.onSound?.(els.soundToggle.checked));
  els.inputRock.addEventListener('change', () => handlers.onName?.('rockName', els.inputRock.value));
  els.inputKeeper.addEventListener('change', () => handlers.onName?.('playerName', els.inputKeeper.value));
}

/* ------------------------------- screens ------------------------------ */

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => {
    const on = s.id === `screen-${name}`;
    s.hidden = !on;
    s.classList.toggle('is-active', on);
  });
  document.querySelectorAll('.tab[data-screen]').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.screen === name);
  });
  window.scrollTo({ top: 0 });
  handlers.onScreen?.(name);
}

/* -------------------------------- build ------------------------------- */

function buildStats() {
  els.stats.innerHTML = STATS.map((s) => `
    <div class="stat" data-stat="${s.id}">
      <div class="stat-top">
        <b><span aria-hidden="true">${s.icon}</span> ${esc(s.label)}</b>
        <span class="stat-val" id="statval-${s.id}">100%</span>
      </div>
      <div class="stat-track" role="progressbar" aria-label="${esc(s.label)}"
           aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" id="stattrack-${s.id}">
        <div class="stat-fill" id="statfill-${s.id}"></div>
      </div>
    </div>`).join('');
}

function buildActions() {
  els.actions.innerHTML = ACTIONS.map((a) => `
    <button class="action" type="button" data-action="${a.id}" aria-label="${esc(a.label)}">
      <span class="emoji" aria-hidden="true">${a.icon}</span>
      <span class="label">${esc(a.label)}</span>
      <span class="cd" id="cd-${a.id}" aria-hidden="true"></span>
    </button>`).join('');
  els.actions.querySelectorAll('.action').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onAction?.(btn.dataset.action));
  });
}

function buildShopTabs() {
  els.shopTabs.innerHTML = SLOTS.map((s) => `
    <button class="tab-chip${s.id === activeSlot ? ' is-active' : ''}" type="button"
            role="tab" data-slot="${s.id}">${esc(s.label)}</button>`).join('');
  els.shopTabs.querySelectorAll('.tab-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeSlot = btn.dataset.slot;
      els.shopTabs.querySelectorAll('.tab-chip').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.slot === activeSlot);
      });
      els.shopGrid.dataset.sig = '';
      handlers.onShopTab?.();
    });
  });
}

/* ------------------------------- rendering ---------------------------- */

export function renderTop(state, net = null) {
  els.rockName.textContent = state.rockName;
  els.coinCount.textContent = Math.floor(state.coins);
  els.level.textContent = state.level;

  const need = xpForLevel(state.level);
  const pct = Math.max(0, Math.min(100, (state.xp / need) * 100));
  els.xpFill.style.width = `${pct}%`;
  els.xpText.textContent = `${Math.floor(state.xp)} / ${need}`;
  els.xpTrack.setAttribute('aria-valuenow', Math.round(pct));

  const m = mood(state);
  const place = standing(state, Date.now(), net?.entries || null).place;
  els.moodLine.textContent = `${m.label} · ${m.blurb} · rank #${place}`;
}

export function renderCare(state, now = Date.now()) {
  drawRock(els.stage, state);
  els.stage.classList.toggle('sad', careScore(state.stats) < 40);

  for (const s of STATS) {
    const val = state.stats[s.id];
    const pct = Math.max(0, Math.min(100, val));
    const fill = $(`statfill-${s.id}`);
    fill.style.width = `${pct}%`;
    fill.style.background = pct < 30 ? 'var(--bad)' : STAT_COLOR[s.id];
    $(`statval-${s.id}`).textContent = `${Math.round(pct)}%`;
    $(`stattrack-${s.id}`).setAttribute('aria-valuenow', Math.round(pct));
    document.querySelector(`.stat[data-stat="${s.id}"]`).classList.toggle('low', pct < 30);
  }

  const low = needs(state).map((s) => s.low);
  const list = low.length > 1
    ? `${low.slice(0, -1).join(', ')} and ${low[low.length - 1]}`
    : low[0];
  els.needNote.textContent = low.length ? `${state.rockName} is feeling ${list}.` : '';

  tickCooldowns(state, now);
}

/** Cheap per-frame update of the cooldown rings and urgency hints. */
export function tickCooldowns(state, now = Date.now()) {
  for (const a of ACTIONS) {
    const btn = els.actions.querySelector(`[data-action="${a.id}"]`);
    if (!btn) continue;
    const left = cooldownLeft(state, a.id, now);
    const p = left > 0 ? left / a.cooldown : 0;
    $(`cd-${a.id}`).style.setProperty('--p', p.toFixed(3));
    btn.classList.toggle('cooling', left > 0);
    btn.disabled = left > 0;
    btn.classList.toggle('urgent', left === 0 && state.stats[a.stat] < 35);
  }
}

export function reactToCare() {
  els.stage.classList.remove('react');
  void els.stage.offsetWidth; // restart the animation
  els.stage.classList.add('react');
  setTimeout(() => els.stage.classList.remove('react'), 600);
}

export function bump(el) {
  const node = el === 'coins' ? els.coins : document.querySelector('.level-badge');
  if (!node) return;
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}

export function renderShop(state) {
  const items = COSMETICS.filter((c) => c.slot === activeSlot);
  const sig = [activeSlot, state.coins, state.level, state.owned.length,
    Object.values(state.equipped).join(','), state.equipped.skin].join('|');
  if (els.shopGrid.dataset.sig === sig) return;
  els.shopGrid.dataset.sig = sig;

  els.shopGrid.innerHTML = items.map((item) => {
    const owned = state.owned.includes(item.id);
    const equipped = state.equipped[item.slot] === item.id;
    const locked = !owned && state.level < item.level;
    const cls = ['item', owned ? 'owned' : '', equipped ? 'equipped' : '', locked ? 'locked' : ''].join(' ');
    const tag = equipped ? 'Equipped'
      : owned ? 'Tap to wear'
      : locked ? `Unlocks at Lv ${item.level}`
      : `🪙 ${item.price}`;
    return `
      <button class="${cls}" type="button" data-item="${item.id}"
              aria-label="${esc(item.name)}, ${esc(tag)}">
        <div class="item-art" style="background:${previewBackground(state, item)}">
          ${previewSvg(state, item)}
        </div>
        <div class="item-body">
          <div class="item-name">${item.emoji} ${esc(item.name)}</div>
          <div class="item-tag">${esc(tag)}</div>
        </div>
      </button>`;
  }).join('');

  els.shopGrid.querySelectorAll('.item').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onItem?.(btn.dataset.item));
  });
}

function ago(ms) {
  const secs = Math.round(ms / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

/** The status line above the board, and the honest small print below it. */
function renderNetLine(net, now) {
  const status = net?.status || 'off';
  const line = els.boardStatus;
  line.className = `net-line ${status}`;

  if (status === 'live') {
    const count = net.entries?.length || 0;
    const when = net.fetchedAt ? ` · updated ${ago(now - net.fetchedAt)}` : '';
    line.textContent = `🌐 Live · ${count} keeper${count === 1 ? '' : 's'} online${when}`;
    line.title = 'Tap to refresh';
    els.boardNote.textContent =
      'One pet per device. Levels are reported by each player\u2019s own browser, '
      + 'so enjoy the top of the board as friendly competition rather than gospel.';
  } else if (status === 'loading') {
    line.textContent = 'Connecting to the worldwide board…';
    els.boardNote.textContent = '';
  } else if (status === 'error') {
    line.textContent = `⚠️ ${describeError(net.error, net.detail)} — showing practice rivals`;
    line.title = 'Tap to try again';
    els.boardNote.textContent =
      'Your pet is safe on this device and will be published again as soon as the '
      + 'connection comes back.';
  } else {
    line.textContent = '🎮 Practice mode — these rivals are simulated on your device';
    line.title = '';
    els.boardNote.textContent =
      'Nothing is uploaded and nobody else can see your rock. Connect a Supabase '
      + 'project under More to play on one shared, worldwide leaderboard.';
  }
}

export function renderBoard(state, net = null, now = Date.now()) {
  const dir = state.sortDir;
  const remote = net?.status === 'live' ? net.entries : null;
  const sig = [dir, state.level, Math.floor(state.xp / 10), state.playerName,
    state.rockName, Math.floor(now / 3600000), net?.status,
    net?.fetchedAt || 0, remote?.length || 0].join('|');

  els.sortBtn.classList.toggle('asc', dir === 'asc');
  els.sortLabel.textContent = dir === 'asc' ? 'Lowest first' : 'Highest first';
  els.sortBtn.setAttribute('aria-label',
    `Sort order: ${dir === 'asc' ? 'lowest level first' : 'highest level first'}. Tap to reverse.`);

  renderNetLine(net, now);

  const me = standing(state, now, remote);
  els.standing.textContent = `You are #${me.place} of ${me.total}`;

  if (els.board.dataset.sig === sig) return;
  els.board.dataset.sig = sig;

  els.board.innerHTML = board(state, dir, now, remote).map((e) => `
    <li class="row-entry${e.isPlayer ? ' me' : ''}">
      <span class="rank">${e.rank}</span>
      <span class="who">
        <span class="who-name">${esc(e.keeper)}${e.isPlayer ? ' (you)' : ''}</span>
        <span class="who-rock">🪨 ${esc(e.rock)}</span>
      </span>
      <span class="lvl">Lv ${e.level}</span>
    </li>`).join('');
}

export function renderMore(state, net = null) {
  if (document.activeElement !== els.inputRock) els.inputRock.value = state.rockName;
  if (document.activeElement !== els.inputKeeper) els.inputKeeper.value = state.playerName;
  els.soundToggle.checked = !!state.sound;

  const status = net?.status || 'off';
  const connected = status !== 'off';
  els.onlineConfig.textContent = connected ? 'Change project' : 'Connect Supabase';
  els.onlineClear.hidden = !connected;

  if (status === 'live') {
    const count = net.entries?.length || 0;
    els.onlineStatus.textContent =
      `Connected · sharing one board with ${count} keeper${count === 1 ? '' : 's'}.`;
  } else if (status === 'loading') {
    els.onlineStatus.textContent = 'Connecting…';
  } else if (status === 'error') {
    els.onlineStatus.textContent = `${describeError(net.error, net.detail)}.`;
  } else {
    els.onlineStatus.textContent =
      'Not connected. The leaderboard shows simulated rivals and your pet stays on '
      + 'this device.';
  }

  els.onlineDevice.textContent = net?.deviceId
    ? `This device plays as ${net.deviceId.slice(0, 8)} — one pet per device.`
    : '';
}

export function setVersionLine(text) {
  els.versionLine.textContent = text;
}

export function showInstall(show, hint) {
  els.installCard.hidden = !show;
  if (hint) els.installHint.textContent = hint;
}

/* -------------------------------- toasts ------------------------------ */

export function toast(message, kind = '') {
  const node = document.createElement('div');
  node.className = `toast ${kind}`.trim();
  node.textContent = message;
  els.toasts.appendChild(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 320);
  }, 2400);
  while (els.toasts.children.length > 4) els.toasts.firstChild.remove();
}

/* -------------------------------- modal ------------------------------- */

function openModal({
  title, bodyHTML = '', okLabel = 'OK', cancelLabel = 'Cancel',
  input = null, fields = null,
}) {
  return new Promise((resolve) => {
    const modal = els.modal;
    $('modal-title').textContent = title;
    const body = $('modal-body');
    body.innerHTML = bodyHTML;

    let field = null;
    const inputs = [];

    if (input !== null) {
      field = document.createElement('input');
      field.type = 'text';
      field.maxLength = 18;
      field.value = input;
      field.autocomplete = 'off';
      body.appendChild(field);
    }

    for (const spec of fields || []) {
      const wrap = document.createElement('label');
      wrap.className = 'field';
      const caption = document.createElement('span');
      caption.textContent = spec.label;
      const box = document.createElement('input');
      box.type = 'text';
      box.value = spec.value || '';
      box.placeholder = spec.placeholder || '';
      box.autocomplete = 'off';
      box.spellcheck = false;
      wrap.append(caption, box);
      body.appendChild(wrap);
      inputs.push({ name: spec.name, box });
      if (!field) field = box;
    }

    const ok = $('modal-ok');
    const cancel = $('modal-cancel');
    ok.textContent = okLabel;
    cancel.textContent = cancelLabel;
    cancel.hidden = cancelLabel === null;

    const close = (value) => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      modal.removeEventListener('cancel', onCancel);
      field?.removeEventListener('keydown', onKey);
      if (modal.close) modal.close(); else modal.removeAttribute('open');
      resolve(value);
    };
    const onOk = () => {
      if (inputs.length) {
        const out = {};
        for (const { name, box } of inputs) out[name] = box.value.trim();
        close(out);
        return;
      }
      close(field ? field.value.trim() : true);
    };
    const onCancel = (ev) => { ev?.preventDefault?.(); close(null); };
    const onKey = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); onOk(); } };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    modal.addEventListener('cancel', onCancel);
    field?.addEventListener('keydown', onKey);

    if (modal.showModal) modal.showModal(); else modal.setAttribute('open', '');
    setTimeout(() => field?.select(), 50);
  });
}

export const dialog = {
  prompt: (title, value, bodyHTML = '') => openModal({ title, bodyHTML, input: value, okLabel: 'Save' }),
  form: (title, bodyHTML, fields, okLabel = 'Save') => openModal({ title, bodyHTML, fields, okLabel }),
  confirm: (title, bodyHTML, okLabel = 'Confirm') => openModal({ title, bodyHTML, okLabel }),
  info: (title, bodyHTML) => openModal({ title, bodyHTML, okLabel: 'Got it', cancelLabel: null }),
};
