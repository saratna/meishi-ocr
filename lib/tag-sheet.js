/**
 * シート R 列（タグ文字列）の一括置換 — code.gs の applyTagRenameOnSheet と同期
 */
(function (factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (typeof globalThis !== 'undefined') globalThis.MeishiTagSheet = lib;
  if (typeof self !== 'undefined') self.MeishiTagSheet = lib;
})(function () {
  'use strict';

  function normalizeTagNames(tags) {
    var list = [];
    if (Array.isArray(tags)) {
      list = tags;
    } else if (tags) {
      list = String(tags).split(/[,、\n]/);
    }
    var seen = {};
    var out = [];
    list.forEach(function (t) {
      var name = String(t || '').trim();
      if (!name || seen[name]) return;
      seen[name] = true;
      out.push(name);
    });
    return out;
  }

  function tagsFieldFromNames(names) {
    return normalizeTagNames(names).join(', ');
  }

  function renameTagInField(tagsField, oldName, newName) {
    var names = normalizeTagNames(tagsField);
    var changed = false;
    var out = names.map(function (n) {
      if (n === oldName) {
        changed = true;
        return newName;
      }
      return n;
    });
    out = normalizeTagNames(out);
    return { value: tagsFieldFromNames(out), changed: changed };
  }

  function removeTagFromField(tagsField, tagName) {
    var names = normalizeTagNames(tagsField);
    var before = names.length;
    var out = names.filter(function (n) { return n !== tagName; });
    return { value: tagsFieldFromNames(out), changed: out.length !== before };
  }

  return {
    normalizeTagNames: normalizeTagNames,
    tagsFieldFromNames: tagsFieldFromNames,
    renameTagInField: renameTagInField,
    removeTagFromField: removeTagFromField
  };
});
