const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const stateMod = require('../src/lib/state.js');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aog-')), 'state.json');
}

test('defaultState có cấu trúc đúng', () => {
  const s = stateMod.defaultState();
  assert.strictEqual(s.draft.phaseIndex, 0);
  assert.strictEqual(s.draft.correction, false);
  assert.strictEqual(s.draft.timer.duration, 60);
  assert.strictEqual(s.draft.slots.banLeft.length, 5);
  assert.strictEqual(s.config.teams.blue.players.length, 5);
  assert.strictEqual(s.config.bo, 'BO5');
});

test('load fallback về default khi file thiếu', () => {
  const s = stateMod.load(path.join(os.tmpdir(), 'khong-ton-tai-'+Date.now()+'.json'));
  assert.strictEqual(s.draft.phaseIndex, 0);
});

test('load fallback về default khi JSON hỏng', () => {
  const f = tmpFile();
  fs.writeFileSync(f, '{ hỏng json');
  const s = stateMod.load(f);
  assert.strictEqual(s.draft.phaseIndex, 0);
});

test('saveNow + load round-trip', () => {
  const f = tmpFile();
  const s = stateMod.defaultState();
  s.config.bo = 'BO7';
  s.draft.phaseIndex = 3;
  stateMod.saveNow(f, s);
  const loaded = stateMod.load(f);
  assert.strictEqual(loaded.config.bo, 'BO7');
  assert.strictEqual(loaded.draft.phaseIndex, 3);
});

test('createSaver trả về hàm', () => {
  assert.strictEqual(typeof stateMod.createSaver(tmpFile()), 'function');
});
