const { test } = require('node:test');
const assert = require('node:assert');
const draft = require('../src/lib/draft.js');

test('PHASES có đúng 16 phase và slot id hợp lệ', () => {
  assert.strictEqual(draft.PHASES.length, 16);
  assert.strictEqual(draft.NUM_PHASES, 16);
  const valid = new Set(draft.allSlotIds());
  for (const p of draft.PHASES) {
    for (const s of p.slots) assert.ok(valid.has(s), `slot lạ: ${s}`);
  }
  assert.strictEqual(draft.PHASES[15].type, 'swap');
});

test('thứ tự phase khớp bản cũ (phase 8=red, 9=blue)', () => {
  const p = draft.PHASES;
  assert.deepStrictEqual([p[0].type, p[0].team, p[0].slots], ['ban', 'blue', ['banLeft-0']]);
  assert.deepStrictEqual([p[1].team, p[1].slots], ['red', ['banRight-0']]);
  assert.deepStrictEqual([p[4].type, p[4].team, p[4].slots], ['pick', 'blue', ['pickLeft-0']]);
  assert.deepStrictEqual(p[5].slots, ['pickRight-0', 'pickRight-1']);
  assert.deepStrictEqual(p[6].slots, ['pickLeft-1', 'pickLeft-2']);
  assert.deepStrictEqual([p[8].team, p[8].slots], ['red', ['banRight-2']]);
  assert.deepStrictEqual([p[9].team, p[9].slots], ['blue', ['banLeft-2']]);
  assert.deepStrictEqual(p[13].slots, ['pickLeft-3', 'pickLeft-4']);
  assert.deepStrictEqual([p[14].team, p[14].slots], ['red', ['pickRight-4']]);
});

test('allSlotIds trả 20 id; parseSlotId', () => {
  assert.strictEqual(draft.allSlotIds().length, 20);
  assert.deepStrictEqual(draft.parseSlotId('banRight-2'), { group: 'banRight', index: 2 });
  assert.strictEqual(draft.parseSlotId('bogus-9'), null);
  assert.strictEqual(draft.parseSlotId('pickLeft-5'), null);
});

function freshState() {
  return { draft: { phaseIndex: 0, correction: false, slots: draft.emptySlots() } };
}
const A = { name: 'Airi', img: '/assets/heroes/Airi.png', voice: null };
const B = { name: 'Alice', img: '/assets/heroes/Alice.png', voice: null };

test('selectHero: gán vào ô, KHÔNG tự sang phase (lock thủ công)', () => {
  const s = freshState();
  const r = draft.selectHero(s, 'banLeft-0', A);
  assert.deepStrictEqual([r.ok, r.advanced], [true, false]);
  assert.strictEqual(s.draft.slots.banLeft[0].img, A.img);
  assert.strictEqual(s.draft.phaseIndex, 0); // ở nguyên phase cho tới khi Lock/Next
});

test('selectHero: chặn thao tác sai phase', () => {
  const s = freshState();
  const r = draft.selectHero(s, 'pickLeft-0', A);
  assert.strictEqual(r.ok, false);
  assert.ok(r.error);
});

test('selectHero: chặn tướng đã dùng', () => {
  const s = freshState();
  draft.selectHero(s, 'banLeft-0', A);
  draft.nextPhase(s); // Lock sang phase 1 (banRight-0)
  const r = draft.selectHero(s, 'banRight-0', A);
  assert.strictEqual(r.ok, false);
});

test('selectHero: phase 2 slot điền cả 2, KHÔNG tự sang; Next mới sang', () => {
  const s = freshState();
  s.draft.phaseIndex = 5;
  let r = draft.selectHero(s, 'pickRight-0', A);
  assert.deepStrictEqual([r.ok, r.advanced], [true, false]);
  assert.strictEqual(s.draft.phaseIndex, 5);
  r = draft.selectHero(s, 'pickRight-1', B);
  assert.deepStrictEqual([r.ok, r.advanced], [true, false]);
  assert.strictEqual(s.draft.phaseIndex, 5); // vẫn ở phase 5 tới khi Lock
  draft.nextPhase(s);
  assert.strictEqual(s.draft.phaseIndex, 6);
});

test('correction: cho thao tác mọi ô, không auto advance', () => {
  const s = freshState();
  draft.setCorrection(s, true);
  const r = draft.selectHero(s, 'pickRight-4', A);
  assert.deepStrictEqual([r.ok, r.advanced], [true, false]);
  assert.strictEqual(s.draft.phaseIndex, 0);
});

test('clearSlot: chỉ khi correction', () => {
  const s = freshState();
  draft.selectHero(s, 'banLeft-0', A);
  assert.strictEqual(draft.clearSlot(s, 'banLeft-0').ok, false);
  draft.setCorrection(s, true);
  assert.strictEqual(draft.clearSlot(s, 'banLeft-0').ok, true);
  assert.strictEqual(s.draft.slots.banLeft[0], null);
});

test('swap: đổi 2 pick cùng nhóm', () => {
  const s = freshState();
  s.draft.slots.pickLeft[0] = A;
  s.draft.slots.pickLeft[1] = B;
  const r = draft.swap(s, 'pickLeft-0', 'pickLeft-1');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.draft.slots.pickLeft[0].img, B.img);
  assert.strictEqual(s.draft.slots.pickLeft[1].img, A.img);
});

test('swap: chặn khác nhóm khi không correction', () => {
  const s = freshState();
  s.draft.slots.pickLeft[0] = A;
  s.draft.slots.pickRight[0] = B;
  assert.strictEqual(draft.swap(s, 'pickLeft-0', 'pickRight-0').ok, false);
});

test('nextPhase/prevPhase/resetDraft', () => {
  const s = freshState();
  assert.strictEqual(draft.nextPhase(s).changed, true);
  assert.strictEqual(s.draft.phaseIndex, 1);
  assert.strictEqual(draft.prevPhase(s).changed, true);
  assert.strictEqual(s.draft.phaseIndex, 0);
  draft.selectHero(s, 'banLeft-0', A);
  draft.resetDraft(s);
  assert.strictEqual(s.draft.phaseIndex, 0);
  assert.strictEqual(s.draft.slots.banLeft[0], null);
  assert.strictEqual(s.draft.correction, false);
});

test('arrowFor & phaseLabel', () => {
  assert.strictEqual(draft.arrowFor(draft.PHASES[0]), '/assets/ui/leftbanning.gif');
  assert.strictEqual(draft.arrowFor(draft.PHASES[1]), '/assets/ui/rightbanning.gif');
  assert.strictEqual(draft.arrowFor(draft.PHASES[15]), '/assets/ui/adjustment.png');
  assert.strictEqual(draft.phaseLabel(draft.PHASES[0]), 'BAN — BLUE');
});

test('selectHero: same-slot reselection in correction allowed', () => {
  const s = freshState();
  draft.selectHero(s, 'banLeft-0', A);
  assert.strictEqual(s.draft.slots.banLeft[0].img, A.img);
  draft.setCorrection(s, true);
  const r = draft.selectHero(s, 'banLeft-0', A);
  assert.deepStrictEqual([r.ok, r.advanced], [true, false]);
  assert.strictEqual(s.draft.slots.banLeft[0].img, A.img);
});

test('swap: cross-group allowed only under correction', () => {
  const s = freshState();
  s.draft.slots.pickLeft[0] = A;
  s.draft.slots.banLeft[0] = B;
  const r1 = draft.swap(s, 'pickLeft-0', 'banLeft-0');
  assert.strictEqual(r1.ok, false);
  draft.setCorrection(s, true);
  const r2 = draft.swap(s, 'pickLeft-0', 'banLeft-0');
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(s.draft.slots.pickLeft[0].img, B.img);
  assert.strictEqual(s.draft.slots.banLeft[0].img, A.img);
});

test('terminal boundary: nextPhase caps at 16, currentPhase null, phaseLabel DONE', () => {
  const s = freshState();
  s.draft.phaseIndex = 15;
  assert.strictEqual(draft.nextPhase(s).changed, true);   // 15 -> 16
  assert.strictEqual(s.draft.phaseIndex, 16);
  assert.strictEqual(draft.nextPhase(s).changed, false);  // capped at 16
  assert.strictEqual(s.draft.phaseIndex, 16);
  assert.strictEqual(draft.currentPhase(s), null);
  assert.strictEqual(draft.phaseLabel(draft.currentPhase(s)), 'DONE');
});
