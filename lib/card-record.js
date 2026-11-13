/**
 * 名刺DB行メタ（A〜S + 拡張列）— code.gs と同期
 */
(function (factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (typeof globalThis !== 'undefined') globalThis.MeishiCardRecord = lib;
  if (typeof self !== 'undefined') self.MeishiCardRecord = lib;
})(function () {
  'use strict';

  var COL = {
    CREATED_AT: 0,
    NAME: 1,
    FURIGANA: 2,
    COMPANY: 3,
    DEPARTMENT: 4,
    TITLE: 5,
    MOBILE1: 6,
    MOBILE2: 7,
    PHONE: 8,
    FAX: 9,
    EMAIL1: 10,
    EMAIL2: 11,
    ADDRESS: 12,
    WEBSITE: 13,
    MEMO: 14,
    FRONT_URL: 15,
    BACK_URL: 16,
    TAGS: 17,
    REGISTERED: 18,
    CARD_ID: 19,
    DELETED_AT: 20,
    CONTACT_RN: 21
  };

  var SHEET_DATA_COLUMNS = 22;

  function isValidCardId(id) {
    var s = String(id || '').trim();
    if (!s) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  }

  function parseTagsField(tags) {
    if (Array.isArray(tags)) return tags;
    return String(tags || '')
      .split(/[,、\n]/)
      .map(function (t) { return t.trim(); })
      .filter(Boolean);
  }

  function cardFromSheetRow(row) {
    row = row || [];
    return {
      createdAt: row[COL.CREATED_AT] ? String(row[COL.CREATED_AT]) : '',
      name: row[COL.NAME] || '',
      furigana: row[COL.FURIGANA] || '',
      company: row[COL.COMPANY] || '',
      department: row[COL.DEPARTMENT] || '',
      title: row[COL.TITLE] || '',
      mobile1: row[COL.MOBILE1] || '',
      mobile2: row[COL.MOBILE2] || '',
      phone: row[COL.PHONE] || '',
      fax: row[COL.FAX] || '',
      email1: row[COL.EMAIL1] || '',
      email2: row[COL.EMAIL2] || '',
      address: row[COL.ADDRESS] || '',
      website: row[COL.WEBSITE] || '',
      memo: row[COL.MEMO] || '',
      frontImageUrl: row[COL.FRONT_URL] || '',
      backImageUrl: row[COL.BACK_URL] || '',
      tags: row[COL.TAGS] || '',
      registeredDate: row[COL.REGISTERED] ? String(row[COL.REGISTERED]) : '',
      cardId: row[COL.CARD_ID] ? String(row[COL.CARD_ID]).trim() : '',
      deletedAt: row[COL.DELETED_AT] ? String(row[COL.DELETED_AT]) : '',
      contactResourceName: row[COL.CONTACT_RN] ? String(row[COL.CONTACT_RN]).trim() : ''
    };
  }

  function isDeletedRow(row) {
  var d = row && row[COL.DELETED_AT];
    return !!(d && String(d).trim());
  }

  return {
    COL: COL,
    SHEET_DATA_COLUMNS: SHEET_DATA_COLUMNS,
    TRASH_SHEET_NAME: '名刺DB_ゴミ箱',
    isValidCardId: isValidCardId,
    parseTagsField: parseTagsField,
    cardFromSheetRow: cardFromSheetRow,
    isDeletedRow: isDeletedRow
  };
});
