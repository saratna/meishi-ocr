/**
 * GAS ContactGroups 削除ヘルパの方針（code.gs と同期）— .delete は使わず remove / HTTP DELETE
 */
(function (factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
})(function () {
  'use strict';

  function pickContactGroupDeleteFn(contactGroups) {
    if (!contactGroups) return null;
    if (typeof contactGroups.remove === 'function') return contactGroups.remove.bind(contactGroups);
    if (typeof contactGroups['delete'] === 'function') return contactGroups['delete'].bind(contactGroups);
    return null;
  }

  function buildPeopleDeleteUrl(resourceName) {
    var rn = String(resourceName || '').trim();
    if (!rn) return '';
    return 'https://people.googleapis.com/v1/' + encodeURIComponent(rn);
  }

  return {
    pickContactGroupDeleteFn: pickContactGroupDeleteFn,
    buildPeopleDeleteUrl: buildPeopleDeleteUrl
  };
});
