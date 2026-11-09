/**
 * 名刺一覧の並べ替え（code.gs の sortSearchResults と同期）
 */
(function (factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (typeof globalThis !== 'undefined') globalThis.MeishiSearchSort = lib;
  if (typeof self !== 'undefined') self.MeishiSearchSort = lib;
})(function () {
  'use strict';

  var SORT_IDS = ['dateDesc', 'dateAsc', 'company', 'name'];

  function parseCardSortDate(card) {
    var rd = String((card && card.registeredDate) || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(rd)) {
      return Date.parse(rd + 'T00:00:00+09:00') || 0;
    }
    var ca = String((card && card.createdAt) || '').trim();
    if (ca) {
      var normalized = ca.replace(/\//g, '-');
      var t = Date.parse(normalized);
      if (!Number.isNaN(t)) return t;
    }
    return 0;
  }

  function compareCards(a, b, sortId) {
    var sort = SORT_IDS.indexOf(sortId) >= 0 ? sortId : 'dateDesc';
    if (sort === 'dateDesc' || sort === 'dateAsc') {
      var da = parseCardSortDate(a);
      var db = parseCardSortDate(b);
      var diff = da - db;
      if (diff === 0) {
        var na = String(a.name || '');
        var nb = String(b.name || '');
        diff = na.localeCompare(nb, 'ja');
      }
      return sort === 'dateDesc' ? -diff : diff;
    }
    if (sort === 'company') {
      var ca = String(a.company || '');
      var cb = String(b.company || '');
      var c = ca.localeCompare(cb, 'ja', { sensitivity: 'base' });
      if (c !== 0) return c;
      return compareCards(a, b, 'name');
    }
    if (sort === 'name') {
      var fa = String(a.furigana || a.name || '');
      var fb = String(b.furigana || b.name || '');
      var n = fa.localeCompare(fb, 'ja', { sensitivity: 'base' });
      if (n !== 0) return n;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ja', { sensitivity: 'base' });
    }
    return 0;
  }

  function sortCards(list, sortId) {
    return list.slice().sort(function (a, b) {
      return compareCards(a, b, sortId);
    });
  }

  return {
    SORT_IDS: SORT_IDS,
    parseCardSortDate: parseCardSortDate,
    compareCards: compareCards,
    sortCards: sortCards
  };
});
