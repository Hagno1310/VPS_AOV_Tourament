const { test } = require('node:test');
const assert = require('node:assert');
const { createTimer } = require('../src/lib/timer.js');

function st() { return { draft: { timer: { remaining: 60, running: false, duration: 60 } } }; }

test('tick giảm remaining khi running', () => {
  const s = st();
  let ticks = 0;
  const t = createTimer(s, () => ticks++);
  t.start();
  assert.strictEqual(s.draft.timer.running, true);
  t.tick();
  assert.strictEqual(s.draft.timer.remaining, 59);
  assert.strictEqual(ticks, 1);
  t.dispose();
});

test('tick không giảm khi đã stop', () => {
  const s = st();
  const t = createTimer(s, () => {});
  t.start(); t.stop();
  t.tick();
  assert.strictEqual(s.draft.timer.remaining, 60);
  t.dispose();
});

test('về 0 thì dừng, không âm', () => {
  const s = st();
  s.draft.timer.remaining = 1;
  const t = createTimer(s, () => {});
  t.start();
  t.tick();
  t.tick();
  assert.strictEqual(s.draft.timer.remaining, 0);
  assert.strictEqual(s.draft.timer.running, false);
  t.dispose();
});

test('reset đặt lại remaining + duration, dừng', () => {
  const s = st();
  s.draft.timer.remaining = 10; s.draft.timer.running = true;
  const t = createTimer(s, () => {});
  t.reset(45);
  assert.strictEqual(s.draft.timer.remaining, 45);
  assert.strictEqual(s.draft.timer.duration, 45);
  assert.strictEqual(s.draft.timer.running, false);
  t.dispose();
});

test('auto-continue: after start, reset keeps running; stop disarms it', () => {
  const s = st();
  const t = createTimer(s, () => {});
  t.start();
  t.reset(60);                                   // phase change while a session is running
  assert.strictEqual(s.draft.timer.running, true);   // keeps counting, no re-Start needed
  assert.strictEqual(s.draft.timer.remaining, 60);
  t.stop();
  t.reset(60);                                   // reset after Stop stays stopped
  assert.strictEqual(s.draft.timer.running, false);
  t.dispose();
});
