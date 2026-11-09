const test = require('node:test');
const assert = require('node:assert/strict');
const norm = require('../lib/card-normalize.js');

test('normalizePhoneJp: +81 and missing leading 0', () => {
  assert.equal(norm.normalizePhoneJp('+81 90 1234 5678'), '090-1234-5678');
  assert.equal(norm.normalizePhoneJp('9012345678', 'mobile'), '090-1234-5678');
});

test('normalizeEmail: trim and lower case', () => {
  assert.equal(norm.normalizeEmail('  Foo@Example.COM '), 'foo@example.com');
});

test('extractPostalFromAddress', () => {
  const r = norm.extractPostalFromAddress('〒100-0001 東京都千代田区');
  assert.equal(r.postal, '100-0001');
  assert.equal(r.address, '東京都千代田区');
});

test('normalizeMeishiCard merges postal into address', () => {
  const card = norm.normalizeMeishiCard({
    name: '山田太郎',
    furigana: 'ヤマダタロウ',
    email1: 'A@B.COM',
    address: '〒541-0056 大阪市中央区',
    website: 'example.com'
  });
  assert.equal(card.furigana, 'やまだたろう');
  assert.equal(card.email1, 'a@b.com');
  assert.equal(card.website, 'https://example.com');
  assert.match(card.address, /〒541-0056/);
});
