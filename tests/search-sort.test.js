const test = require('node:test');
const assert = require('node:assert/strict');
const sort = require('../lib/search-sort.js');

test('dateDesc: registeredDate S列を優先', () => {
  const list = sort.sortCards([
    { name: 'A', registeredDate: '2024-01-01', createdAt: '2025-01-01 10:00:00' },
    { name: 'B', registeredDate: '2026-06-01', createdAt: '2020-01-01 10:00:00' }
  ], 'dateDesc');
  assert.equal(list[0].name, 'B');
});

test('name: ふりがな C列優先', () => {
  const list = sort.sortCards([
    { name: '山田', furigana: 'やまだ' },
    { name: '伊藤', furigana: 'いとう' }
  ], 'name');
  assert.equal(list[0].furigana, 'いとう');
});

test('company: localeCompare ja', () => {
  const list = sort.sortCards([
    { company: '株式会社イーエス', name: 'a' },
    { company: '株式会社アーエス', name: 'b' }
  ], 'company');
  assert.equal(list[0].company, '株式会社アーエス');
});
