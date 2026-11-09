/**
 * タグ絞り込み（code.gs の cardMatchesTagFilter と同期）
 */
(function (factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (typeof globalThis !== 'undefined') globalThis.MeishiSearchTags = lib;
  if (typeof self !== 'undefined') self.MeishiSearchTags = lib;
})(function () {
  'use strict';

  function splitTagNames(tags) {
    if (Array.isArray(tags)) return tags.map(function (t) { return String(t || '').trim(); }).filter(Boolean);
    return String(tags || '')
      .split(/[,、\n]/)
      .map(function (t) { return t.trim(); })
      .filter(Boolean);
  }

  function cardMatchesTagFilter(cardTags, filterTags, mode) {
    var filters = splitTagNames(filterTags);
    if (!filters.length) return true;
    var set = {};
    splitTagNames(cardTags).forEach(function (name) {
      set[name] = true;
    });
    if (mode === 'and') {
      return filters.every(function (name) { return !!set[name]; });
    }
    return filters.some(function (name) { return !!set[name]; });
  }

  return {
    splitTagNames: splitTagNames,
    cardMatchesTagFilter: cardMatchesTagFilter
  };
});
