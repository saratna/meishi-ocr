const test = require('node:test');
const assert = require('node:assert/strict');
const rec = require('../lib/card-record.js');

test('isValidCardId accepts UUID', () => {
  assert.equal(rec.isValidCardId('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(rec.isValidCardId(''), false);
  assert.equal(rec.isValidCardId('row-5'), false);
});

test('cardFromSheetRow maps A-S and extensions', () => {
  const row = new Array(22).fill('');
  row[rec.COL.NAME] = '山田';
  row[rec.COL.CARD_ID] = '550e8400-e29b-41d4-a716-446655440000';
  row[rec.COL.TAGS] = '仕事, 東京';
  const card = rec.cardFromSheetRow(row);
  assert.equal(card.name, '山田');
  assert.equal(card.cardId, '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(card.tags, '仕事, 東京');
});

test('isDeletedRow', () => {
  const row = new Array(22).fill('');
  assert.equal(rec.isDeletedRow(row), false);
  row[rec.COL.DELETED_AT] = '2026-11-13';
  assert.equal(rec.isDeletedRow(row), true);
});
