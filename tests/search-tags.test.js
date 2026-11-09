const test = require('node:test');
const assert = require('node:assert/strict');
const tags = require('../lib/search-tags.js');

test('OR: any tag matches', () => {
  assert.equal(tags.cardMatchesTagFilter('仕事, 東京', ['仕事', '家族'], 'or'), true);
  assert.equal(tags.cardMatchesTagFilter('家族', ['仕事', '東京'], 'or'), false);
});

test('AND: all tags required', () => {
  assert.equal(tags.cardMatchesTagFilter('仕事, 東京', ['仕事', '東京'], 'and'), true);
  assert.equal(tags.cardMatchesTagFilter('仕事', ['仕事', '東京'], 'and'), false);
});
