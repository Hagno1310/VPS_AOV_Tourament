const { test } = require('node:test');
const assert = require('node:assert');
const cfg = require('../src/lib/config.js');
const { defaultState } = require('../src/lib/state.js');

test('setTeam đổi field hợp lệ, chặn side/field lạ', () => {
  const s = defaultState();
  assert.strictEqual(cfg.setTeam(s, 'blue', 'name', 'SBTC').ok, true);
  assert.strictEqual(s.config.teams.blue.name, 'SBTC');
  assert.strictEqual(cfg.setTeam(s, 'green', 'name', 'x').ok, false);
  assert.strictEqual(cfg.setTeam(s, 'blue', 'hack', 'x').ok, false);
});

test('setPlayer theo index', () => {
  const s = defaultState();
  assert.strictEqual(cfg.setPlayer(s, 'red', 2, 'ADC').ok, true);
  assert.strictEqual(s.config.teams.red.players[2], 'ADC');
  assert.strictEqual(cfg.setPlayer(s, 'red', 9, 'x').ok, false);
});

test('setScore ép số', () => {
  const s = defaultState();
  cfg.setScore(s, 'blue', 2);
  assert.strictEqual(s.config.teams.blue.score, 2);
});

test('setBO', () => {
  const s = defaultState();
  cfg.setBO(s, 'BO3');
  assert.strictEqual(s.config.bo, 'BO3');
});

test('swapNames đổi bên đội (name + players + score)', () => {
  const s = defaultState();
  s.config.teams.blue.name = 'A'; s.config.teams.red.name = 'B';
  s.config.teams.blue.players[0] = 'a1'; s.config.teams.red.players[0] = 'b1';
  cfg.swapNames(s);
  assert.strictEqual(s.config.teams.blue.name, 'B');
  assert.strictEqual(s.config.teams.blue.players[0], 'b1');
});

test('swapLogos đổi logo 2 bên', () => {
  const s = defaultState();
  s.config.teams.blue.logo = '/logos/blue.png';
  s.config.teams.red.logo = '/logos/red.png';
  cfg.swapLogos(s);
  assert.strictEqual(s.config.teams.blue.logo, '/logos/red.png');
});

test('setPlayerPhoto sets per index, validates side/index; default has playerPhotos', () => {
  const s = defaultState();
  assert.strictEqual(s.config.teams.blue.playerPhotos.length, 5);
  assert.strictEqual(cfg.setPlayerPhoto(s, 'blue', 2, '/players/blue-2.png').ok, true);
  assert.strictEqual(s.config.teams.blue.playerPhotos[2], '/players/blue-2.png');
  assert.strictEqual(cfg.setPlayerPhoto(s, 'blue', 9, 'x').ok, false);
  assert.strictEqual(cfg.setPlayerPhoto(s, 'green', 0, 'x').ok, false);
});

test('swapNames also swaps playerPhotos', () => {
  const s = defaultState();
  s.config.teams.blue.playerPhotos[0] = '/players/blue-0.png';
  s.config.teams.red.playerPhotos[0] = '/players/red-0.png';
  cfg.swapNames(s);
  assert.strictEqual(s.config.teams.blue.playerPhotos[0], '/players/red-0.png');
});

test('movePlayer reorders players + photos; positions (numbers) fixed', () => {
  const s = defaultState();
  s.config.teams.blue.players = ['A', 'B', 'C', 'D', 'E'];
  s.config.teams.blue.playerPhotos = ['a', 'b', 'c', 'd', 'e'];
  assert.strictEqual(cfg.movePlayer(s, 'blue', 0, 2).ok, true);
  assert.deepStrictEqual(s.config.teams.blue.players, ['B', 'C', 'A', 'D', 'E']);
  assert.deepStrictEqual(s.config.teams.blue.playerPhotos, ['b', 'c', 'a', 'd', 'e']);
  assert.strictEqual(cfg.movePlayer(s, 'blue', 9, 0).ok, false);
  assert.strictEqual(cfg.movePlayer(s, 'green', 0, 1).ok, false);
});
