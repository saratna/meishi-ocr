const test = require('node:test');
const assert = require('node:assert/strict');
const hist = require('../lib/image-edit-history.js');

test('setCaptureOriginal clears undo stack', () => {
  const h = hist.createEditHistory(3);
  hist.setCaptureOriginal(h, 'orig');
  hist.recordEdit(h, 'orig');
  hist.setCaptureOriginal(h, 'orig2');
  assert.equal(h.undoStack.length, 0);
  assert.equal(hist.getOriginal(h), 'orig2');
});

test('undoEdit returns last state', () => {
  const h = hist.createEditHistory(3);
  hist.setCaptureOriginal(h, 'a');
  hist.recordEdit(h, 'a');
  hist.recordEdit(h, 'b');
  assert.equal(hist.undoEdit(h), 'b');
  assert.equal(hist.undoEdit(h), 'a');
  assert.equal(hist.undoEdit(h), null);
});

test('maxDepth trims oldest', () => {
  const h = hist.createEditHistory(2);
  hist.setCaptureOriginal(h, '0');
  hist.recordEdit(h, '1');
  hist.recordEdit(h, '2');
  hist.recordEdit(h, '3');
  assert.equal(h.undoStack.length, 2);
  assert.equal(hist.undoEdit(h), '3');
  assert.equal(hist.undoEdit(h), '2');
});
