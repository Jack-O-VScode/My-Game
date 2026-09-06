/**
 * localStorage wrapper. Every access is guarded: private-mode browsers
 * and blocked-cookie settings throw on read *and* write, and the game
 * must still be playable (just not persistent) when that happens.
 */

import { SAVE_KEY } from './config.js';
import { newState, normalise } from './engine.js';

let warned = false;

function warn(err) {
  if (warned) return;
  warned = true;
  console.warn('[pet-rock] saves are disabled in this browser:', err?.message || err);
}

export function load(now = Date.now()) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { state: newState(now), fresh: true };
    return { state: normalise(JSON.parse(raw), now), fresh: false };
  } catch (err) {
    warn(err);
    return { state: newState(now), fresh: true };
  }
}

export function save(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    warn(err);
    return false;
  }
}

export function wipe() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    warn(err);
  }
}
