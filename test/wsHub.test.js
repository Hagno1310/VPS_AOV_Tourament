const { test } = require('node:test');
const assert = require('node:assert');
const { createHub } = require('../src/lib/wsHub.js');
const { defaultState } = require('../src/lib/state.js');

function harness() {
  const state = defaultState();
  const sent = [];
  const broadcasts = [];
  const ws = { send: (s) => sent.push(JSON.parse(s)) };
  const timer = {
    calls: [], start() { this.calls.push('start'); }, stop() { this.calls.push('stop'); },
    reset(d) { this.calls.push('reset:' + d); }, tick() {}, dispose() {},
  };
  const saver = () => { saver.count = (saver.count || 0) + 1; };
  const findByImg = (img) => ({ name: 'X', img, voice: null });
  const broadcast = (st) => broadcasts.push(st);
  const hub = createHub({ state, timer, saver, broadcast, findByImg });
  return { state, sent, broadcasts, ws, timer, saver, hub };
}

test('handleConnection gửi state ngay', () => {
  const h = harness();
  h.hub.handleConnection(h.ws);
  assert.strictEqual(h.sent[0].type, 'state');
  assert.ok(h.sent[0].state.config);
});

test('selectHero hợp lệ → mutate + broadcast, KHÔNG tự sang phase / reset timer', () => {
  const h = harness();
  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'selectHero', payload: { slot: 'banLeft-0', heroImg: '/x.png' } }));
  assert.strictEqual(h.state.draft.slots.banLeft[0].img, '/x.png');
  assert.strictEqual(h.state.draft.phaseIndex, 0);           // no auto-advance
  assert.strictEqual(h.broadcasts.length, 1);
  assert.ok(!h.timer.calls.includes('reset:60'));            // reset only happens on Lock/Next
});

test('nextPhase (Lock) → advance + reset timer + broadcast', () => {
  const h = harness();
  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'nextPhase', payload: {} }));
  assert.strictEqual(h.state.draft.phaseIndex, 1);
  assert.ok(h.timer.calls.includes('reset:60'));
  assert.strictEqual(h.broadcasts.length, 1);
});

test('selectHero sai phase → error cho ws, không broadcast', () => {
  const h = harness();
  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'selectHero', payload: { slot: 'pickLeft-0', heroImg: '/x.png' } }));
  assert.strictEqual(h.broadcasts.length, 0);
  assert.strictEqual(h.sent.at(-1).type, 'error');
});

test('timerStart gọi timer.start + broadcast', () => {
  const h = harness();
  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'timerStart', payload: {} }));
  assert.ok(h.timer.calls.includes('start'));
  assert.strictEqual(h.broadcasts.length, 1);
});

test('setBO cập nhật + broadcast', () => {
  const h = harness();
  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'setBO', payload: { value: 'BO3' } }));
  assert.strictEqual(h.state.config.bo, 'BO3');
  assert.strictEqual(h.broadcasts.length, 1);
});

test('JSON hỏng → không crash, gửi error', () => {
  const h = harness();
  h.hub.handleMessage(h.ws, '{hỏng');
  assert.strictEqual(h.sent.at(-1).type, 'error');
  assert.strictEqual(h.broadcasts.length, 0);
});

test('resetDraft reset timer + stop + broadcast', () => {
  const h = harness();
  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'resetDraft', payload: {} }));
  assert.ok(h.timer.calls.includes('reset:60'));
  assert.ok(h.timer.calls.includes('stop'));
  assert.strictEqual(h.broadcasts.length, 1);
});

test('action lạ → error, không broadcast', () => {
  const h = harness();
  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'nope', payload: {} }));
  assert.strictEqual(h.sent.at(-1).type, 'error');
  assert.strictEqual(h.broadcasts.length, 0);
});

test('selectHero không tìm thấy tướng → error, không broadcast, slot vẫn null', () => {
  const state = defaultState();
  const sent = [];
  const broadcasts = [];
  const ws = { send: (s) => sent.push(JSON.parse(s)) };
  const timer = {
    calls: [], start() { this.calls.push('start'); }, stop() { this.calls.push('stop'); },
    reset(d) { this.calls.push('reset:' + d); }, tick() {}, dispose() {},
  };
  const saver = () => {};
  const findByImg = () => null;
  const broadcast = (st) => broadcasts.push(st);
  const hub = createHub({ state, timer, saver, broadcast, findByImg });

  hub.handleMessage(ws, JSON.stringify({ action: 'selectHero', payload: { slot: 'banLeft-0', heroImg: '/missing.png' } }));
  assert.strictEqual(sent.at(-1).type, 'error');
  assert.strictEqual(broadcasts.length, 0);
  assert.strictEqual(state.draft.slots.banLeft[0], null);
});

test('clearSlot chỉ hoạt động khi correction bật', () => {
  const h = harness();
  h.state.draft.slots.banLeft[0] = { name: 'X', img: '/x.png', voice: null };

  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'clearSlot', payload: { slot: 'banLeft-0' } }));
  assert.strictEqual(h.sent.at(-1).type, 'error');
  assert.strictEqual(h.broadcasts.length, 0);
  assert.ok(h.state.draft.slots.banLeft[0]);

  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'setCorrection', payload: { on: true } }));
  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'clearSlot', payload: { slot: 'banLeft-0' } }));
  assert.strictEqual(h.state.draft.slots.banLeft[0], null);
  assert.strictEqual(h.broadcasts.length, 2);
});

test('swap hợp lệ giữa 2 ô pickLeft → hoán đổi + broadcast', () => {
  const h = harness();
  h.state.draft.slots.pickLeft[0] = { name: 'A', img: '/a.png', voice: null };
  h.state.draft.slots.pickLeft[1] = { name: 'B', img: '/b.png', voice: null };

  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'swap', payload: { slotA: 'pickLeft-0', slotB: 'pickLeft-1' } }));
  assert.strictEqual(h.state.draft.slots.pickLeft[0].img, '/b.png');
  assert.strictEqual(h.state.draft.slots.pickLeft[1].img, '/a.png');
  assert.strictEqual(h.broadcasts.length, 1);
});

test('setTeam side lạ → error, không broadcast; side hợp lệ → cập nhật + broadcast', () => {
  const h = harness();
  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'setTeam', payload: { side: 'green', field: 'name', value: 'X' } }));
  assert.strictEqual(h.sent.at(-1).type, 'error');
  assert.strictEqual(h.broadcasts.length, 0);

  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'setTeam', payload: { side: 'blue', field: 'name', value: 'Team Blue' } }));
  assert.strictEqual(h.state.config.teams.blue.name, 'Team Blue');
  assert.strictEqual(h.broadcasts.length, 1);
});

test('timerStop gọi timer.stop + broadcast', () => {
  const h = harness();
  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'timerStop', payload: {} }));
  assert.ok(h.timer.calls.includes('stop'));
  assert.strictEqual(h.broadcasts.length, 1);
});

test('timerReset gọi timer.reset(60) + broadcast', () => {
  const h = harness();
  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'timerReset', payload: {} }));
  assert.ok(h.timer.calls.includes('reset:60'));
  assert.strictEqual(h.broadcasts.length, 1);
});

test('swapTeams names hợp lệ → broadcast; what lạ → error, không broadcast', () => {
  const h = harness();
  h.state.config.teams.blue.name = 'Blue';
  h.state.config.teams.red.name = 'Red';

  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'swapTeams', payload: { what: 'names' } }));
  assert.strictEqual(h.state.config.teams.blue.name, 'Red');
  assert.strictEqual(h.state.config.teams.red.name, 'Blue');
  assert.strictEqual(h.broadcasts.length, 1);

  h.hub.handleMessage(h.ws, JSON.stringify({ action: 'swapTeams', payload: { what: 'bogus' } }));
  assert.strictEqual(h.sent.at(-1).type, 'error');
  assert.strictEqual(h.broadcasts.length, 1);
});
