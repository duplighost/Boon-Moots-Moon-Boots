// Screen feel: shake, flash, slow-mo, hitstop, haptics. Honors reduced motion.
import { state } from '../state.js';
import { FX } from '../config.js';

export const reduced = () =>
  (typeof matchMedia !== 'undefined') && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const coarse = () =>
  (typeof matchMedia !== 'undefined') && matchMedia('(hover:none), (pointer:coarse)').matches;

export function addShake(v) { state.fx.shake = Math.max(state.fx.shake, v); }
export function addFlash(v) { state.fx.flash = Math.max(state.fx.flash, v); }
export function slowMo(t) { state.fx.slowMo = Math.max(state.fx.slowMo, t); }
export function hitPause(kind) {
  if (reduced()) return;
  state.fx.hitPause = Math.max(state.fx.hitPause, (FX.HIT_PAUSE[kind] || 10) / 1000);
}
export function haptic(ms = 18) {
  try { if (typeof navigator !== 'undefined' && navigator.vibrate && coarse()) navigator.vibrate(ms); } catch { /* no-op */ }
}

export function decayFx(raw) {
  const fx = state.fx;
  fx.slowMo = Math.max(0, fx.slowMo - raw);
  fx.hitPause = Math.max(0, fx.hitPause - raw);
  fx.shake = Math.max(0, fx.shake - raw * FX.SHAKE_DECAY);
  fx.flash = Math.max(0, fx.flash - raw * FX.FLASH_DECAY);
}
