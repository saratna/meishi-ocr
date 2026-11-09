// ※ 旧方式（非推奨）: secrets.js を GitHub Pages 用にコミットする構成
// 新版では config.js + 端末の「接続設定」(localStorage) を使います。
//
// 移行例: 以前の secrets.js の値を PWA の接続設定画面に貼り付けて保存してください。
window.MEISHI_OCR = {
  GAS_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
  API_TOKEN: 'change-me-to-a-long-random-string'
};
