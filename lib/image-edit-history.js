/**
 * 撮影後画像の元データ保持と undo（ブラウザ・Node 共通）
 */
(function (factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (typeof globalThis !== 'undefined') globalThis.MeishiEditHistory = lib;
  if (typeof self !== 'undefined') self.MeishiEditHistory = lib;
})(function () {
  'use strict';

  function createEditHistory(maxDepth) {
    return {
      original: '',
      undoStack: [],
      maxDepth: Math.max(1, maxDepth || 6)
    };
  }

  function resetEditHistory(history) {
    history.original = '';
    history.undoStack = [];
  }

  function setCaptureOriginal(history, base64) {
    history.original = base64 || '';
    history.undoStack = [];
  }

  function recordEdit(history, previousBase64) {
    if (!history || !previousBase64) return;
    history.undoStack.push(previousBase64);
    while (history.undoStack.length > history.maxDepth) {
      history.undoStack.shift();
    }
  }

  function undoEdit(history) {
    if (!history.undoStack.length) return null;
    return history.undoStack.pop();
  }

  function getOriginal(history) {
    return history.original || '';
  }

  function hasUndo(history) {
    return !!(history && history.undoStack.length);
  }

  function hasOriginal(history) {
    return !!(history && history.original);
  }

  function isCurrentOriginal(current, history) {
    if (!hasOriginal(history)) return false;
    return current === history.original;
  }

  return {
    createEditHistory: createEditHistory,
    resetEditHistory: resetEditHistory,
    setCaptureOriginal: setCaptureOriginal,
    recordEdit: recordEdit,
    undoEdit: undoEdit,
    getOriginal: getOriginal,
    hasUndo: hasUndo,
    hasOriginal: hasOriginal,
    isCurrentOriginal: isCurrentOriginal
  };
});
