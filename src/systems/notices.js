// Behavior notices — the game noticing how you play (Boon Moots index.html:153-162,
// 903-909). Each fires once per save, lands as a whisper, and collects in the codex.
import { state, saveNow } from '../state.js';
import { BEHAVIOR_NOTICES } from '../data/lines.js';
import { whisper } from '../ui/overlays.js';

export function notice(id) {
  const text = BEHAVIOR_NOTICES[id] || id;
  whisper(text);
  if (!state.save.notices.includes(text)) {
    state.save.notices.push(text);
    state.save.notices = state.save.notices.slice(-120);
    saveNow();
  }
}

export function addLine(text) {
  if (!state.save.notices.includes(text)) {
    state.save.notices.push(text);
    state.save.notices = state.save.notices.slice(-120);
    saveNow();
  }
}

export function updateBehavior(room, p, move, aim, raw) {
  const run = state.run;
  if (!run || !room) return;
  const f = run.flags;
  if (p.hp <= 2 && p.hp > 0 && !f.lowhp) { f.lowhp = true; notice('lowhp'); }
  if (!move.active && !aim.active && room.enemies.length > 0) {
    if (p.stillT > 2.5 && !f.still) {
      f.still = true;
      notice('still');
    }
  }
  if (p.dashes >= 10 && !f.dash) { f.dash = true; notice('dash'); }
  if (aim.aiming) run.aimT = (run.aimT || 0) + raw;
  if (run.aimT > 16 && !f.aim) { f.aim = true; notice('aim'); }
}
