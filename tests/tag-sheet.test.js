const test = require('node:test');
const assert = require('node:assert/strict');
const tag = require('../lib/tag-sheet.js');

test('renameTagInField updates one tag', () => {
  const r = tag.renameTagInField('仕事, 東京', '東京', '関東');
  assert.equal(r.changed, true);
  assert.equal(r.value, '仕事, 関東');
});

test('removeTagFromField', () => {
  const r = tag.removeTagFromField('A, B, C', 'B');
  assert.equal(r.changed, true);
  assert.equal(r.value, 'A, C');
});

test('renameTagInField no-op when missing', () => {
  const r = tag.renameTagInField('仕事', '東京', '関東');
  assert.equal(r.changed, false);
  assert.equal(r.value, '仕事');
});
