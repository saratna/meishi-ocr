/**
 * 成功トーストの自動消去タイマー（世代番号で古いタイマーを無効化）
 */
(function (factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (typeof globalThis !== 'undefined') globalThis.MeishiToastSchedule = lib;
})(function () {
  'use strict';

  var DEFAULT_SUCCESS_MS = 2000;

  function autoDismissMsForKind(kind) {
    if (kind === 'success' || kind === 'info') return DEFAULT_SUCCESS_MS;
    return 0;
  }

  function createToastDismissScheduler(successMs) {
    var ms = typeof successMs === 'number' ? successMs : DEFAULT_SUCCESS_MS;
    var timer = null;
    var generation = 0;

    return {
      bumpGeneration: function () {
        generation += 1;
        return generation;
      },
      cancel: function () {
        if (timer) clearTimeout(timer);
        timer = null;
      },
      cancelAndBump: function () {
        generation += 1;
        if (timer) clearTimeout(timer);
        timer = null;
      },
      scheduleSuccess: function (fn) {
        var gen = generation;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          timer = null;
          if (gen === generation) fn();
        }, ms);
      }
    };
  }

  return {
    DEFAULT_SUCCESS_MS: DEFAULT_SUCCESS_MS,
    autoDismissMsForKind: autoDismissMsForKind,
    createToastDismissScheduler: createToastDismissScheduler
  };
});
