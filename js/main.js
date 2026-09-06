/**
 * Controller: owns the live state, drives the clock, wires the UI
 * handlers and registers the service worker / install flow.
 */

import { ACTIONS, TUNING, itemById } from './config.js';
import {
  applyAction, buy, canBuy, claimDaily, equip, newState, simulate,
} from './engine.js';
import { load, save, wipe } from './storage.js';
import { sfx, setEnabled } from './sfx.js';
import {
  bump, dialog, initUI, reactToCare, renderBoard, renderCare, renderMore,
  renderShop, renderTop, setVersionLine, showInstall, showScreen, tickCooldowns, toast,
} from './ui.js';

const APP_VERSION = '1.0.0';
const TICK_MS = 1000;
const SAVE_MS = 5000;

let state = newState();
let screen = 'care';
let lastSave = 0;
let deferredInstall = null;

const dayKey = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function humanDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.floor(mins / 60);
  if (hours >= 36) {
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const rest = mins % 60;
  return rest ? `${hours}h ${rest}m` : `${hours} hour${hours === 1 ? '' : 's'}`;
}

/* ------------------------------ rendering ----------------------------- */

function render(now = Date.now()) {
  renderTop(state);
  if (screen === 'care') renderCare(state, now);
  else if (screen === 'shop') renderShop(state);
  else if (screen === 'board') renderBoard(state, now);
  else if (screen === 'more') renderMore(state);
}

function announce(events) {
  for (const ev of events) {
    if (ev.type === 'levelup') {
      toast(`Level ${ev.level}! +${ev.coins} coins`, 'gold');
      sfx.levelUp();
      bump('level');
      bump('coins');
    } else if (ev.type === 'leveldown') {
      toast(`Neglected… dropped to level ${ev.level}`, 'bad');
      sfx.levelDown();
      bump('level');
    }
  }
}

/* -------------------------------- clock ------------------------------- */

function tick() {
  const now = Date.now();
  const { events } = simulate(state, now);
  announce(events);
  render(now);
  if (now - lastSave > SAVE_MS) {
    lastSave = now;
    save(state);
  }
}

function frame() {
  if (screen === 'care') tickCooldowns(state, Date.now());
  requestAnimationFrame(frame);
}

/* ------------------------------- handlers ----------------------------- */

function onAction(actionId) {
  const result = applyAction(state, actionId, Date.now());
  if (!result.ok) {
    if (result.reason === 'cooldown') sfx.nope();
    return;
  }
  const action = ACTIONS.find((a) => a.id === actionId);
  announce(result.events);
  reactToCare();

  if (result.gained <= 0) {
    toast(`${state.rockName} is already perfectly ${action.label.toLowerCase()}ed`, '');
    sfx.tap();
  } else {
    sfx.care();
    if (result.coins > 0) {
      sfx.coin();
      bump('coins');
      toast(`${action.icon} +${result.gained} ${action.stat} · 🪙 +${result.coins}`, 'good');
    } else {
      toast(`${action.icon} +${result.gained} ${action.stat}`, 'good');
    }
  }
  save(state);
  render();
}

function onItem(itemId) {
  const item = itemById(itemId);
  if (!item) return;

  if (state.owned.includes(itemId)) {
    if (state.equipped[item.slot] === itemId) {
      const cleared = equip(state, item.slot, null);
      if (!cleared.ok) { sfx.nope(); toast('Your rock needs at least one of those', ''); return; }
      toast(`Took off the ${item.name.toLowerCase()}`, '');
    } else {
      equip(state, item.slot, itemId);
      toast(`${item.emoji} ${item.name} on!`, 'good');
    }
    sfx.tap();
  } else {
    const check = canBuy(state, itemId);
    if (!check.ok) {
      sfx.nope();
      if (check.reason === 'level') toast(`Reach level ${check.need} to unlock ${item.name}`, 'bad');
      else if (check.reason === 'coins') toast(`Need 🪙 ${check.need - state.coins} more for ${item.name}`, 'bad');
      return;
    }
    buy(state, itemId);
    sfx.buy();
    bump('coins');
    toast(`Bought ${item.emoji} ${item.name}`, 'gold');
  }
  save(state);
  render();
}

function onSort() {
  state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
  sfx.tap();
  save(state);
  renderBoard(state);
}

async function onRenameRock() {
  const name = await dialog.prompt('Name your rock', state.rockName,
    '<p>What should we call this handsome mineral?</p>');
  if (name === null) return;
  setName('rockName', name);
}

function setName(field, value) {
  const clean = String(value || '').trim().slice(0, 18);
  if (!clean) { render(); return; }
  state[field] = clean;
  save(state);
  render();
}

function onSound(on) {
  state.sound = !!on;
  setEnabled(state.sound);
  if (on) sfx.tap();
  save(state);
}

async function onReset() {
  const ok = await dialog.confirm('Start over?',
    '<p>Your rock, its level, coins and every cosmetic you own will be gone for good. This cannot be undone.</p>',
    'Release my rock');
  if (!ok) return;
  wipe();
  state = newState();
  save(state);
  showScreen('care');
  screen = 'care';
  toast('A fresh pebble appears', 'good');
  render();
}

function onScreen(name) {
  screen = name;
  render();
}

/* --------------------------- install / PWA ---------------------------- */

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: window-controls-overlay)').matches ||
  window.navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function setupInstall() {
  if (isStandalone()) {
    showInstall(false);
    return;
  }

  if (isIOS()) {
    showInstall(true, 'Add Pet Rock to your Home Screen to play full screen and offline.');
  } else {
    showInstall(true, 'Install Pet Rock as an app on this device — it runs offline afterwards.');
  }

  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    deferredInstall = ev;
    showInstall(true, 'Ready to install — one tap and Pet Rock lives on your device.');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    showInstall(false);
    toast('Installed! Look for the rock icon.', 'good');
  });
}

async function onInstall() {
  if (deferredInstall) {
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    deferredInstall = null;
    if (outcome !== 'accepted') toast('Maybe later, then', '');
    return;
  }
  if (isIOS()) {
    await dialog.info('Add to Home Screen', `
      <ol>
        <li>Tap the <b>Share</b> button in Safari (the square with an arrow).</li>
        <li>Scroll down and choose <b>Add to Home Screen</b>.</li>
        <li>Tap <b>Add</b> — Pet Rock now opens like any other app.</li>
      </ol>
      <p>Safari is required: Chrome and Firefox on iOS cannot install web apps.</p>`);
    return;
  }
  await dialog.info('Install Pet Rock', `
    <ol>
      <li>Open your browser menu (⋮ or the address-bar install icon).</li>
      <li>Choose <b>Install app</b> / <b>Add to Home screen</b>.</li>
      <li>Confirm — Pet Rock gets its own window and works offline.</li>
    </ol>
    <p>Chrome, Edge and most Chromium browsers support this on Windows and Android.</p>`);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    setVersionLine(`Pet Rock Simulator v${APP_VERSION}`);
    return;
  }
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url))
    .then(() => setVersionLine(`Pet Rock Simulator v${APP_VERSION} · offline ready`))
    .catch(() => setVersionLine(`Pet Rock Simulator v${APP_VERSION} · offline cache unavailable`));
}

/* -------------------------------- boot -------------------------------- */

function boot() {
  const now = Date.now();
  const loaded = load(now);
  state = loaded.state;
  setEnabled(state.sound);

  initUI({
    onAction, onItem, onSort, onRenameRock, onSound, onReset, onInstall, onScreen,
    onShopTab: () => renderShop(state),
    onName: setName,
  });

  const away = simulate(state, now);
  announce(away.events);

  const daily = claimDaily(state, dayKey());
  render(now);

  if (loaded.fresh) {
    toast('Meet your new pet rock 🪨', 'good');
  } else if (away.elapsedMs > 5 * 60000) {
    const capped = away.elapsedMs > TUNING.offlineCapHours * 3600000;
    toast(`Away for ${humanDuration(away.elapsedMs)}${capped ? ' (capped)' : ''}`, '');
  }
  if (daily.claimed) {
    setTimeout(() => {
      toast(`Day ${daily.streak} streak · 🪙 +${daily.coins}`, 'gold');
      sfx.coin();
      bump('coins');
    }, 700);
  }

  save(state);
  lastSave = now;

  setInterval(tick, TICK_MS);
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
    else save(state);
  });
  window.addEventListener('pagehide', () => save(state));
  window.addEventListener('blur', () => save(state));

  setupInstall();
  registerServiceWorker();
}

boot();
