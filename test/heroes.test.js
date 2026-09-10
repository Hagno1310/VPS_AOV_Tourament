const { test } = require('node:test');
const assert = require('node:assert');
const heroes = require('../src/lib/heroes.js');

test('loadHeroes trả mảng có name + img', () => {
  const list = heroes.loadHeroes();
  assert.ok(Array.isArray(list) && list.length > 100);
  assert.ok(list[0].name && list[0].img);
  assert.ok('voice' in list[0]);
  assert.ok(list[0].img.startsWith('/assets/heroes/'));
});

test('findByImg trả đúng hero, không thấy → null', () => {
  const list = heroes.loadHeroes();
  const target = list[0];
  const found = heroes.findByImg(target.img);
  assert.strictEqual(found.name, target.name);
  assert.strictEqual(heroes.findByImg('/khong/co.png'), null);
});
