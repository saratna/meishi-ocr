const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cg = require('../lib/contact-group-delete.js');

test('pickContactGroupDeleteFn prefers remove', () => {
  const calls = [];
  const fn = cg.pickContactGroupDeleteFn({
    remove: (rn) => calls.push(['remove', rn]),
    delete: (rn) => calls.push(['delete', rn])
  });
  assert.equal(typeof fn, 'function');
  fn('contactGroups/x');
  assert.deepEqual(calls, [['remove', 'contactGroups/x']]);
});

test('code.gs does not call People.ContactGroups.delete', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'code.gs'), 'utf8');
  assert.doesNotMatch(src, /People\.ContactGroups\.delete\s*\(/);
  assert.match(src, /\.remove\s*\(/);
});

test('buildPeopleDeleteUrl escapes resource name', () => {
  const url = cg.buildPeopleDeleteUrl('contactGroups/abc');
  assert.ok(url.indexOf('contactGroups') >= 0);
  assert.ok(url.indexOf('people.googleapis.com') >= 0);
});
