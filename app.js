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
const btnRotate = document.getElementById('btnRotate');
const btnCropSquare = document.getElementById('btnCropSquare');
const btnCropQuad = document.getElementById('btnCropQuad');
const cropTools = document.getElementById('cropTools');
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
  btnCapture.disabled = true;
  btnCapture.textContent = 'カメラ起動中...';
  captureLabel.textContent = 'カメラ許可が出たら「許可」を押してください';

  var safety = setTimeout(function () {
    if (btnCapture.disabled && String(btnCapture.textContent).indexOf('起動中') !== -1) {
      btnCapture.disabled = false;
      btnCapture.textContent = 'カメラを再試行';
      captureLabel.textContent = '起動が遅れています。再試行を押してください';
    }
  }, 20000);

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

    // play() が返らない端末があるので最大2秒で打ち切り
    captureLabel.textContent = 'カメラ映像を開始しています...';
    await Promise.race([
      video.play().catch(function () { return null; }),
      sleep(2000)
    ]);

    try {
      await waitForVideoReady(5000);
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
      '\\n\\n・HTTPSで開いているか\\n・カメラを「許可」したか\\n・他アプリがカメラ使用中でないか\\nを確認してください。');
  } finally {
    clearTimeout(safety);
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
  btnCaptureBack.style.display = 'none';
  btnScan.style.display = 'none';
  btnRotate.style.display = 'none';
  cropTools.classList.remove('show');
  btnRetry.style.display = imageFront ? 'block' : 'none';
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
    previewFront.src = 'data:image/jpeg;base64,' + imageFront;
    previewFront.style.display = 'block';
  } else {
    previewFront.removeAttribute('src');
    previewFront.style.display = 'none';
  }

  if (imageBack) {
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
  btnRotate.style.display = hasAny ? 'block' : 'none';
  cropTools.classList.toggle('show', hasAny);
}

function showPostCaptureActions() {
  video.style.display = 'none';
  btnCapture.style.display = 'none';
  captureHint.classList.remove('show');
  btnCaptureBack.style.display = imageBack ? 'none' : 'block';
  btnScan.style.display = 'block';
  btnRetry.style.display = 'block';
  updatePreviewVisibility();
}

// ===== 撮影 =====
btnCapture.addEventListener('click', async () => {
  const label = String(btnCapture.textContent || '');

  // 明示的に再試行のときだけ起動し直す（通常の撮影と混ぜない）
  if (label.indexOf('再試行') !== -1 || !video.srcObject) {
    await startCamera();
    return;
  }

  if (btnCapture.dataset.busy === '1') return;
  btnCapture.dataset.busy = '1';
  btnCapture.disabled = true;
  const prevLabel = label || '表面を撮影する';
  btnCapture.textContent = '撮影中...';
  captureLabel.textContent = '撮影しています...';

  try {
    // play() はハングすることがあるので待たない（最大1秒だけ試す）
    if (!video.videoWidth || !video.videoHeight) {
      await Promise.race([
        video.play().catch(function () { return null; }),
        sleep(1000)
      ]);
    }

    let base64 = await captureFrameFromVideo();

    // 名刺は横長が標準。縦撮りなら自動で横向きへ
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
    captureLabel.textContent = '撮影に失敗: ' + (err && err.message ? err.message : String(err));
    alert('撮影に失敗しました: ' + (err && err.message ? err.message : String(err)));
    btnCapture.style.display = 'block';
    btnCapture.textContent = prevLabel;
  } finally {
    btnCapture.disabled = false;
    btnCapture.dataset.busy = '0';
  }
});

// ===== 向きの手動修正（90°ずつ・直近に撮った面） =====
btnRotate.addEventListener('click', async () => {
  try {
    const side = (lastCapturedSide === 'back' && imageBack) ? 'back'
      : imageFront ? 'front'
      : imageBack ? 'back' : null;
    if (!side) return;

    if (side === 'back') {
      imageBack = await rotateBase64(imageBack, 90);
      skipAutoLandscape.back = true;
    } else {
      imageFront = await rotateBase64(imageFront, 90);
      skipAutoLandscape.front = true;
      faceBox = null;
      faceImage = '';
    }
    updatePreviewVisibility();
  } catch (err) {
    alert('回転に失敗しました: ' + err.message);
  }
});

// ===== 裏面撮影モードへ =====
btnCaptureBack.addEventListener('click', () => {
  // 表プレビューは隠してカメラ＋シャッターを前面に
  showCameraFor('back');
});

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
  btnRotate.style.display = 'none';
  cropTools.classList.remove('show');
  btnSave.style.display = 'none';
  editForm.classList.remove('show');
  status.classList.remove('show');
  showCameraFor('front');
}

btnRetry.addEventListener('click', resetCamera);
btnCancel.addEventListener('click', resetCamera);

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
btnScan.addEventListener('click', async () => {
  if (!imageFront) return;

  btnScan.style.display = 'none';
  btnCaptureBack.style.display = 'none';
  btnRetry.style.display = 'none';
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
});

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
