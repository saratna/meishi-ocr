/**
 * PWA 接続設定（端末の localStorage。リポジトリに実値を置かない）
 */
(function () {
  'use strict';

  var LS_GAS = 'meishi_gas_url';
  var LS_TOKEN = 'meishi_api_token';

  function trim(v) {
    return String(v || '').trim();
  }

  function readGasUrl() {
    return trim(localStorage.getItem(LS_GAS)) || trim(window.MEISHI_OCR && window.MEISHI_OCR.GAS_URL);
  }

  function readApiToken() {
    return trim(localStorage.getItem(LS_TOKEN)) || trim(window.MEISHI_OCR && window.MEISHI_OCR.API_TOKEN);
  }

  function saveConnection(gasUrl, apiToken) {
    localStorage.setItem(LS_GAS, trim(gasUrl));
    localStorage.setItem(LS_TOKEN, trim(apiToken));
    window.MEISHI_OCR = {
      GAS_URL: readGasUrl(),
      API_TOKEN: readApiToken()
    };
  }

  function clearConnection() {
    localStorage.removeItem(LS_GAS);
    localStorage.removeItem(LS_TOKEN);
    window.MEISHI_OCR = { GAS_URL: '', API_TOKEN: '' };
  }

  function isConfigured() {
    var url = readGasUrl();
    var token = readApiToken();
    return !!url && url !== 'YOUR_GAS_WEBAPP_URL' && !!token && token !== 'YOUR_API_TOKEN';
  }

  window.MeishiConfig = {
    readGasUrl: readGasUrl,
    readApiToken: readApiToken,
    saveConnection: saveConnection,
    clearConnection: clearConnection,
    isConfigured: isConfigured,
    keys: { LS_GAS: LS_GAS, LS_TOKEN: LS_TOKEN }
  };

  window.MEISHI_OCR = {
    GAS_URL: readGasUrl(),
    API_TOKEN: readApiToken()
  };
})();
