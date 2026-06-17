// DOM overlays + HUD. Imports only state; actions arrive as callbacks (no cycles).
import { state, saveNow } from '../state.js';
import { clamp } from '../rng.js';
import { SHRINE_DEFS, buyShrine, OATHS, oathsUnlocked, dailyBestToday } from '../systems/meta.js';
import { TITLE_TAGLINES } from '../data/lines.js';
import { ENEMY_TYPES, BESTIARY } from '../data/enemies.js';
import { BOSSES } from '../systems/bosses.js';
import { itemById } from '../data/items.js';

const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
let ui = null;

export function initOverlays() {
  ui = {
    overlay: $('overlay'), overlayTitle: $('overlayTitle'), overlayCopy: $('overlayCopy'),
    overlayBody: $('overlayBody'),
    overlayButtons: $('overlayButtons'), overlayMeta: $('overlayMeta'),
    draft: $('draft'), draftTitle: $('draftTitle'), draftCards: $('draftCards'), draftMeta: $('draftMeta'),
    pause: $('pause'), resumeBtn: $('resumeBtn'), pauseSfxBtn: $('pauseSfxBtn'),
    zone: $('zone'), roomNo: $('roomNo'), hp: $('hp'), score: $('score'),
    comboChip: $('comboChip'), pulseWrap: $('pulseWrap'), pulseFill: $('pulseFill'),
    sfxBtn: $('sfxBtn'), bgmBtn: $('bgmBtn'), whisper: $('whisper'), buildChips: $('buildChips'),
  };
}

export function wireBgmButton(onToggle) {
  if (ui?.bgmBtn) ui.bgmBtn.onclick = onToggle;
}

export function showOverlay(title, copy, buttons, meta = '', bodyHtml = '') {
  if (!ui?.overlay) return;
  ui.overlayTitle.textContent = title;
  ui.overlayCopy.textContent = copy;
  ui.overlayMeta.textContent = meta;
  if (ui.overlayBody) ui.overlayBody.innerHTML = bodyHtml;
  ui.overlayButtons.innerHTML = '';
  for (const [label, fn] of buttons) {
    const b = document.createElement('button');
    b.className = 'bigBtn';
    b.type = 'button';
    b.textContent = label;
    b.onclick = fn;
    ui.overlayButtons.appendChild(b);
  }
  ui.overlay.classList.add('show');
  return ui.overlayBody;
}

export function hideOverlays() {
  ui?.overlay?.classList.remove('show');
  ui?.pause?.classList.remove('show');
  ui?.draft?.classList.remove('show');
}

let selectedOath = 'none';
let menuRef = null;
let lastDeath = null;

export function setMenu(menu) { menuRef = menu; }
export const currentOath = () => selectedOath;

export function showTitle(menu = menuRef) {
  const s = state.save;
  const daily = dailyBestToday();
  const meta = [
    s.bestScore ? `best ${Math.floor(s.bestScore).toLocaleString()} · round ${s.bestRound} · ${s.runs} runs` : 'two thumbs, one room',
    daily != null ? `today's daily: ${daily.toLocaleString()}` : null,
    `✦ ${(s.sparks || 0).toLocaleString()} sparks`,
  ].filter(Boolean).join('  ·  ');
  const buttons = [
    ['Play', () => menu.start(selectedOath)],
    ['Daily', () => menu.daily(selectedOath)],
    ['Shrine', () => showShrine(menu)],
    ['Codex', () => showCodex(menu)],
  ];
  const body = showOverlay('One Room No Moon', TITLE_TAGLINES[0], buttons, meta);
  if (body && oathsUnlocked()) {
    const row = document.createElement('div');
    row.className = 'oathRow';
    for (const oath of OATHS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'oathBtn' + (selectedOath === oath.id ? ' sel' : '');
      b.textContent = oath.name;
      b.title = oath.desc;
      b.onclick = () => { selectedOath = oath.id; showTitle(menu); };
      row.appendChild(b);
    }
    body.appendChild(row);
  }
}

export function showDeath(stats, onRestart) {
  lastDeath = { stats, onRestart };
  const menu = menuRef;
  const buttons = [['Run it back', onRestart]];
  if (menu) buttons.push(['Shrine', () => showShrine(menu, true)], ['Codex', () => showCodex(menu, true)]);
  showOverlay(
    stats.title || 'The boon boots remain.',
    `Score ${stats.score.toLocaleString()} · round ${stats.round} · ${stats.kills} marks.` +
    (stats.daily ? ' (daily run)' : ''),
    buttons,
    `best ${Math.floor(stats.best).toLocaleString()} · round ${stats.bestRound} · ✦ ${(state.save.sparks || 0).toLocaleString()} sparks`,
  );
}

export function showShrine(menu = menuRef, fromDeath = false) {
  const back = () => (fromDeath && state.run ? redrawDeath() : showTitle(menu));
  const sparks = state.save.sparks || 0;
  const body = showOverlay('Tiny Shrine', `Sparks carry between runs. ✦ ${sparks.toLocaleString()} banked.`, [['Back', back]]);
  if (!body) return;
  for (const def of SHRINE_DEFS) {
    const owned = !!state.save.shrine[def.id];
    const can = !owned && sparks >= def.cost;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'shrineCard panel' + (owned ? ' owned' : '');
    card.innerHTML = `<b>${esc(def.name)}</b><p>${esc(def.desc)}</p>` +
      `<span class="cost">${owned ? 'owned' : can ? `buy · ${def.cost} ✦` : `need ${def.cost} ✦`}</span>`;
    if (can) card.onclick = () => { buyShrine(def.id); showShrine(menu, fromDeath); };
    body.appendChild(card);
  }
}

export function showCodex(menu = menuRef, fromDeath = false) {
  const back = () => (fromDeath && state.run ? redrawDeath() : showTitle(menu));
  const s = state.save;
  const bestiaryRows = Object.entries(BESTIARY).map(([id, desc]) => {
    const def = ENEMY_TYPES[id];
    const kills = s.bestiary[id] || 0;
    return `<div class="codexCard"><b style="color:${def.color}">${esc(def.display)}</b><p>${esc(desc)}</p><span class="kills">marks: ${kills}</span></div>`;
  }).join('');
  const bossRows = Object.entries(BOSSES).map(([id, def]) => {
    const kills = s.bestiary.boss || 0;
    return `<div class="codexCard"><b style="color:${def.color}">${esc(def.name)}</b><p>round ${def.round}</p></div>`;
  }).join('');
  let fav = 'none yet';
  const picks = Object.entries(s.graftPicks || {});
  if (picks.length) {
    const top = picks.sort((a, b) => b[1] - a[1])[0];
    const item = itemById(top[0]);
    if (item) fav = `${item.name} (×${top[1]})`;
  }
  const notices = (s.notices || []).slice(-14).reverse().map(n => `· ${esc(n)}`).join('<br>') || 'The room has not noticed you yet.';
  const html =
    `<h3 style="margin:6px 0">Bestiary</h3><div class="codexGrid">${bestiaryRows}${bossRows}</div>` +
    `<p style="font-size:13px">Runs ${s.runs || 0} · kills ${s.lifetime.kills || 0} · rooms ${s.lifetime.rooms || 0} · wins ${s.lifetime.wins || 0} · favorite graft: ${esc(fav)}</p>` +
    `<h3 style="margin:10px 0 6px">Things the room said</h3><div class="noticeList">${notices}</div>`;
  showOverlay('Codex / glovebox / tiny shrine annex', '', [['Back', back]], '', html);
}

function redrawDeath() {
  if (lastDeath) showDeath(lastDeath.stats, lastDeath.onRestart);
}

export function showPause(visible, sfxLabel) {
  if (!ui?.pause) return;
  ui.pause.classList.toggle('show', visible);
  if (visible && ui.pauseSfxBtn) ui.pauseSfxBtn.textContent = sfxLabel;
}

export function wirePauseButtons(onResume, onSfx) {
  if (ui?.resumeBtn) ui.resumeBtn.onclick = onResume;
  if (ui?.pauseSfxBtn) ui.pauseSfxBtn.onclick = onSfx;
}

export function wireSfxButton(onToggle) {
  if (ui?.sfxBtn) ui.sfxBtn.onclick = onToggle;
}

export function whisper(text) {
  if (!ui?.whisper) return;
  ui.whisper.textContent = text;
  ui.whisper.classList.add('show');
  clearTimeout(whisper._t);
  whisper._t = setTimeout(() => ui.whisper.classList.remove('show'), 2600);
}

export function updateHud() {
  if (!ui?.zone) return;
  const run = state.run, room = state.room;
  if (!run || !room) {
    ui.zone.textContent = 'One Room No Moon';
    ui.roomNo.textContent = 'round 0';
    ui.hp.textContent = '♥♥♥♥♥♥';
    ui.score.textContent = '0';
    ui.comboChip.textContent = 'two thumbs';
    ui.hp.classList.remove('comboHeal');
    ui.comboChip.classList.remove('comboHot', 'comboHeal');
    ui.pulseFill.style.width = '0%';
    if (ui.pulseWrap) ui.pulseWrap.style.display = 'none';
  } else {
    const p = run.player;
    ui.zone.textContent = room.districtName || room.biome.name;
    ui.roomNo.textContent = `round ${run.round}${run.overdrive ? ' ∞' : ''}`;
    const hearts = '♥'.repeat(Math.max(0, Math.ceil(p.hp))) + '♡'.repeat(Math.max(0, p.maxHp - Math.ceil(p.hp)));
    ui.hp.innerHTML = (p.hp <= 2 ? `<span class="hurt">${hearts}</span>` : hearts) + (p.shield ? ` +${p.shield}` : '');
    ui.hp.classList.toggle('comboHeal', (p.comboHealFx || 0) > 0);
    ui.score.textContent = Math.floor(run.score).toLocaleString();
    ui.comboChip.classList.toggle('comboHot', (p.comboTierFx || 0) > 0);
    ui.comboChip.classList.toggle('comboHeal', (p.comboHealFx || 0) > 0);
    ui.comboChip.textContent = (p.comboHealFx || 0) > 0 ? `x${run.combo.toFixed(1)} +♥` : `x${run.combo.toFixed(1)}`;
    // Dash is always a feel-first move now, so the old readiness meter stays hidden.
    if (ui.pulseWrap) ui.pulseWrap.style.display = 'none';
    if (ui.pulseFill) ui.pulseFill.style.width = '100%';
    const boonEl = document.getElementById('boonChip');
    if (boonEl) {
      boonEl.textContent = p.boon.charges > 0 ? '⇄ BOON READY' : `⇄ lacing ${p.boon.progress}/${p.boon.need}`;
      boonEl.style.color = p.boon.charges > 0 ? '#f3dcff' : '';
    }
  }
  if (ui.sfxBtn) ui.sfxBtn.textContent = state.save.settings.sfx ? 'sfx on' : 'sfx off';
  if (ui.bgmBtn) ui.bgmBtn.textContent = state.save.settings.bgm ? 'bgm on' : 'bgm off';
}

// ── draft cards ──────────────────────────────────────────────────────────────
export function renderDraft(choices, canReroll, onPick, onReroll, getStacks) {
  if (!ui?.draft) return;
  if (!choices) { ui.draft.classList.remove('show'); return; }
  ui.draftTitle.textContent = 'Pick what changes.';
  ui.draftCards.innerHTML = '';
  choices.forEach((item, i) => {
    const b = document.createElement('button');
    b.className = 'draftCard';
    b.type = 'button';
    const have = getStacks(item.id);
    b.innerHTML =
      `<span class="tag" style="color:${item.color}">${esc(item.type)}</span>` +
      `<b>${esc(item.name)}</b>` +
      `<p>${esc(item.desc)}</p>` +
      `<span class="stacks">${have ? `owned ×${have}` : 'fresh graft'}${item.maxStacks ? ` · max ${item.maxStacks}` : ''}</span>`;
    b.onclick = () => onPick(i);
    ui.draftCards.appendChild(b);
  });
  ui.draftMeta.innerHTML = '';
  if (canReroll) {
    const r = document.createElement('button');
    r.type = 'button';
    r.textContent = 'Boon Reroll (R)';
    r.onclick = onReroll;
    ui.draftMeta.appendChild(r);
  } else {
    ui.draftMeta.textContent = '1 / 2 / 3 to choose';
  }
  ui.draft.classList.add('show');
}

export function updateBuildChips(player) {
  if (!ui?.buildChips || !player) return;
  ui.buildChips.innerHTML = '';
  for (const [id, n] of Object.entries(player.modules)) {
    const chip = document.createElement('span');
    chip.className = 'graft';
    chip.textContent = id + (n > 1 ? ` ×${n}` : '');
    ui.buildChips.appendChild(chip);
  }
}

function esc(s) {
  return String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

export function setSfxLabels() {
  const label = state.save.settings.sfx ? 'sfx on' : 'sfx off';
  if (ui?.sfxBtn) ui.sfxBtn.textContent = label;
  if (ui?.pauseSfxBtn) ui.pauseSfxBtn.textContent = label;
  saveNow();
}
