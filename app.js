// ===== 接続設定（実値は secrets.js。GitHub には上げない） =====
const GAS_URL = (window.MEISHI_OCR && window.MEISHI_OCR.GAS_URL) || 'YOUR_GAS_WEBAPP_URL';
const API_TOKEN = (window.MEISHI_OCR && window.MEISHI_OCR.API_TOKEN) || 'YOUR_API_TOKEN';

function assertConfig() {
  if (!GAS_URL || GAS_URL === 'YOUR_GAS_WEBAPP_URL') {
    alert('secrets.js に GAS_URL を設定してください（secrets.example.js を参照）');
    return false;
  }
  if (!API_TOKEN || API_TOKEN === 'YOUR_API_TOKEN') {
    alert('secrets.js に API_TOKEN を設定してください（GAS の CONFIG.API_TOKEN と同じ値）');
    return false;
  }
  return true;
}

async function gasFetch(payload) {
  if (!assertConfig()) {
    throw new Error('設定不足');
  }
  const response = await fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify(Object.assign({ token: API_TOKEN }, payload)),
    redirect: 'follow'
  });

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    throw new Error('GAS応答がJSONではありません: ' + text.substring(0, 200));
  }
  return result;
}

// ===== 要素取得 =====
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const previewFront = document.getElementById('previewFront');
const previewBack = document.getElementById('previewBack');
const previewBackWrap = document.getElementById('previewBackWrap');
const previewPair = document.getElementById('previewPair');
const captureLabel = document.getElementById('captureLabel');
const captureHint = document.getElementById('captureHint');
const btnCapture = document.getElementById('btnCapture');
const btnCaptureBack = document.getElementById('btnCaptureBack');
const btnScan = document.getElementById('btnScan');
const btnRetry = document.getElementById('btnRetry');
const btnRotateLeft = document.getElementById('btnRotateLeft');
const btnRotateRight = document.getElementById('btnRotateRight');
const rotateTools = document.getElementById('rotateTools');
const btnCropSquare = document.getElementById('btnCropSquare');
const btnCropQuad = document.getElementById('btnCropQuad');
const cropTools = document.getElementById('cropTools');
const btnAutoCrop = document.getElementById('btnAutoCrop');
const actionTools = document.getElementById('actionTools');
const cropEditor = document.getElementById('cropEditor');
const cropCanvas = document.getElementById('cropCanvas');
const cropTitle = document.getElementById('cropTitle');
const cropHelp = document.getElementById('cropHelp');
const btnCropApply = document.getElementById('btnCropApply');
const btnCropCancel = document.getElementById('btnCropCancel');
const btnSave = document.getElementById('btnSave');
const btnCancel = document.getElementById('btnCancel');
const loading = document.getElementById('loading');
const editForm = document.getElementById('editForm');
const status = document.getElementById('status');
const statusMsg = document.getElementById('statusMsg');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

// front | back
let captureSide = 'front';
let lastCapturedSide = 'front';
let imageFront = '';
let imageBack = '';
let faceBox = null;
let faceImage = '';
// 手動回転した直後は横向き自動変換をスキップする側
let skipAutoLandscape = { front: false, back: false };

// ===== フィールド定義 =====
const FIELDS = [
  { key: 'name', id: 'edit-name' },
  { key: 'furigana', id: 'edit-furigana' },
  { key: 'company', id: 'edit-company' },
  { key: 'department', id: 'edit-department' },
  { key: 'title', id: 'edit-title' },
  { key: 'mobile1', id: 'edit-mobile1' },
  { key: 'mobile2', id: 'edit-mobile2' },
  { key: 'phone', id: 'edit-phone' },
  { key: 'fax', id: 'edit-fax' },
  { key: 'email1', id: 'edit-email1' },
  { key: 'email2', id: 'edit-email2' },
  { key: 'address', id: 'edit-address' },
  { key: 'website', id: 'edit-website' },
  { key: 'memo', id: 'edit-memo' }
];

// ===== タブ切り替え =====
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ===== カメラ起動 =====
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, message) {
  var timer = null;
  var timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () { reject(new Error(message)); }, ms);
  });
  return Promise.race([promise, timeout]).finally(function () {
    if (timer !== null) clearTimeout(timer);
  });
}

function stopCameraTracks() {
  var stream = video.srcObject;
  if (stream && stream.getTracks) {
    stream.getTracks().forEach(function (track) {
      try { track.stop(); } catch (e) { /* ignore */ }
    });
  }
  video.srcObject = null;
}

async function startCamera() {
  // disabled にするとクリック自体が消えるので使わない
  btnCapture.disabled = false;
  btnCapture.textContent = 'カメラ起動中...';
  captureLabel.textContent = 'カメラ許可が出たら「許可」を押してください';

  var safety = setTimeout(function () {
    btnCapture.disabled = false;
    if (!video.srcObject) {
      btnCapture.textContent = 'カメラを再試行';
      captureLabel.textContent = '起動が遅れています。再試行を押してください';
    } else {
      btnCapture.textContent = captureSide === 'back' ? '裏面を撮影する' : '表面を撮影する';
      captureLabel.textContent = 'カメラ準備完了（撮影できます）';
    }
  }, 8000);

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('このブラウザはカメラ非対応です（HTTPSで開いてください）');
    }

    stopCameraTracks();

    var stream = null;
    var attempts = [
      { video: { facingMode: { ideal: 'environment' } }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false }
    ];
    var lastErr = null;
    for (var i = 0; i < attempts.length; i++) {
      try {
        captureLabel.textContent = 'カメラ接続中... (' + (i + 1) + '/' + attempts.length + ')';
        stream = await withTimeout(
          navigator.mediaDevices.getUserMedia(attempts[i]),
          10000,
          'カメラ許可がタイムアウトしました'
        );
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!stream) throw lastErr || new Error('カメラを開けませんでした');

    video.srcObject = stream;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('autoplay', 'true');

    // ストリームが付いた瞬間に撮影可能にする（ここが重要）
    btnCapture.disabled = false;
    btnCapture.textContent = captureSide === 'back' ? '裏面を撮影する' : '表面を撮影する';
    captureLabel.textContent = 'カメラ映像を開始しています（撮影可能）';

    await Promise.race([
      video.play().catch(function () { return null; }),
      sleep(1500)
    ]);

    try {
      await waitForVideoReady(4000);
      captureLabel.textContent = captureSide === 'back' ? '裏面を撮影' : '表面を撮影（準備完了）';
    } catch (readyErr) {
      captureLabel.textContent = '映像準備中でも撮影できます';
    }

    btnCapture.disabled = false;
    btnCapture.textContent = captureSide === 'back' ? '裏面を撮影する' : '表面を撮影する';
  } catch (err) {
    btnCapture.disabled = false;
    btnCapture.textContent = 'カメラを再試行';
    captureLabel.textContent = 'カメラを起動できませんでした';
    alert('カメラを起動できませんでした: ' + (err && err.message ? err.message : String(err)) +
      '\n\n・HTTPSで開いているか\n・カメラを「許可」したか\n・他アプリがカメラ使用中でないか\nを確認してください。');
  } finally {
    clearTimeout(safety);
    btnCapture.disabled = false;
  }
}

function waitForVideoReady(timeoutMs) {
  return new Promise(function (resolve, reject) {
    var started = Date.now();
    var timer = null;
    var settled = false;

    function cleanup() {
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('playing', onReady);
      video.removeEventListener('canplay', onReady);
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    }

    function succeed() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }

    function fail(err) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }

    function done() {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        succeed();
        return true;
      }
      return false;
    }

    function onReady() { done(); }

    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('playing', onReady);
    video.addEventListener('canplay', onReady);

    if (done()) return;

    timer = setInterval(function () {
      if (done()) return;
      if (Date.now() - started > timeoutMs) {
        fail(new Error('カメラ映像の準備がタイムアウトしました'));
      }
    }, 100);
  });
}

function getVideoTrackSize() {
  try {
    const stream = video.srcObject;
    const track = stream && stream.getVideoTracks && stream.getVideoTracks()[0];
    if (!track) return null;
    const s = track.getSettings ? track.getSettings() : {};
    if (s.width && s.height) return { w: s.width, h: s.height };
  } catch (e) { /* ignore */ }
  return null;
}

async function captureFrameFromVideo() {
  // Chrome/Android では ImageCapture が確実なことがある
  try {
    const stream = video.srcObject;
    const track = stream && stream.getVideoTracks && stream.getVideoTracks()[0];
    if (track && typeof ImageCapture !== 'undefined') {
      const ic = new ImageCapture(track);
      const bitmap = await ic.grabFrame();
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      if (bitmap.close) bitmap.close();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      if (dataUrl && dataUrl !== 'data:,') return dataUrl.split(',')[1];
    }
  } catch (e) {
    console.warn('ImageCapture fallback:', e);
  }

  let vw = video.videoWidth || 0;
  let vh = video.videoHeight || 0;
  if (!vw || !vh) {
    const ts = getVideoTrackSize();
    if (ts) { vw = ts.w; vh = ts.h; }
  }
  if (!vw || !vh) {
    // 最後の手段: 表示サイズから推定
    const ratio = window.devicePixelRatio || 2;
    vw = Math.max(640, Math.round((video.clientWidth || 640) * ratio));
    vh = Math.max(480, Math.round((video.clientHeight || 480) * ratio));
  }

  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext('2d');
  try {
    ctx.drawImage(video, 0, 0, vw, vh);
  } catch (e) {
    throw new Error('カメラ映像を画像化できませんでした: ' + e.message);
  }
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  if (!dataUrl || dataUrl === 'data:,') {
    throw new Error('画像の取得に失敗しました');
  }
  return dataUrl.split(',')[1];
}

// ===== 画像ユーティリティ（名刺は横長が標準） =====
function loadImageFromBase64(base64) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = 'data:image/jpeg;base64,' + base64;
  });
}

function canvasToJpegBase64(sourceCanvas, quality) {
  return sourceCanvas.toDataURL('image/jpeg', quality || 0.92).split(',')[1];
}

/** 時計回りに degrees（90/180/270）回転 */
async function rotateBase64(base64, degrees) {
  const img = await loadImageFromBase64(base64);
  const rad = (degrees * Math.PI) / 180;
  const swap = degrees % 180 !== 0;
  const out = document.createElement('canvas');
  out.width = swap ? img.height : img.width;
  out.height = swap ? img.width : img.height;
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvasToJpegBase64(out, 0.92);
}

/** 縦長なら90°回して横長（名刺標準）にする */
async function ensureLandscapeBase64(base64) {
  const img = await loadImageFromBase64(base64);
  if (img.width >= img.height) return base64;
  return rotateBase64(base64, 90);
}

function showCameraFor(side) {
  captureSide = side;
  captureLabel.textContent = side === 'back' ? '裏面を撮影' : '表面を撮影';
  video.style.display = 'block';
  btnCapture.style.display = 'block';
  btnCapture.textContent = side === 'back' ? '裏面を撮影する' : '表面を撮影する';
  if (rotateTools) rotateTools.classList.remove('show');
  if (cropTools) cropTools.classList.remove('show');
  if (actionTools) actionTools.classList.remove('show');
  // 撮影中はプレビューを隠してシャッターを近くに
  previewPair.classList.remove('show');
  if (side === 'back' && imageFront) {
    captureHint.classList.add('show');
  } else {
    captureHint.classList.remove('show');
  }
  status.classList.remove('show');
  editForm.classList.remove('show');
}

function updatePreviewVisibility() {
  if (imageFront) {
    // 同一dataURLでも回転を反映するため一度クリア
    previewFront.removeAttribute('src');
    previewFront.src = 'data:image/jpeg;base64,' + imageFront;
    previewFront.style.display = 'block';
  } else {
    previewFront.removeAttribute('src');
    previewFront.style.display = 'none';
  }

  if (imageBack) {
    previewBack.removeAttribute('src');
    previewBack.src = 'data:image/jpeg;base64,' + imageBack;
    previewBack.style.display = 'block';
    previewBackWrap.style.display = 'block';
  } else {
    previewBack.removeAttribute('src');
    previewBack.style.display = 'none';
    previewBackWrap.style.display = 'none';
  }

  const hasAny = !!(imageFront || imageBack);
  previewPair.classList.toggle('show', hasAny);
  if (rotateTools) rotateTools.classList.toggle('show', hasAny);
  if (cropTools) cropTools.classList.toggle('show', hasAny);
  if (actionTools) actionTools.classList.toggle('show', hasAny);
}

function showPostCaptureActions() {
  video.style.display = 'none';
  btnCapture.style.display = 'none';
  captureHint.classList.remove('show');
  // コンテナ表示に任せつつ、過去の inline display:none を必ず解除
  if (btnCaptureBack) {
    btnCaptureBack.style.display = imageBack ? 'none' : 'block';
    btnCaptureBack.disabled = false;
  }
  if (btnScan) {
    btnScan.style.display = 'block';
    btnScan.disabled = false;
  }
  if (btnRetry) {
    btnRetry.style.display = 'block';
    btnRetry.disabled = false;
  }
  if (btnAutoCrop) {
    btnAutoCrop.style.display = 'block';
    btnAutoCrop.disabled = false;
  }
  if (btnCropSquare) {
    btnCropSquare.style.display = 'block';
    btnCropSquare.disabled = false;
  }
  if (btnCropQuad) {
    btnCropQuad.style.display = 'block';
    btnCropQuad.disabled = false;
  }
  if (actionTools) actionTools.classList.add('show');
  if (cropTools) cropTools.classList.add('show');
  if (rotateTools) rotateTools.classList.add('show');
  updatePreviewVisibility();
}

// ===== 撮影 =====
let captureBusy = false;
let lastShotAt = 0;

async function takePhoto(ev) {
  if (ev) {
    try { ev.preventDefault(); } catch (e) { /* ignore */ }
  }

  captureLabel.textContent = 'シャッター反応あり...';

  const label = String(btnCapture.textContent || '');
  if (label.indexOf('再試行') !== -1 || !video.srcObject) {
    await startCamera();
    return;
  }

  if (captureBusy) return;
  if (Date.now() - lastShotAt < 900) return;
  lastShotAt = Date.now();
  captureBusy = true;
  btnCapture.disabled = false; // 無効化しない（反応なし防止）
  const prevLabel = (label.indexOf('撮影する') !== -1) ? label : '表面を撮影する';
  btnCapture.textContent = '撮影中...';
  captureLabel.textContent = '撮影しています...';

  try {
    if (!video.videoWidth || !video.videoHeight) {
      await Promise.race([
        video.play().catch(function () { return null; }),
        sleep(800)
      ]);
    }

    let base64 = await captureFrameFromVideo();

    const sideKey = captureSide === 'back' ? 'back' : 'front';
    if (!skipAutoLandscape[sideKey]) {
      base64 = await ensureLandscapeBase64(base64);
    }
    skipAutoLandscape[sideKey] = false;

    if (captureSide === 'back') {
      imageBack = base64;
      lastCapturedSide = 'back';
    } else {
      imageFront = base64;
      imageBack = '';
      lastCapturedSide = 'front';
      faceBox = null;
      faceImage = '';
      skipAutoLandscape.back = false;
    }

    showPostCaptureActions();
    captureLabel.textContent = captureSide === 'back'
      ? '表・裏 撮影済み'
      : '表面 撮影済み（裏面は任意）';
  } catch (err) {
    console.error(err);
    const msg = (err && err.message) ? err.message : String(err);
    captureLabel.textContent = '撮影に失敗: ' + msg;
    alert('撮影に失敗しました: ' + msg);
    btnCapture.style.display = 'block';
    btnCapture.textContent = prevLabel;
  } finally {
    captureBusy = false;
    btnCapture.disabled = false;
  }
}

// クリックが届かない端末向けに複数イベントで受ける
window.takeMeishiPhoto = takePhoto;
['click', 'pointerup', 'touchend'].forEach(function (evtName) {
  btnCapture.addEventListener(evtName, function (ev) {
    // touchend の後に click が二重発火しないよう touch では prevent
    if (evtName === 'touchend') {
      try { ev.preventDefault(); } catch (e) { /* ignore */ }
    }
    takePhoto(ev);
  }, { passive: false });
});

// ===== 向きの手動修正（左右90°・直近に撮った面） =====
let rotateBusy = false;
let lastRotateAt = 0;

async function rotateMeishi(degrees, ev) {
  if (ev) {
    try { ev.preventDefault(); } catch (e) { /* ignore */ }
  }
  if (rotateBusy) return;
  if (Date.now() - lastRotateAt < 400) return;
  lastRotateAt = Date.now();
  rotateBusy = true;

  captureLabel.textContent = '回転しています...';

  try {
    const side = (lastCapturedSide === 'back' && imageBack) ? 'back'
      : imageFront ? 'front'
      : imageBack ? 'back' : null;
    if (!side) {
      captureLabel.textContent = '先に撮影してください';
      return;
    }

    const deg = Number(degrees) || 90;
    if (side === 'back') {
      imageBack = await rotateBase64(imageBack, deg);
      skipAutoLandscape.back = true;
    } else {
      imageFront = await rotateBase64(imageFront, deg);
      skipAutoLandscape.front = true;
      faceBox = null;
      faceImage = '';
    }
    updatePreviewVisibility();
    captureLabel.textContent = (side === 'back' ? '裏面' : '表面') + 'を' + deg + '°回転しました';
  } catch (err) {
    captureLabel.textContent = '回転に失敗しました';
    alert('回転に失敗しました: ' + (err && err.message ? err.message : String(err)));
  } finally {
    rotateBusy = false;
  }
}

window.rotateMeishi = rotateMeishi;

function bindButtonEvents(el, handler) {
  if (!el) return;
  ['click', 'pointerup', 'touchend'].forEach(function (evtName) {
    el.addEventListener(evtName, function (ev) {
      if (evtName === 'touchend') {
        try { ev.preventDefault(); } catch (e) { /* ignore */ }
      }
      handler(ev);
    }, { passive: false });
  });
}

bindButtonEvents(btnRotateLeft, function (ev) { rotateMeishi(-90, ev); });
bindButtonEvents(btnRotateRight, function (ev) { rotateMeishi(90, ev); });

// ===== 裏面撮影・読み取り・撮り直し =====
function startBackCapture(ev) {
  if (ev) { try { ev.preventDefault(); } catch (e) {} }
  showCameraFor('back');
}
window.startBackCapture = startBackCapture;
bindButtonEvents(btnCaptureBack, startBackCapture);

function resetMeishiCamera(ev) {
  if (ev) { try { ev.preventDefault(); } catch (e) {} }
  resetCamera();
}
window.resetMeishiCamera = resetMeishiCamera;
bindButtonEvents(btnRetry, resetMeishiCamera);
bindButtonEvents(btnCancel, resetMeishiCamera);

// ===== 撮り直し =====
function resetCamera() {
  imageFront = '';
  imageBack = '';
  faceBox = null;
  faceImage = '';
  skipAutoLandscape = { front: false, back: false };
  previewFront.style.display = 'none';
  previewBack.style.display = 'none';
  previewBackWrap.style.display = 'none';
  previewPair.classList.remove('show');
  captureHint.classList.remove('show');
  if (rotateTools) rotateTools.classList.remove('show');
  if (cropTools) cropTools.classList.remove('show');
  if (actionTools) actionTools.classList.remove('show');
  btnSave.style.display = 'none';
  editForm.classList.remove('show');
  status.classList.remove('show');
  showCameraFor('front');
}



// ===== 名刺四隅の自動検出 → 真四角補正 =====
function toGray(data, w, h) {
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    g[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return g;
}

function sobelEdges(gray, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] + gray[i - w + 1]
        -2 * gray[i - 1] + 2 * gray[i + 1]
        -gray[i + w - 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]
        + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      out[i] = Math.abs(gx) + Math.abs(gy);
    }
  }
  return out;
}

function convexHull(points) {
  if (points.length <= 3) return points.slice();
  points = points.slice().sort(function (a, b) {
    return a.x === b.x ? a.y - b.y : a.x - b.x;
  });
  function cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }
  const lower = [];
  for (let i = 0; i < points.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0) lower.pop();
    lower.push(points[i]);
  }
  const upper = [];
  for (let i = points.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) upper.pop();
    upper.push(points[i]);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function quadArea(pts) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

function orderQuadPoints(pts) {
  // TL, TR, BR, BL
  const sum = pts.map(function (p) { return { p: p, s: p.x + p.y, d: p.x - p.y }; });
  const tl = sum.reduce(function (a, b) { return a.s < b.s ? a : b; }).p;
  const br = sum.reduce(function (a, b) { return a.s > b.s ? a : b; }).p;
  const tr = sum.reduce(function (a, b) { return a.d > b.d ? a : b; }).p;
  const bl = sum.reduce(function (a, b) { return a.d < b.d ? a : b; }).p;
  return [tl, tr, br, bl];
}

function detectCardCorners(img) {
  const maxW = 420;
  const scale = Math.min(1, maxW / img.width);
  const w = Math.max(32, Math.round(img.width * scale));
  const h = Math.max(32, Math.round(img.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const gray = toGray(imageData.data, w, h);
  const edges = sobelEdges(gray, w, h);

  // 上位エッジ閾値
  let maxE = 0;
  for (let i = 0; i < edges.length; i++) if (edges[i] > maxE) maxE = edges[i];
  const thr = Math.max(40, maxE * 0.18);

  const pts = [];
  const step = 2;
  for (let y = 2; y < h - 2; y += step) {
    for (let x = 2; x < w - 2; x += step) {
      if (edges[y * w + x] >= thr) pts.push({ x: x, y: y });
    }
  }
  if (pts.length < 20) {
    // フォールバック: 少し内側の矩形
    const m = Math.round(Math.min(w, h) * 0.06);
    return orderQuadPoints([
      { x: m / scale, y: m / scale },
      { x: (w - m) / scale, y: m / scale },
      { x: (w - m) / scale, y: (h - m) / scale },
      { x: m / scale, y: (h - m) / scale }
    ]);
  }

  // 点数が多いので間引き
  const sampled = [];
  const stride = Math.max(1, Math.floor(pts.length / 400));
  for (let i = 0; i < pts.length; i += stride) sampled.push(pts[i]);
  const hull = convexHull(sampled);
  if (hull.length < 4) {
    const m = Math.round(Math.min(w, h) * 0.06);
    return orderQuadPoints([
      { x: m / scale, y: m / scale },
      { x: (w - m) / scale, y: m / scale },
      { x: (w - m) / scale, y: (h - m) / scale },
      { x: m / scale, y: (h - m) / scale }
    ]);
  }

  // 凸包から面積最大の四角形を探索（点数を間引き）
  let best = null;
  let bestArea = 0;
  const n = hull.length;
  const lim = Math.min(n, 36);
  const idx = [];
  for (let i = 0; i < lim; i++) idx.push(Math.floor(i * n / lim));

  for (let a = 0; a < idx.length; a++) {
    for (let b = a + 1; b < idx.length; b++) {
      for (let c = b + 1; c < idx.length; c++) {
        for (let d = c + 1; d < idx.length; d++) {
          const quad = [hull[idx[a]], hull[idx[b]], hull[idx[c]], hull[idx[d]]];
          const area = quadArea(quad);
          if (area > bestArea) {
            bestArea = area;
            best = quad;
          }
        }
      }
    }
  }

  if (!best || bestArea < (w * h * 0.08)) {
    const m = Math.round(Math.min(w, h) * 0.05);
    best = [
      { x: m, y: m },
      { x: w - m, y: m },
      { x: w - m, y: h - m },
      { x: m, y: h - m }
    ];
  }

  // 少し内側に寄せて余白を減らす（安定化）
  const ordered = orderQuadPoints(best);
  const cx = (ordered[0].x + ordered[1].x + ordered[2].x + ordered[3].x) / 4;
  const cy = (ordered[0].y + ordered[1].y + ordered[2].y + ordered[3].y) / 4;
  const inset = 0.02; // 2% 内側へ
  const refined = ordered.map(function (p) {
    return {
      x: (p.x + (cx - p.x) * inset) / scale,
      y: (p.y + (cy - p.y) * inset) / scale
    };
  });
  return orderQuadPoints(refined);
}

async function autoCropMeishi(ev) {
  if (ev) { try { ev.preventDefault(); } catch (e) {} }
  const side = getActiveCropSide();
  const base64 = getActiveCropBase64();
  if (!side || !base64) {
    alert('先に名刺を撮影してください');
    return;
  }
  captureLabel.textContent = '四隅を自動検出中...';
  try {
    const img = await loadImageFromBase64(base64);
    const corners = detectCardCorners(img);
    const next = await warpQuadToSquare(base64, corners);
    setActiveCropBase64(next);
    // 真四角になったので横長自動変換はスキップ
    if (side === 'back') skipAutoLandscape.back = true;
    else skipAutoLandscape.front = true;
    updatePreviewVisibility();
    captureLabel.textContent = '自動で真四角に補正しました';
  } catch (err) {
    console.error(err);
    captureLabel.textContent = '自動切り取りに失敗';
    alert('自動切り取りに失敗しました: ' + (err && err.message ? err.message : String(err)));
  }
}
window.autoCropMeishi = autoCropMeishi;
bindButtonEvents(btnAutoCrop, autoCropMeishi);
bindButtonEvents(btnCropSquare, function (ev) {
  if (ev) { try { ev.preventDefault(); } catch (e) {} }
  openCropEditor('square');
});
bindButtonEvents(btnCropQuad, function (ev) {
  if (ev) { try { ev.preventDefault(); } catch (e) {} }
  openCropEditor('quad');
});


// ===== 切り取りエディタ =====
const cropState = {
  mode: null, // 'square' | 'quad'
  side: null,
  img: null,
  // 画像ピクセル座標
  square: { x: 0, y: 0, size: 100 },
  points: [], // [{x,y} x4] TL TR BR BL
  drag: null, // { type, index, startX, startY, orig }
  displayScale: 1
};

function getActiveCropSide() {
  if (lastCapturedSide === 'back' && imageBack) return 'back';
  if (imageFront) return 'front';
  if (imageBack) return 'back';
  return null;
}

function getActiveCropBase64() {
  const side = getActiveCropSide();
  if (side === 'back') return imageBack;
  if (side === 'front') return imageFront;
  return '';
}

function setActiveCropBase64(base64) {
  const side = cropState.side || getActiveCropSide();
  if (side === 'back') {
    imageBack = base64;
    skipAutoLandscape.back = true;
  } else {
    imageFront = base64;
    skipAutoLandscape.front = true;
    faceBox = null;
    faceImage = '';
  }
}

function clientToImageCoords(clientX, clientY) {
  const rect = cropCanvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * cropState.img.width;
  const y = ((clientY - rect.top) / rect.height) * cropState.img.height;
  return {
    x: Math.max(0, Math.min(cropState.img.width, x)),
    y: Math.max(0, Math.min(cropState.img.height, y))
  };
}

function drawCropEditor() {
  const img = cropState.img;
  if (!img) return;

  const maxW = Math.min(420, window.innerWidth - 24);
  const scale = maxW / img.width;
  cropState.displayScale = scale;
  cropCanvas.width = Math.round(img.width * scale);
  cropCanvas.height = Math.round(img.height * scale);

  const ctx = cropCanvas.getContext('2d');
  ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
  ctx.drawImage(img, 0, 0, cropCanvas.width, cropCanvas.height);

  // 暗幕
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

  const s = scale;
  ctx.save();
  ctx.beginPath();
  if (cropState.mode === 'square') {
    const { x, y, size } = cropState.square;
    ctx.rect(x * s, y * s, size * s, size * s);
  } else {
    const pts = cropState.points;
    ctx.moveTo(pts[0].x * s, pts[0].y * s);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x * s, pts[i].y * s);
    ctx.closePath();
  }
  ctx.clip();
  ctx.drawImage(img, 0, 0, cropCanvas.width, cropCanvas.height);
  ctx.restore();

  // 枠線
  ctx.strokeStyle = '#e94560';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (cropState.mode === 'square') {
    const { x, y, size } = cropState.square;
    ctx.strokeRect(x * s, y * s, size * s, size * s);
    // 四隅ハンドル
    const handles = [
      { x: x, y: y },
      { x: x + size, y: y },
      { x: x + size, y: y + size },
      { x: x, y: y + size }
    ];
    handles.forEach(h => drawHandle(ctx, h.x * s, h.y * s));
  } else {
    const pts = cropState.points;
    ctx.moveTo(pts[0].x * s, pts[0].y * s);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x * s, pts[i].y * s);
    ctx.closePath();
    ctx.stroke();
    pts.forEach((p, i) => {
      drawHandle(ctx, p.x * s, p.y * s);
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.fillText(String(i + 1), p.x * s + 10, p.y * s - 8);
    });
  }
}

function drawHandle(ctx, x, y) {
  ctx.beginPath();
  ctx.fillStyle = '#e94560';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function hitTestCrop(imgX, imgY) {
  const thr = 24 / cropState.displayScale;
  if (cropState.mode === 'square') {
    const { x, y, size } = cropState.square;
    const corners = [
      { type: 'corner', index: 0, x: x, y: y },
      { type: 'corner', index: 1, x: x + size, y: y },
      { type: 'corner', index: 2, x: x + size, y: y + size },
      { type: 'corner', index: 3, x: x, y: y + size }
    ];
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i];
      if (Math.hypot(imgX - c.x, imgY - c.y) <= thr) return c;
    }
    if (imgX >= x && imgX <= x + size && imgY >= y && imgY <= y + size) {
      return { type: 'move' };
    }
    return null;
  }

  for (let i = 0; i < cropState.points.length; i++) {
    const p = cropState.points[i];
    if (Math.hypot(imgX - p.x, imgY - p.y) <= thr) {
      return { type: 'point', index: i };
    }
  }
  return null;
}

window.openCropEditor = openCropEditor;
function openCropEditor(mode) {
  const side = getActiveCropSide();
  const base64 = getActiveCropBase64();
  if (!side || !base64) {
    alert('先に名刺を撮影してください');
    return;
  }

  loadImageFromBase64(base64).then(img => {
    cropState.mode = mode;
    cropState.side = side;
    cropState.img = img;
    cropState.drag = null;

    const m = Math.min(img.width, img.height);
    const size = Math.floor(m * 0.82);
    cropState.square = {
      x: Math.floor((img.width - size) / 2),
      y: Math.floor((img.height - size) / 2),
      size: size
    };

    const insetX = img.width * 0.08;
    const insetY = img.height * 0.08;
    cropState.points = [
      { x: insetX, y: insetY },
      { x: img.width - insetX, y: insetY },
      { x: img.width - insetX, y: img.height - insetY },
      { x: insetX, y: img.height - insetY }
    ];

    if (mode === 'square') {
      cropTitle.textContent = '正方形で切り取り';
      cropHelp.textContent = '枠をドラッグで移動、角をドラッグでサイズ変更。適用で真四角に切り出します。';
    } else {
      cropTitle.textContent = '4点で切り取り';
      cropHelp.textContent = '名刺の四隅（左上→右上→右下→左下）をドラッグして合わせると、真四角に補正して切り出します。';
    }

    cropEditor.classList.add('show');
    cropEditor.setAttribute('aria-hidden', 'false');
    drawCropEditor();
  }).catch(err => alert(err.message));
}

function closeCropEditor() {
  cropEditor.classList.remove('show');
  cropEditor.setAttribute('aria-hidden', 'true');
  cropState.mode = null;
  cropState.img = null;
  cropState.drag = null;
}

function clampSquare() {
  const img = cropState.img;
  let { x, y, size } = cropState.square;
  size = Math.max(40, Math.min(size, img.width, img.height));
  x = Math.max(0, Math.min(x, img.width - size));
  y = Math.max(0, Math.min(y, img.height - size));
  cropState.square = { x, y, size };
}

/** 4点 → 正方形への透視変換 */
function getPerspectiveTransform(src, dst) {
  // src/dst: [{x,y} x4]
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const s = src[i];
    const d = dst[i];
    A.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y]);
    b.push(d.x);
    A.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y]);
    b.push(d.y);
  }
  const h = solveGaussian(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function solveGaussian(Ain, bin) {
  const n = bin.length;
  const M = Ain.map((row, i) => row.slice().concat([bin[i]]));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-10) {
      throw new Error('変形計算に失敗しました。4点が一直線になっていないか確認してください');
    }
    if (pivot !== col) {
      const t = M[col];
      M[col] = M[pivot];
      M[pivot] = t;
    }
    const piv = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map(row => row[n]);
}

function invertHomography(h) {
  // 3x3 matrix inverse
  const a = h[0], b = h[1], c = h[2];
  const d = h[3], e = h[4], f = h[5];
  const g = h[6], hh = h[7], i = h[8];
  const A = e * i - f * hh;
  const B = f * g - d * i;
  const C = d * hh - e * g;
  const D = c * hh - b * i;
  const E = a * i - c * g;
  const F = b * g - a * hh;
  const G = b * f - c * e;
  const H = c * d - a * f;
  const I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('変形が不正です');
  return [
    A / det, D / det, G / det,
    B / det, E / det, H / det,
    C / det, F / det, I / det
  ];
}

function applyHomography(h, x, y) {
  const w = h[6] * x + h[7] * y + h[8];
  return {
    x: (h[0] * x + h[1] * y + h[2]) / w,
    y: (h[3] * x + h[4] * y + h[5]) / w
  };
}

function sampleBilinear(data, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) {
    return [0, 0, 0, 255];
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const fx = x - x0;
  const fy = y - y0;
  const idx = (yy, xx) => (yy * width + xx) * 4;
  const i00 = idx(y0, x0);
  const i10 = idx(y0, x1);
  const i01 = idx(y1, x0);
  const i11 = idx(y1, x1);
  const out = [];
  for (let c = 0; c < 4; c++) {
    const v =
      data[i00 + c] * (1 - fx) * (1 - fy) +
      data[i10 + c] * fx * (1 - fy) +
      data[i01 + c] * (1 - fx) * fy +
      data[i11 + c] * fx * fy;
    out.push(v);
  }
  return out;
}

async function warpQuadToSquare(base64, points) {
  const img = await loadImageFromBase64(base64);
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const sctx = srcCanvas.getContext('2d');
  sctx.drawImage(img, 0, 0);
  const srcData = sctx.getImageData(0, 0, img.width, img.height);

  // 出力サイズ：辺の平均長
  const edgeLens = [
    Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
    Math.hypot(points[2].x - points[1].x, points[2].y - points[1].y),
    Math.hypot(points[3].x - points[2].x, points[3].y - points[2].y),
    Math.hypot(points[0].x - points[3].x, points[0].y - points[3].y)
  ];
  const outSize = Math.max(256, Math.min(1600, Math.round(edgeLens.reduce((a, b) => a + b, 0) / 4)));

  const dst = [
    { x: 0, y: 0 },
    { x: outSize - 1, y: 0 },
    { x: outSize - 1, y: outSize - 1 },
    { x: 0, y: outSize - 1 }
  ];

  // dest -> src の逆変換用（出力各画素から入力を引く）
  const hFwd = getPerspectiveTransform(points, dst);
  const hInv = invertHomography(hFwd);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outSize;
  outCanvas.height = outSize;
  const octx = outCanvas.getContext('2d');
  const outImg = octx.createImageData(outSize, outSize);
  const out = outImg.data;

  for (let y = 0; y < outSize; y++) {
    for (let x = 0; x < outSize; x++) {
      const src = applyHomography(hInv, x, y);
      const rgba = sampleBilinear(srcData.data, img.width, img.height, src.x, src.y);
      const i = (y * outSize + x) * 4;
      out[i] = rgba[0];
      out[i + 1] = rgba[1];
      out[i + 2] = rgba[2];
      out[i + 3] = 255;
    }
  }
  octx.putImageData(outImg, 0, 0);
  return canvasToJpegBase64(outCanvas, 0.92);
}

async function cropSquareRegion(base64, square) {
  const img = await loadImageFromBase64(base64);
  const { x, y, size } = square;
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const ctx = out.getContext('2d');
  ctx.drawImage(img, x, y, size, size, 0, 0, size, size);
  return canvasToJpegBase64(out, 0.92);
}

function onCropPointerDown(e) {
  if (!cropState.img) return;
  e.preventDefault();
  const t = e.touches ? e.touches[0] : e;
  const pt = clientToImageCoords(t.clientX, t.clientY);
  const hit = hitTestCrop(pt.x, pt.y);
  if (!hit) return;
  cropState.drag = {
    type: hit.type,
    index: hit.index,
    start: pt,
    origSquare: Object.assign({}, cropState.square),
    origPoints: cropState.points.map(p => ({ x: p.x, y: p.y }))
  };
}

function onCropPointerMove(e) {
  if (!cropState.drag || !cropState.img) return;
  e.preventDefault();
  const t = e.touches ? e.touches[0] : e;
  const pt = clientToImageCoords(t.clientX, t.clientY);
  const dx = pt.x - cropState.drag.start.x;
  const dy = pt.y - cropState.drag.start.y;

  if (cropState.mode === 'square') {
    const o = cropState.drag.origSquare;
    if (cropState.drag.type === 'move') {
      cropState.square.x = o.x + dx;
      cropState.square.y = o.y + dy;
      clampSquare();
    } else if (cropState.drag.type === 'corner') {
      const idx = cropState.drag.index;
      // 対角を固定してサイズ変更
      const fixed = [
        { x: o.x + o.size, y: o.y + o.size },
        { x: o.x, y: o.y + o.size },
        { x: o.x, y: o.y },
        { x: o.x + o.size, y: o.y }
      ][idx];
      const size = Math.max(40, Math.max(Math.abs(pt.x - fixed.x), Math.abs(pt.y - fixed.y)));
      cropState.square.size = size;
      cropState.square.x = Math.min(fixed.x, fixed.x - (pt.x < fixed.x ? size : 0) + (pt.x >= fixed.x ? 0 : 0));
      // simpler corner resize from fixed opposite corner
      if (idx === 0) {
        cropState.square.x = fixed.x - size;
        cropState.square.y = fixed.y - size;
      } else if (idx === 1) {
        cropState.square.x = fixed.x;
        cropState.square.y = fixed.y - size;
      } else if (idx === 2) {
        cropState.square.x = fixed.x;
        cropState.square.y = fixed.y;
      } else {
        cropState.square.x = fixed.x - size;
        cropState.square.y = fixed.y;
      }
      cropState.square.size = size;
      clampSquare();
    }
  } else if (cropState.drag.type === 'point') {
    cropState.points[cropState.drag.index] = { x: pt.x, y: pt.y };
  }
  drawCropEditor();
}

function onCropPointerUp(e) {
  if (e) e.preventDefault();
  cropState.drag = null;
}

cropCanvas.addEventListener('mousedown', onCropPointerDown);
window.addEventListener('mousemove', onCropPointerMove);
window.addEventListener('mouseup', onCropPointerUp);
cropCanvas.addEventListener('touchstart', onCropPointerDown, { passive: false });
window.addEventListener('touchmove', onCropPointerMove, { passive: false });
window.addEventListener('touchend', onCropPointerUp);

btnCropSquare.addEventListener('click', () => openCropEditor('square'));
btnCropQuad.addEventListener('click', () => openCropEditor('quad'));

btnCropCancel.addEventListener('click', closeCropEditor);

btnCropApply.addEventListener('click', async () => {
  try {
    btnCropApply.disabled = true;
    btnCropApply.textContent = '処理中...';
    const base64 = cropState.side === 'back' ? imageBack : imageFront;
    let next;
    if (cropState.mode === 'square') {
      clampSquare();
      next = await cropSquareRegion(base64, cropState.square);
    } else {
      next = await warpQuadToSquare(base64, cropState.points);
    }
    setActiveCropBase64(next);
    closeCropEditor();
    updatePreviewVisibility();
    captureLabel.textContent = '切り取りを反映しました';
  } catch (err) {
    alert('切り取りに失敗しました: ' + (err.message || err));
  } finally {
    btnCropApply.disabled = false;
    btnCropApply.textContent = 'この範囲で切り取る';
  }
});

// ===== 顔くり抜き（Visionの座標をフロントでクロップ） =====
function cropFaceFromFront(box) {
  if (!box || !imageFront) return '';

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const padX = Math.round((box.right - box.left) * 0.15);
      const padY = Math.round((box.bottom - box.top) * 0.15);
      const left = Math.max(0, box.left - padX);
      const top = Math.max(0, box.top - padY);
      const right = Math.min(img.width, box.right + padX);
      const bottom = Math.min(img.height, box.bottom + padY);
      const w = Math.max(1, right - left);
      const h = Math.max(1, bottom - top);

      const faceCanvas = document.createElement('canvas');
      // 連絡先写真向けに正方形へ
      const size = Math.max(w, h);
      faceCanvas.width = size;
      faceCanvas.height = size;
      const fctx = faceCanvas.getContext('2d');
      fctx.fillStyle = '#111';
      fctx.fillRect(0, 0, size, size);
      const dx = Math.floor((size - w) / 2);
      const dy = Math.floor((size - h) / 2);
      fctx.drawImage(img, left, top, w, h, dx, dy, w, h);

      const dataUrl = faceCanvas.toDataURL('image/jpeg', 0.92);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = () => resolve('');
    img.src = 'data:image/jpeg;base64,' + imageFront;
  });
}

// ===== 読み取り（OCR + Gemini → 編集フォームに表示） =====
async function startMeishiScan(ev) {
  if (ev) { try { ev.preventDefault(); } catch (e) {} }
  if (!imageFront) {
    alert('先に表面を撮影してください');
    return;
  }
  // fall through by calling the original logic via duplicated trigger
  await runMeishiScan();
}
window.startMeishiScan = startMeishiScan;
bindButtonEvents(btnScan, startMeishiScan);

async function runMeishiScan() {
  if (!imageFront) return;

  if (actionTools) actionTools.classList.remove('show');
  if (cropTools) cropTools.classList.remove('show');
  if (rotateTools) rotateTools.classList.remove('show');
  loading.textContent = imageBack
    ? '処理中...表・裏を読み取っています'
    : '処理中...名刺を読み取っています';
  loading.classList.add('show');

  try {
    if (!skipAutoLandscape.front) {
      imageFront = await ensureLandscapeBase64(imageFront);
    }
    if (imageBack && !skipAutoLandscape.back) {
      imageBack = await ensureLandscapeBase64(imageBack);
    }
    updatePreviewVisibility();

    const payload = { action: 'scan', image: imageFront };
    if (imageBack) payload.imageBack = imageBack;

    const result = await gasFetch(payload);
    loading.classList.remove('show');

    if (result.status === 'success') {
      FIELDS.forEach(f => {
        document.getElementById(f.id).value = result.data[f.key] || '';
      });

      faceBox = result.faceBox || null;
      faceImage = faceBox ? await cropFaceFromFront(faceBox) : '';

      editForm.classList.add('show');
      btnSave.style.display = 'block';
      if (faceImage) {
        statusMsg.textContent = '顔写真を検出しました。登録時に連絡先へ反映します。';
        status.classList.add('show');
      }
    } else {
      alert('読み取りエラー: ' + (result.message || '不明'));
      showPostCaptureActions();
    }
  } catch (err) {
    loading.classList.remove('show');
    alert('通信エラー: ' + err.message);
    showPostCaptureActions();
  }
}

// ===== 登録（編集後のデータをSheetsに書き込み） =====
btnSave.addEventListener('click', async () => {
  const cardData = {};
  FIELDS.forEach(f => {
    cardData[f.key] = document.getElementById(f.id).value;
  });

  btnSave.style.display = 'none';
  loading.textContent = '登録中...画像をDrive・連絡先へ保存しています';
  loading.classList.add('show');

  try {
    if (!skipAutoLandscape.front) {
      imageFront = await ensureLandscapeBase64(imageFront);
    }
    if (imageBack && !skipAutoLandscape.back) {
      imageBack = await ensureLandscapeBase64(imageBack);
    }

    const payload = {
      action: 'save',
      data: cardData,
      image: imageFront
    };
    if (imageBack) payload.imageBack = imageBack;
    if (faceImage) payload.faceImage = faceImage;

    const result = await gasFetch(payload);
    loading.classList.remove('show');
    loading.textContent = '処理中...名刺を読み取っています';

    if (result.status === 'success') {
      editForm.classList.remove('show');
      const contactNote = result.data && result.data.contactStatus
        ? '（' + result.data.contactStatus + '）'
        : '';
      statusMsg.textContent = cardData.name + ' / ' + cardData.company + contactNote;
      status.classList.add('show');
      btnRetry.style.display = 'block';
      btnCaptureBack.style.display = 'none';
      btnScan.style.display = 'none';
    } else {
      alert('登録エラー: ' + (result.message || '不明'));
      btnSave.style.display = 'block';
    }
  } catch (err) {
    loading.classList.remove('show');
    loading.textContent = '処理中...名刺を読み取っています';
    editForm.classList.remove('show');
    statusMsg.textContent = '送信しました。シートを確認してください。';
    status.classList.add('show');
    btnRetry.style.display = 'block';
  }
});

// ===== 検索機能 =====
let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const query = searchInput.value.trim();
    if (query.length < 1) {
      searchResults.classList.remove('show');
      return;
    }

    try {
      const result = await gasFetch({ action: 'search', query: query });

      if (result.status === 'success' && result.data.length > 0) {
        searchResults.innerHTML = result.data.map(card => `
          <div class="search-card">
            <div class="search-card-name">${card.name || '（氏名なし）'}</div>
            <div class="search-card-company">${card.company || ''}${card.title ? ' / ' + card.title : ''}</div>
            <div class="search-card-detail">
              ${card.mobile1 ? '📱 ' + card.mobile1 + '<br>' : ''}
              ${card.phone ? '📞 ' + card.phone + '<br>' : ''}
              ${card.email1 ? '✉ ' + card.email1 + '<br>' : ''}
              ${card.address ? '📍 ' + card.address + '<br>' : ''}
              ${card.frontImageUrl ? '<a href="' + card.frontImageUrl + '" target="_blank" rel="noopener">名刺表</a> ' : ''}
              ${card.backImageUrl ? '<a href="' + card.backImageUrl + '" target="_blank" rel="noopener">名刺裏</a>' : ''}
            </div>
          </div>
        `).join('');
        searchResults.classList.add('show');
      } else {
        searchResults.innerHTML = '<div class="search-card"><div class="search-card-name">該当なし</div></div>';
        searchResults.classList.add('show');
      }
    } catch (err) {
      // 検索エラーは静かに無視
    }
  }, 500);
});

// ===== 起動 =====
showCameraFor('front');
startCamera();
