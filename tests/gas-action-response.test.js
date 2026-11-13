const test = require('node:test');
const assert = require('node:assert/strict');
const gas = require('../lib/gas-action-response.js');

test('detects misrouted scan save payload on delete_tag', () => {
  assert.throws(() => {
    gas.assertTagMutationResult('delete_tag', {
      status: 'success',
      data: { name: '山田', company: 'ACME' }
    });
  }, /GAS が古い/);
});

test('accepts valid delete_tag', () => {
  const data = gas.assertTagMutationResult('delete_tag', {
    status: 'success',
    data: { name: '仕事', cardsUpdated: 2, contactDeleted: true }
  });
  assert.equal(data.name, '仕事');
});
