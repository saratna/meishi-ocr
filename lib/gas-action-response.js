/**
 * GAS JSON 応答の action 別バリデーション（未知 action の誤成功検出）
 */
(function (factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (typeof globalThis !== 'undefined') globalThis.MeishiGasAction = lib;
})(function () {
  'use strict';

  var OUTDATED_MSG =
    'GAS が古い可能性があります。code.gs を最新版に貼り替え、新バージョンで再デプロイしてください。';

  function looksLikeMisroutedScanSave(data) {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.cardsUpdated === 'number' || typeof data.contactDeleted === 'boolean') {
      return false;
    }
    if (data.cardId || data.deletedAt || data.oldName) return false;
    return !!(data.company || data.furigana || data.email1 || data.mobile1 || data.department);
  }

  function assertTagMutationResult(action, result) {
    if (!result || result.status !== 'success') {
      throw new Error((result && result.message) || 'サーバーエラー');
    }
    var data = result.data;
    if (action === 'delete_tag') {
      if (!data || typeof data.name !== 'string') {
        if (looksLikeMisroutedScanSave(data)) throw new Error(OUTDATED_MSG);
        throw new Error('タグ削除の応答が不正です。' + OUTDATED_MSG);
      }
      if (typeof data.cardsUpdated !== 'number') {
        if (looksLikeMisroutedScanSave(data)) throw new Error(OUTDATED_MSG);
        throw new Error('タグ削除の応答が不完全です。' + OUTDATED_MSG);
      }
      return data;
    }
    if (action === 'rename_tag') {
      if (!data || typeof data.oldName !== 'string' || typeof data.newName !== 'string') {
        if (looksLikeMisroutedScanSave(data)) throw new Error(OUTDATED_MSG);
        throw new Error('タグ名変更の応答が不正です。' + OUTDATED_MSG);
      }
      return data;
    }
    if (action === 'create_tag') {
      if (!data || typeof data.name !== 'string') {
        if (looksLikeMisroutedScanSave(data)) throw new Error(OUTDATED_MSG);
        throw new Error('タグ作成の応答が不正です。' + OUTDATED_MSG);
      }
      return data;
    }
    return data;
  }

  return {
    OUTDATED_GAS_MESSAGE: OUTDATED_MSG,
    looksLikeMisroutedScanSave: looksLikeMisroutedScanSave,
    assertTagMutationResult: assertTagMutationResult
  };
});
