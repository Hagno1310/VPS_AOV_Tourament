const { ARROWS } = require('./constants.js');

const GROUPS = ['banLeft', 'banRight', 'pickLeft', 'pickRight'];
const NUM_PHASES = 16;

const PHASES = [
  { type: 'ban',  team: 'blue', slots: ['banLeft-0'] },                 // 0
  { type: 'ban',  team: 'red',  slots: ['banRight-0'] },                // 1
  { type: 'ban',  team: 'blue', slots: ['banLeft-1'] },                 // 2
  { type: 'ban',  team: 'red',  slots: ['banRight-1'] },                // 3
  { type: 'pick', team: 'blue', slots: ['pickLeft-0'] },                // 4
  { type: 'pick', team: 'red',  slots: ['pickRight-0', 'pickRight-1'] },// 5
  { type: 'pick', team: 'blue', slots: ['pickLeft-1', 'pickLeft-2'] },  // 6
  { type: 'pick', team: 'red',  slots: ['pickRight-2'] },               // 7
  { type: 'ban',  team: 'red',  slots: ['banRight-2'] },                // 8
  { type: 'ban',  team: 'blue', slots: ['banLeft-2'] },                 // 9
  { type: 'ban',  team: 'red',  slots: ['banRight-3'] },                // 10
  { type: 'ban',  team: 'blue', slots: ['banLeft-3'] },                 // 11
  { type: 'pick', team: 'red',  slots: ['pickRight-3'] },               // 12
  { type: 'pick', team: 'blue', slots: ['pickLeft-3', 'pickLeft-4'] },  // 13
  { type: 'pick', team: 'red',  slots: ['pickRight-4'] },               // 14
  { type: 'swap', team: null,   slots: [] },                            // 15
];

function emptySlots() {
  return {
    banLeft:   [null, null, null, null, null],
    banRight:  [null, null, null, null, null],
    pickLeft:  [null, null, null, null, null],
    pickRight: [null, null, null, null, null],
  };
}

function allSlotIds() {
  const ids = [];
  for (const g of GROUPS) for (let i = 0; i < 5; i++) ids.push(`${g}-${i}`);
  return ids;
}

function parseSlotId(id) {
  if (typeof id !== 'string') return null;
  const dash = id.lastIndexOf('-');
  if (dash < 0) return null;
  const group = id.slice(0, dash);
  const index = Number(id.slice(dash + 1));
  if (!GROUPS.includes(group)) return null;
  if (!Number.isInteger(index) || index < 0 || index > 4) return null;
  return { group, index };
}

function getSlot(state, id) {
  const p = parseSlotId(id);
  if (!p) return null;
  return state.draft.slots[p.group][p.index];
}

function setSlot(state, id, hero) {
  const p = parseSlotId(id);
  if (!p) return;
  state.draft.slots[p.group][p.index] = hero;
}

function usedHeroImgs(state) {
  const set = new Set();
  for (const g of GROUPS) {
    for (const h of state.draft.slots[g]) if (h && h.img) set.add(h.img);
  }
  return set;
}

function isHeroUsed(state, img) {
  return usedHeroImgs(state).has(img);
}

function currentPhase(state) {
  const i = state.draft.phaseIndex;
  return i >= 0 && i < NUM_PHASES ? PHASES[i] : null;
}

function canActOnSlot(state, id) {
  if (!parseSlotId(id)) return false;
  if (state.draft.correction) return true;
  const phase = currentPhase(state);
  return !!phase && phase.slots.includes(id);
}

function selectHero(state, id, hero) {
  if (!parseSlotId(id)) return { ok: false, error: 'slot không hợp lệ' };
  if (!canActOnSlot(state, id)) return { ok: false, error: 'không phải lượt của ô này' };
  if (!hero || !hero.img) return { ok: false, error: 'thiếu hero' };
  const current = getSlot(state, id);
  if (isHeroUsed(state, hero.img) && (!current || current.img !== hero.img)) {
    return { ok: false, error: 'tướng đã được chọn' };
  }
  setSlot(state, id, { name: hero.name, img: hero.img, voice: hero.voice ?? null });
  // No auto-advance: the operator confirms the pick with the Lock (Next) button.
  return { ok: true, advanced: false };
}

function clearSlot(state, id) {
  if (!parseSlotId(id)) return { ok: false, error: 'slot không hợp lệ' };
  if (!state.draft.correction) return { ok: false, error: 'chỉ xoá được ở Correction' };
  setSlot(state, id, null);
  return { ok: true };
}

function swap(state, a, b) {
  const pa = parseSlotId(a), pb = parseSlotId(b);
  if (!pa || !pb) return { ok: false, error: 'slot không hợp lệ' };
  if (a === b) return { ok: false, error: 'trùng ô' };
  if (!state.draft.correction) {
    const bothLeft = pa.group === 'pickLeft' && pb.group === 'pickLeft';
    const bothRight = pa.group === 'pickRight' && pb.group === 'pickRight';
    if (!bothLeft && !bothRight) return { ok: false, error: 'chỉ swap pick cùng đội' };
  }
  const ha = getSlot(state, a), hb = getSlot(state, b);
  setSlot(state, a, hb);
  setSlot(state, b, ha);
  return { ok: true };
}

function nextPhase(state) {
  if (state.draft.phaseIndex < NUM_PHASES) { state.draft.phaseIndex++; return { changed: true }; }
  return { changed: false };
}

function prevPhase(state) {
  if (state.draft.phaseIndex > 0) { state.draft.phaseIndex--; return { changed: true }; }
  return { changed: false };
}

function resetDraft(state) {
  state.draft.phaseIndex = 0;
  state.draft.correction = false;
  state.draft.slots = emptySlots();
}

function setCorrection(state, on) {
  state.draft.correction = !!on;
}

function arrowFor(phase) {
  if (!phase) return '';
  if (phase.type === 'swap') return ARROWS.swap;
  const key = phase.type + (phase.team === 'blue' ? 'Blue' : 'Red');
  return ARROWS[key] || '';
}

function phaseLabel(phase) {
  if (!phase) return 'DONE';
  if (phase.type === 'swap') return 'SWAP / ADJUSTMENT';
  return `${phase.type.toUpperCase()} — ${phase.team.toUpperCase()}`;
}

module.exports = {
  PHASES, NUM_PHASES, GROUPS,
  emptySlots, allSlotIds, parseSlotId,
  getSlot, setSlot, usedHeroImgs, isHeroUsed, currentPhase,
  canActOnSlot, selectHero, clearSlot, swap, nextPhase, prevPhase, resetDraft, setCorrection, arrowFor, phaseLabel,
};
