const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('code.gs is valid JavaScript syntax', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'code.gs'), 'utf8');
  assert.doesNotThrow(() => {
    // GAS 固有 API は実行しない。パーサーで構文のみ検証する。
    new Function(src);
  });
});
