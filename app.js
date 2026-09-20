/* meishi-ocr frontend v20260920c */
const APP_VERSION = '20260920c';
const GAS_URL = (window.MEISHI_OCR && window.MEISHI_OCR.GAS_URL) || 'YOUR_GAS_WEBAPP_URL';
const API_TOKEN = (window.MEISHI_OCR && window.MEISHI_OCR.API_TOKEN) || 'YOUR_API_TOKEN';

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

const $ = (id) => document.getElementById(id);
const video = $('video');
const canvas = $('canvas');
const previewFront = $('previewFront');
const previewBack = $('previewBack');
const previewBackWrap = $('previewBackWrap');
const previewPair = $('previewPair');
const captureLabel = $('captureLabel');
const captureHint = $('captureHint');
const errorBanner = $('errorBanner');
const btnCapture = $('btnCapture');
const btnPickFile = $('btnPickFile');
const cameraCapture = $('cameraCapture');
const filePicker = $('filePicker');
const btnCaptureBack = $('btnCaptureBack');
const btnScan = $('btnScan');
const btnRetry = $('btnRetry');
const btnRotateLeft = $('btnRotateLeft');
const btnRotateRight = $('btnRotateRight');
const rotateTools = $('rotateTools');
const btnCropSquare = $('btnCropSquare');
const btnCropQuad = $('btnCropQuad');
const btnAutoCrop = $('btnAutoCrop');
const cropTools = $('cropTools');
const actionTools = $('actionTools');
const cropEditor = $('cropEditor');
const cropCanvas = $('cropCanvas');
const cropTitle = $('cropTitle');
const cropHelp = $('cropHelp');
const btnCropApply = $('btnCropApply');
const btnCropCancel = $('btnCropCancel');
const btnSave = $('btnSave');
const btnCancel = $('btnCancel');
const loading = $('loading');
const editForm = $('editForm');
const statusBox = $('status');
const statusTitle = $('statusTitle');
const statusMsg = $('statusMsg');
const searchInput = $('searchInput');
const searchResults = $('searchResults');
const tagList = $('tagList');
const newTagInput = $('newTagInput');
const btnAddTag = $('btnAddTag');
const editRegisteredDate = $('edit-registeredDate');

let captureSide = 'front';
let lastCapturedSide = 'front';
let imageFront = '';
let imageBack = '';
let faceBox = null;
let faceImage = '';
let skipAutoLandscape = { front: false, back: false };
let captureBusy = false;
let cameraStarting = false;
let rotateBusy = false;
let cropBusy = false;
let scanBusy = false;
let saveBusy = false;
let lastShotAt = 0;
let lastRotateAt = 0;
let tagCatalog = [];
let selectedTags = [];

const cropState = {
  mode: null,
  side: null,
  img: null,
  square: { x: 0, y: 0, size: 100 },
  points: [],
  drag: null,
  displayScale: 1
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

function errText(err) {
  if (!err) return '不明なエラー';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}

function showError(msg) {
  const text = errText(msg);
  if (errorBanner) {
    errorBanner.textContent = text;
    errorBanner.classList.add('show');
  }
  captureLabel.textContent = text;
  console.error(msg);
}

function clearError() {
  if (errorBanner) {
    errorBanner.textContent = '';
    errorBanner.classList.remove('show');
  }
}

function setLoading(on, text) {
  if (text) loading.textContent = text;
  loading.classList.toggle('show', !!on);
}

function assertConfig() {
  if (!GAS_URL || GAS_URL === 'YOUR_GAS_WEBAPP_URL') {
    throw new Error('secrets.js に GAS_URL を設定してください');
  }
  if (!API_TOKEN || API_TOKEN === 'YOUR_API_TOKEN') {
    throw new Error('secrets.js に API_TOKEN を設定してください');
  }
}

async function gasFetch(payload) {
  assertConfig();
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 90000) : null;
  let response;
  try {
    response = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify(Object.assign({ token: API_TOKEN }, payload)),
      redirect: 'follow',
      signal: controller ? controller.signal : undefined
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('サーバー応答がタイムアウトしました（90秒）');
    }
    throw new Error('通信できませんでした: ' + errText(err) + '\nGASのURL・ネット接続・デプロイを確認してください');
  } finally {
    if (timer) clearTimeout(timer);
  }

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    throw new Error('GAS応答がJSONではありません: ' + String(text).substring(0, 180));
  }
  if (result && result.status === 'error') {
    throw new Error(result.message || 'サーバーエラー');
  }
  return result;
}

function bindTap(el, handler) {
  if (!el) return;
  let last = 0;
  const run = function (ev) {
    if (ev) {
      try { ev.preventDefault(); } catch (e) { /* ignore */ }
      try { ev.stopPropagation(); } catch (e) { /* ignore */ }
    }
    const now = Date.now();
    if (now - last < 500) return;
    last = now;
    Promise.resolve(handler(ev)).catch(function (err) { showError(err); });
  };
  el.addEventListener('click', run);
  el.addEventListener('pointerup', run);
}

function onClick(el, handler) {
  bindTap(el, handler);
}

function setToolsVisible(on) {
  rotateTools.classList.toggle('show', !!on);
  cropTools.classList.toggle('show', !!on);
  actionTools.classList.toggle('show', !!on);
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
    previewBackWrap.hidden = false;
  } else {
    previewBack.removeAttribute('src');
    previewBack.style.display = 'none';
    previewBackWrap.hidden = true;
  }

  const hasAny = !!(imageFront || imageBack);
  previewPair.classList.toggle('show', hasAny);
}

function showCameraFor(side) {
  captureSide = side;
  clearError();
  statusBox.classList.remove('show');
  editForm.classList.remove('show');
  btnSave.classList.remove('show');
  setLoading(false);
  setToolsVisible(false);
  previewPair.classList.remove('show');
  video.style.display = 'block';
  btnCapture.style.display = 'block';
  btnPickFile.style.display = 'block';
  btnCapture.disabled = false;
  btnCapture.textContent = side === 'back' ? '裏面を撮影する' : '表面を撮影する';
  captureLabel.textContent = side === 'back' ? '裏面を撮影' : '表面を撮影';
  captureHint.classList.toggle('show', side === 'back' && !!imageFront);
}

function showPostCaptureActions() {
  video.style.display = 'none';
  btnCapture.style.display = 'none';
  btnPickFile.style.display = 'none';
  captureHint.classList.remove('show');
  btnCaptureBack.classList.toggle('is-hidden', !!imageBack);
  btnCaptureBack.disabled = false;
  btnScan.disabled = false;
  btnRetry.disabled = false;
  setToolsVisible(true);
  updatePreviewVisibility();
}

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

function setActiveCropBase64(base64, side) {
  const use = side || cropState.side || getActiveCropSide();
  if (use === 'back') {
    imageBack = base64;
    skipAutoLandscape.back = true;
  } else {
    imageFront = base64;
    skipAutoLandscape.front = true;
    faceBox = null;
    faceImage = '';
  }
}

function loadImageFromBase64(base64) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = 'data:image/jpeg;base64,' + base64;
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = dataUrl;
  });
}

function canvasToJpegBase64(sourceCanvas, quality) {
  const dataUrl = sourceCanvas.toDataURL('image/jpeg', quality || 0.9);
  if (!dataUrl || dataUrl === 'data:,') throw new Error('JPEG化に失敗しました');
  return dataUrl.split(',')[1];
}

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

async function ensureLandscapeBase64(base64) {
  const img = await loadImageFromBase64(base64);
  if (img.width >= img.height) return base64;
  return rotateBase64(base64, 90);
}

async function resizeBase64(base64, maxDim, quality) {
  const img = await loadImageFromBase64(base64);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale >= 0.98) return base64;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(img.width * scale));
  out.height = Math.max(1, Math.round(img.height * scale));
  out.getContext('2d').drawImage(img, 0, 0, out.width, out.height);
  return canvasToJpegBase64(out, quality || 0.88);
}

function withTimeout(promise, ms, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function stopCameraTracks() {
  const stream = video.srcObject;
  if (stream && stream.getTracks) {
    stream.getTracks().forEach((track) => {
      try { track.stop(); } catch (e) { /* ignore */ }
    });
  }
  video.srcObject = null;
}

function waitForVideoReady(timeoutMs) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let timer = null;
    let settled = false;

    function cleanup() {
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('playing', onReady);
      video.removeEventListener('canplay', onReady);
      if (timer) clearInterval(timer);
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
    timer = setInterval(() => {
      if (done()) return;
      if (Date.now() - started > timeoutMs) {
        fail(new Error('カメラ映像の準備がタイムアウトしました'));
      }
    }, 100);
  });
}

async function startCamera() {
  if (cameraStarting) return;
  cameraStarting = true;
  btnCapture.disabled = false;
  btnCapture.textContent = 'カメラ起動中...';
  captureLabel.textContent = 'カメラ許可が出たら「許可」を押してください';

  const safety = setTimeout(() => {
    btnCapture.disabled = false;
    if (!video.srcObject) {
      btnCapture.textContent = 'カメラを再試行';
      captureLabel.textContent = '起動が遅れています。再試行か「アルバムから選ぶ」を使ってください';
    }
  }, 8000);

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('このブラウザはカメラ非対応です。HTTPSで開くか、アルバムから選んでください');
    }
    stopCameraTracks();
    let stream = null;
    let lastErr = null;
    const attempts = [
      { video: { facingMode: { ideal: 'environment' } }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false }
    ];
    for (let i = 0; i < attempts.length; i++) {
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
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    btnCapture.disabled = false;
    btnCapture.textContent = captureSide === 'back' ? '裏面を撮影する' : '表面を撮影する';
    captureLabel.textContent = 'カメラ映像を開始しています';

    await Promise.race([
      video.play().catch(() => null),
      sleep(1500)
    ]);
    try {
      await waitForVideoReady(4000);
      captureLabel.textContent = captureSide === 'back' ? '裏面を撮影' : '表面を撮影（準備完了）';
    } catch (e) {
      captureLabel.textContent = '映像準備中でも撮影できます';
    }
  } catch (err) {
    btnCapture.textContent = 'カメラを再試行';
    showError('カメラを起動できませんでした: ' + errText(err) +
      '\nアルバムから選ぶこともできます。HTTPS・カメラ許可・他アプリの使用を確認してください。');
  } finally {
    clearTimeout(safety);
    btnCapture.disabled = false;
    cameraStarting = false;
  }
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
  try {
    const stream = video.srcObject;
    const track = stream && stream.getVideoTracks && stream.getVideoTracks()[0];
    if (track && typeof ImageCapture !== 'undefined') {
      const bitmap = await withTimeout(
        new ImageCapture(track).grabFrame(),
        2000,
        'ImageCapture timeout'
      );
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      if (bitmap.close) bitmap.close();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      if (dataUrl && dataUrl !== 'data:,') return dataUrl.split(',')[1];
    }
  } catch (e) {
    console.warn('ImageCapture fallback', e);
  }

  let vw = video.videoWidth || 0;
  let vh = video.videoHeight || 0;
  if (!vw || !vh) {
    const ts = getVideoTrackSize();
    if (ts) { vw = ts.w; vh = ts.h; }
  }
  if (!vw || !vh) {
    throw new Error('カメラ映像がまだ準備できていません');
  }
  canvas.width = vw;
  canvas.height = vh;
  canvas.getContext('2d').drawImage(video, 0, 0, vw, vh);
  return canvasToJpegBase64(canvas, 0.9);
}

async function applyCapturedImage(base64) {
  let next = await resizeBase64(base64, 2000, 0.9);
  const sideKey = captureSide === 'back' ? 'back' : 'front';
  if (!skipAutoLandscape[sideKey]) {
    next = await ensureLandscapeBase64(next);
  }
  skipAutoLandscape[sideKey] = false;

  if (captureSide === 'back') {
    imageBack = next;
    lastCapturedSide = 'back';
  } else {
    imageFront = next;
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
}

function openNativeCamera() {
  if (cameraCapture) {
    cameraCapture.click();
    return true;
  }
  if (filePicker) {
    filePicker.click();
    return true;
  }
  return false;
}

async function takePhoto(ev) {
  if (ev) {
    try { ev.preventDefault(); } catch (e) { /* ignore */ }
  }
  captureLabel.textContent = 'シャッター反応あり...';
  clearError();

  if (captureBusy || cameraStarting) {
    captureLabel.textContent = '処理中です。少し待ってからもう一度押してください';
    return;
  }
  if (Date.now() - lastShotAt < 700) return;
  lastShotAt = Date.now();
  captureBusy = true;
  btnCapture.textContent = '撮影中...';

  try {
    if (!video.srcObject) {
      await startCamera();
    }

    const ready = video.srcObject && (video.videoWidth > 0 || getVideoTrackSize());
    if (!ready) {
      captureLabel.textContent = 'ライブ映像がないので端末カメラを開きます';
      btnCapture.textContent = captureSide === 'back' ? '裏面を撮影する' : '表面を撮影する';
      captureBusy = false;
      if (!openNativeCamera()) {
        showError('カメラを使えません。下の「アルバムから選ぶ」を使ってください');
      }
      return;
    }

    if (!video.videoWidth || !video.videoHeight) {
      await Promise.race([video.play().catch(() => null), sleep(800)]);
    }
    captureLabel.textContent = '撮影しています...';
    const base64 = await captureFrameFromVideo();
    await applyCapturedImage(base64);
  } catch (err) {
    showError('撮影に失敗しました: ' + errText(err));
    btnCapture.style.display = 'block';
    btnCapture.textContent = captureSide === 'back' ? '裏面を撮影する' : '表面を撮影する';
    captureBusy = false;
    openNativeCamera();
  } finally {
    captureBusy = false;
    btnCapture.disabled = false;
  }
}
window.takeMeishiPhoto = takePhoto;

async function handlePickedFile(file) {
  if (!file) return;
  clearError();
  captureLabel.textContent = '画像を読み込み中...';
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('ファイルを読めませんでした'));
    reader.readAsDataURL(file);
  });
  const img = await loadImageFromDataUrl(dataUrl);
  const out = document.createElement('canvas');
  out.width = img.width;
  out.height = img.height;
  out.getContext('2d').drawImage(img, 0, 0);
  const base64 = canvasToJpegBase64(out, 0.9);
  await applyCapturedImage(base64);
}

async function rotateMeishi(degrees) {
  if (rotateBusy) return;
  if (Date.now() - lastRotateAt < 300) return;
  lastRotateAt = Date.now();
  rotateBusy = true;
  clearError();
  captureLabel.textContent = '回転しています...';
  try {
    const side = getActiveCropSide();
    if (!side) throw new Error('先に撮影してください');
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
    lastCapturedSide = side;
    updatePreviewVisibility();
    setToolsVisible(true);
    captureLabel.textContent = (side === 'back' ? '裏面' : '表面') + 'を' + deg + '°回転しました';
  } catch (err) {
    showError('回転に失敗しました: ' + errText(err));
  } finally {
    rotateBusy = false;
  }
}

async function startBackCapture() {
  if (!imageFront) {
    showError('先に表面を撮影してください');
    return;
  }
  showCameraFor('back');
  if (!video.srcObject) await startCamera();
}

function resetCamera() {
  imageFront = '';
  imageBack = '';
  faceBox = null;
  faceImage = '';
  skipAutoLandscape = { front: false, back: false };
  previewFront.removeAttribute('src');
  previewBack.removeAttribute('src');
  previewFront.style.display = 'none';
  previewBack.style.display = 'none';
  previewBackWrap.hidden = true;
  previewPair.classList.remove('show');
  captureHint.classList.remove('show');
  btnSave.classList.remove('show');
  editForm.classList.remove('show');
  statusBox.classList.remove('show');
  setLoading(false);
  clearError();
  closeCropEditor();
  showCameraFor('front');
  if (!video.srcObject) startCamera();
}

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
      const gx = -gray[i - w - 1] + gray[i - w + 1] - 2 * gray[i - 1] + 2 * gray[i + 1] - gray[i + w - 1] + gray[i + w + 1];
      const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      out[i] = Math.abs(gx) + Math.abs(gy);
    }
  }
  return out;
}

function convexHull(points) {
  if (points.length <= 3) return points.slice();
  points = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
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
  const tagged = pts.map((p) => ({ p: p, s: p.x + p.y, d: p.x - p.y }));
  const tl = tagged.reduce((a, b) => (a.s < b.s ? a : b)).p;
  const br = tagged.reduce((a, b) => (a.s > b.s ? a : b)).p;
  const tr = tagged.reduce((a, b) => (a.d > b.d ? a : b)).p;
  const bl = tagged.reduce((a, b) => (a.d < b.d ? a : b)).p;
  return [tl, tr, br, bl];
}

function insetQuad(pts, ratio) {
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
  return pts.map((p) => ({
    x: p.x + (cx - p.x) * ratio,
    y: p.y + (cy - p.y) * ratio
  }));
}

function fallbackRect(w, h, scale, marginRatio) {
  const m = Math.round(Math.min(w, h) * marginRatio);
  return orderQuadPoints([
    { x: m / scale, y: m / scale },
    { x: (w - m) / scale, y: m / scale },
    { x: (w - m) / scale, y: (h - m) / scale },
    { x: m / scale, y: (h - m) / scale }
  ]);
}

function detectCardCorners(img) {
  const maxW = 360;
  const scale = Math.min(1, maxW / img.width);
  const w = Math.max(40, Math.round(img.width * scale));
  const h = Math.max(40, Math.round(img.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const gray = toGray(imageData.data, w, h);
  const edges = sobelEdges(gray, w, h);

  const border = [];
  for (let x = 0; x < w; x++) {
    border.push(gray[x], gray[(h - 1) * w + x]);
  }
  for (let y = 0; y < h; y++) {
    border.push(gray[y * w], gray[y * w + w - 1]);
  }
  border.sort((a, b) => a - b);
  const bg = border[border.length >> 1];

  let maxE = 0;
  for (let i = 0; i < edges.length; i++) if (edges[i] > maxE) maxE = edges[i];
  const eThr = Math.max(28, maxE * 0.2);
  const dThr = 26;

  const pts = [];
  for (let y = 2; y < h - 2; y += 2) {
    for (let x = 2; x < w - 2; x += 2) {
      const i = y * w + x;
      if (Math.abs(gray[i] - bg) >= dThr || edges[i] >= eThr) pts.push({ x: x, y: y });
    }
  }
  if (pts.length < 24) return fallbackRect(w, h, scale, 0.05);

  const stride = Math.max(1, Math.floor(pts.length / 450));
  const sampled = [];
  for (let i = 0; i < pts.length; i += stride) sampled.push(pts[i]);
  const hull = convexHull(sampled);
  if (hull.length < 4) return fallbackRect(w, h, scale, 0.05);

  let best = null;
  let bestArea = 0;
  const n = hull.length;
  const lim = Math.min(n, 28);
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
  if (!best || bestArea < w * h * 0.12) return fallbackRect(w, h, scale, 0.04);

  const ordered = orderQuadPoints(best);
  const refined = insetQuad(ordered, 0.03).map((p) => ({
    x: p.x / scale,
    y: p.y / scale
  }));
  return orderQuadPoints(refined);
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
      throw new Error('4点が一直線です。角の位置をずらしてください');
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
  return M.map((row) => row[n]);
}

function getPerspectiveTransform(src, dst) {
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

function invertHomography(h) {
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
  if (Math.abs(det) < 1e-12) throw new Error('変形が不正です。四隅を名刺の角に合わせてください');
  return [A / det, D / det, G / det, B / det, E / det, H / det, C / det, F / det, I / det];
}

function applyHomography(h, x, y) {
  const w = h[6] * x + h[7] * y + h[8];
  return {
    x: (h[0] * x + h[1] * y + h[2]) / w,
    y: (h[3] * x + h[4] * y + h[5]) / w
  };
}

function sampleBilinear(data, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return [0, 0, 0, 255];
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
  for (let c = 0; c < 3; c++) {
    out.push(
      data[i00 + c] * (1 - fx) * (1 - fy) +
      data[i10 + c] * fx * (1 - fy) +
      data[i01 + c] * (1 - fx) * fy +
      data[i11 + c] * fx * fy
    );
  }
  out.push(255);
  return out;
}

async function warpQuadToRect(base64, points) {
  await nextFrame();
  const img = await loadImageFromBase64(base64);
  const pts = orderQuadPoints(points);
  let srcW = img.width;
  let srcH = img.height;
  let srcPts = pts;
  const maxSrc = 1200;
  const srcScale = Math.min(1, maxSrc / Math.max(srcW, srcH));
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = Math.max(1, Math.round(srcW * srcScale));
  srcCanvas.height = Math.max(1, Math.round(srcH * srcScale));
  srcCanvas.getContext('2d').drawImage(img, 0, 0, srcCanvas.width, srcCanvas.height);
  const srcData = srcCanvas.getContext('2d').getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  if (srcScale !== 1) {
    srcPts = pts.map((p) => ({ x: p.x * srcScale, y: p.y * srcScale }));
    srcW = srcCanvas.width;
    srcH = srcCanvas.height;
  }

  const widthAvg = (
    Math.hypot(srcPts[1].x - srcPts[0].x, srcPts[1].y - srcPts[0].y) +
    Math.hypot(srcPts[2].x - srcPts[3].x, srcPts[2].y - srcPts[3].y)
  ) / 2;
  const heightAvg = (
    Math.hypot(srcPts[3].x - srcPts[0].x, srcPts[3].y - srcPts[0].y) +
    Math.hypot(srcPts[2].x - srcPts[1].x, srcPts[2].y - srcPts[1].y)
  ) / 2;
  let outW = Math.max(280, Math.round(widthAvg));
  let outH = Math.max(180, Math.round(heightAvg));
  const maxOut = 1000;
  const outScale = Math.min(1, maxOut / Math.max(outW, outH));
  outW = Math.max(200, Math.round(outW * outScale));
  outH = Math.max(140, Math.round(outH * outScale));

  const dst = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 }
  ];
  const hFwd = getPerspectiveTransform(srcPts, dst);
  const hInv = invertHomography(hFwd);
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const octx = outCanvas.getContext('2d');
  const outImg = octx.createImageData(outW, outH);
  const out = outImg.data;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const src = applyHomography(hInv, x, y);
      const rgba = sampleBilinear(srcData.data, srcCanvas.width, srcCanvas.height, src.x, src.y);
      const i = (y * outW + x) * 4;
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
  const size = Math.max(40, Math.floor(square.size));
  const x = Math.max(0, Math.min(Math.floor(square.x), img.width - size));
  const y = Math.max(0, Math.min(Math.floor(square.y), img.height - size));
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  out.getContext('2d').drawImage(img, x, y, size, size, 0, 0, size, size);
  return canvasToJpegBase64(out, 0.92);
}

async function autoCropMeishi() {
  if (cropBusy) return;
  const side = getActiveCropSide();
  const base64 = getActiveCropBase64();
  if (!side || !base64) {
    showError('先に名刺を撮影してください');
    return;
  }
  cropBusy = true;
  clearError();
  captureLabel.textContent = '四隅を自動検出中...';
  setLoading(true, '四隅を検出して正面の長方形に補正しています');
  await nextFrame();
  try {
    const img = await loadImageFromBase64(base64);
    const corners = detectCardCorners(img);
    const next = await warpQuadToRect(base64, corners);
    setActiveCropBase64(next, side);
    lastCapturedSide = side;
    updatePreviewVisibility();
    setToolsVisible(true);
    captureLabel.textContent = '四隅を合わせて正面の長方形に補正しました';
  } catch (err) {
    showError('自動切り取りに失敗しました: ' + errText(err) + '\n「4点で切る」で角を合わせてください');
  } finally {
    cropBusy = false;
    setLoading(false);
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

function drawHandle(ctx, x, y) {
  ctx.beginPath();
  ctx.fillStyle = '#e94560';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
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

  ctx.strokeStyle = '#e94560';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (cropState.mode === 'square') {
    const { x, y, size } = cropState.square;
    ctx.strokeRect(x * s, y * s, size * s, size * s);
    [
      { x: x, y: y },
      { x: x + size, y: y },
      { x: x + size, y: y + size },
      { x: x, y: y + size }
    ].forEach((h) => drawHandle(ctx, h.x * s, h.y * s));
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

function clampSquare() {
  const img = cropState.img;
  let { x, y, size } = cropState.square;
  size = Math.max(40, Math.min(size, img.width, img.height));
  x = Math.max(0, Math.min(x, img.width - size));
  y = Math.max(0, Math.min(y, img.height - size));
  cropState.square = { x, y, size };
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
    if (Math.hypot(imgX - p.x, imgY - p.y) <= thr) return { type: 'point', index: i };
  }
  return null;
}

async function openCropEditor(mode) {
  const side = getActiveCropSide();
  const base64 = getActiveCropBase64();
  if (!side || !base64) {
    showError('先に名刺を撮影してください');
    return;
  }
  clearError();
  const img = await loadImageFromBase64(base64);
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
  try {
    cropState.points = detectCardCorners(img);
  } catch (e) {
    const insetX = img.width * 0.08;
    const insetY = img.height * 0.08;
    cropState.points = [
      { x: insetX, y: insetY },
      { x: img.width - insetX, y: insetY },
      { x: img.width - insetX, y: img.height - insetY },
      { x: insetX, y: img.height - insetY }
    ];
  }
  if (mode === 'square') {
    cropTitle.textContent = '正方形で切り取り';
    cropHelp.textContent = '枠をドラッグで移動、角をドラッグでサイズ変更します。';
  } else {
    cropTitle.textContent = '4点で切り取り';
    cropHelp.textContent = '名刺の四隅を合わせてください。正面の長方形に補正します。';
  }
  cropEditor.classList.add('show');
  cropEditor.setAttribute('aria-hidden', 'false');
  drawCropEditor();
}

function closeCropEditor() {
  cropEditor.classList.remove('show');
  cropEditor.setAttribute('aria-hidden', 'true');
  cropState.mode = null;
  cropState.img = null;
  cropState.drag = null;
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
    origPoints: cropState.points.map((p) => ({ x: p.x, y: p.y }))
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
      const fixed = [
        { x: o.x + o.size, y: o.y + o.size },
        { x: o.x, y: o.y + o.size },
        { x: o.x, y: o.y },
        { x: o.x + o.size, y: o.y }
      ][idx];
      const size = Math.max(40, Math.max(Math.abs(pt.x - fixed.x), Math.abs(pt.y - fixed.y)));
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
  if (!cropState.drag) return;
  if (e) e.preventDefault();
  cropState.drag = null;
}

async function applyCrop() {
  if (cropBusy) return;
  if (!cropState.img || !cropState.mode) return;
  cropBusy = true;
  btnCropApply.disabled = true;
  btnCropApply.textContent = '処理中...';
  try {
    const base64 = cropState.side === 'back' ? imageBack : imageFront;
    let next;
    if (cropState.mode === 'square') {
      clampSquare();
      next = await cropSquareRegion(base64, cropState.square);
    } else {
      next = await warpQuadToRect(base64, cropState.points);
    }
    setActiveCropBase64(next, cropState.side);
    lastCapturedSide = cropState.side;
    closeCropEditor();
    updatePreviewVisibility();
    setToolsVisible(true);
    captureLabel.textContent = '切り取りを反映しました';
  } catch (err) {
    showError('切り取りに失敗しました: ' + errText(err));
  } finally {
    cropBusy = false;
    btnCropApply.disabled = false;
    btnCropApply.textContent = 'この範囲で切り取る';
  }
}

function todayDateStr() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

function isTagSelected(name) {
  return selectedTags.indexOf(name) !== -1;
}

function toggleTag(name) {
  if (!name) return;
  const i = selectedTags.indexOf(name);
  if (i >= 0) selectedTags.splice(i, 1);
  else selectedTags.push(name);
  renderTagList();
}

function addNewTag() {
  const name = String((newTagInput && newTagInput.value) || '').trim();
  if (!name) {
    showError('追加するタグ名を入力してください');
    return;
  }
  const exists = tagCatalog.some((t) => t.name === name);
  if (!exists) {
    tagCatalog.unshift({ name: name, resourceName: '', memberCount: -1 });
  }
  if (!isTagSelected(name)) selectedTags.push(name);
  if (newTagInput) newTagInput.value = '';
  clearError();
  renderTagList();
}

function renderTagList() {
  if (!tagList) return;
  const ordered = tagCatalog.slice().sort((a, b) => {
    const aNew = a.memberCount < 0 ? 1 : 0;
    const bNew = b.memberCount < 0 ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    return String(a.name).localeCompare(String(b.name), 'ja');
  });
  selectedTags.forEach((name) => {
    if (!ordered.some((t) => t.name === name)) {
      ordered.unshift({ name: name, memberCount: -1 });
    }
  });
  if (!ordered.length) {
    tagList.innerHTML = '<div class="tag-hint">タグはまだありません。下で新規追加できます。</div>';
    return;
  }
  tagList.innerHTML = ordered.map((t) => {
    const selected = isTagSelected(t.name) ? ' selected' : '';
    const count = t.memberCount >= 0 ? '<span class="tag-count">' + t.memberCount + '</span>' : '';
    return '<button type="button" class="tag-chip' + selected + '" data-name="' + escapeHtml(t.name) + '">' +
      escapeHtml(t.name) + count + '</button>';
  }).join('');
}

async function loadContactTags() {
  try {
    const result = await gasFetch({ action: 'tags' });
    const rows = (result && result.data) || [];
    const extras = tagCatalog.filter((t) => t.memberCount < 0 && !rows.some((r) => r.name === t.name));
    tagCatalog = rows.concat(extras);
    renderTagList();
  } catch (err) {
    if (tagList && !tagCatalog.length) {
      tagList.innerHTML = '<div class="tag-hint">既存タグを取得できませんでした。新規追加はできます。<br>' +
        escapeHtml(errText(err)) + '</div>';
    }
  }
}

function cropFaceFromFront(box) {
  if (!box || !imageFront) return Promise.resolve('');
  return loadImageFromBase64(imageFront).then((img) => {
    const padX = Math.round((box.right - box.left) * 0.15);
    const padY = Math.round((box.bottom - box.top) * 0.15);
    const left = Math.max(0, box.left - padX);
    const top = Math.max(0, box.top - padY);
    const right = Math.min(img.width, box.right + padX);
    const bottom = Math.min(img.height, box.bottom + padY);
    const w = Math.max(1, right - left);
    const h = Math.max(1, bottom - top);
    const size = Math.max(w, h);
    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = size;
    faceCanvas.height = size;
    const fctx = faceCanvas.getContext('2d');
    fctx.fillStyle = '#111';
    fctx.fillRect(0, 0, size, size);
    fctx.drawImage(img, left, top, w, h, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
    return canvasToJpegBase64(faceCanvas, 0.92);
  }).catch(() => '');
}

async function startMeishiScan() {
  if (scanBusy) return;
  if (!imageFront) {
    showError('先に表面を撮影してください');
    return;
  }
  scanBusy = true;
  clearError();
  setToolsVisible(false);
  btnSave.classList.remove('show');
  editForm.classList.remove('show');
  setLoading(true, imageBack ? '処理中...表・裏を読み取っています' : '処理中...名刺を読み取っています');
  try {
    if (!skipAutoLandscape.front) imageFront = await ensureLandscapeBase64(imageFront);
    if (imageBack && !skipAutoLandscape.back) imageBack = await ensureLandscapeBase64(imageBack);
    const sendFront = await resizeBase64(imageFront, 1600, 0.85);
    const sendBack = imageBack ? await resizeBase64(imageBack, 1600, 0.85) : '';
    updatePreviewVisibility();
    const payload = { action: 'scan', image: sendFront };
    if (sendBack) payload.imageBack = sendBack;
    const result = await gasFetch(payload);
    if (!result || result.status !== 'success' || !result.data) {
      throw new Error((result && result.message) || '読み取りに失敗しました');
    }
    FIELDS.forEach((f) => {
      const el = $(f.id);
      if (el) el.value = result.data[f.key] || '';
    });
    faceBox = result.faceBox || null;
    faceImage = faceBox ? await cropFaceFromFront(faceBox) : '';
    selectedTags = [];
    if (editRegisteredDate) editRegisteredDate.value = todayDateStr();
    editForm.classList.add('show');
    btnSave.classList.add('show');
    captureLabel.textContent = '内容を確認して登録してください';
    renderTagList();
    loadContactTags();
    if (faceImage) {
      statusTitle.textContent = '顔を検出';
      statusMsg.textContent = '顔写真を検出しました。登録時に連絡先へ反映します。';
      statusBox.classList.add('show');
    } else {
      statusBox.classList.remove('show');
    }
  } catch (err) {
    showError('読み取りエラー: ' + errText(err));
    showPostCaptureActions();
  } finally {
    scanBusy = false;
    setLoading(false, '処理中...名刺を読み取っています');
  }
}

async function saveCard() {
  if (saveBusy) return;
  const cardData = {};
  FIELDS.forEach((f) => {
    cardData[f.key] = ($(f.id) && $(f.id).value) || '';
  });
  if (!cardData.name && !cardData.company) {
    showError('氏名か会社名を入力してから登録してください');
    return;
  }
  cardData.tags = selectedTags.slice();
  cardData.registeredDate = (editRegisteredDate && editRegisteredDate.value) || todayDateStr();
  saveBusy = true;
  clearError();
  btnSave.classList.remove('show');
  setLoading(true, '登録中...Drive・Sheets・連絡先へ保存しています');
  try {
    if (!skipAutoLandscape.front) imageFront = await ensureLandscapeBase64(imageFront);
    if (imageBack && !skipAutoLandscape.back) imageBack = await ensureLandscapeBase64(imageBack);
    const sendFront = imageFront ? await resizeBase64(imageFront, 1600, 0.85) : '';
    const sendBack = imageBack ? await resizeBase64(imageBack, 1600, 0.85) : '';
    const payload = { action: 'save', data: cardData, image: sendFront };
    if (sendBack) payload.imageBack = sendBack;
    if (faceImage) payload.faceImage = faceImage;
    const result = await gasFetch(payload);
    if (!result || result.status !== 'success') {
      throw new Error((result && result.message) || '登録に失敗しました');
    }
    editForm.classList.remove('show');
    const contactNote = result.data && result.data.contactStatus
      ? '（' + result.data.contactStatus + '）'
      : '';
    statusTitle.textContent = '登録完了';
    statusMsg.textContent = (cardData.name || '') + ' / ' + (cardData.company || '') + contactNote;
    statusBox.classList.add('show');
    captureLabel.textContent = '登録しました';
    btnCaptureBack.classList.add('is-hidden');
    actionTools.classList.add('show');
    rotateTools.classList.remove('show');
    cropTools.classList.remove('show');
  } catch (err) {
    showError('登録エラー: ' + errText(err));
    btnSave.classList.add('show');
    editForm.classList.add('show');
  } finally {
    saveBusy = false;
    setLoading(false, '処理中...名刺を読み取っています');
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let searchTimer = null;
async function runSearch() {
  const query = (searchInput.value || '').trim();
  if (query.length < 1) {
    searchResults.classList.remove('show');
    searchResults.innerHTML = '';
    return;
  }
  try {
    const result = await gasFetch({ action: 'search', query: query });
    const rows = (result && result.data) || [];
    if (!rows.length) {
      searchResults.innerHTML = '<div class="search-card"><div class="search-card-name">該当なし</div></div>';
      searchResults.classList.add('show');
      return;
    }
    searchResults.innerHTML = rows.map((card) => `
      <div class="search-card">
        <div class="search-card-name">${escapeHtml(card.name || '（氏名なし）')}</div>
        <div class="search-card-company">${escapeHtml(card.company || '')}${card.title ? ' / ' + escapeHtml(card.title) : ''}</div>
        <div class="search-card-detail">
          ${card.mobile1 ? '📱 ' + escapeHtml(card.mobile1) + '<br>' : ''}
          ${card.phone ? '📞 ' + escapeHtml(card.phone) + '<br>' : ''}
          ${card.email1 ? '✉ ' + escapeHtml(card.email1) + '<br>' : ''}
          ${card.address ? '📍 ' + escapeHtml(card.address) + '<br>' : ''}
          ${card.registeredDate ? '📅 ' + escapeHtml(card.registeredDate) + '<br>' : ''}
          ${card.tags ? '🏷 ' + escapeHtml(card.tags) + '<br>' : ''}
          ${card.frontImageUrl ? '<a href="' + escapeHtml(card.frontImageUrl) + '" target="_blank" rel="noopener">名刺表</a> ' : ''}
          ${card.backImageUrl ? '<a href="' + escapeHtml(card.backImageUrl) + '" target="_blank" rel="noopener">名刺裏</a>' : ''}
        </div>
      </div>
    `).join('');
    searchResults.classList.add('show');
  } catch (err) {
    searchResults.innerHTML = '<div class="search-card"><div class="search-card-name">検索エラー</div><div class="search-card-detail">' +
      escapeHtml(errText(err)) + '</div></div>';
    searchResults.classList.add('show');
  }
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    const pane = $('tab-' + tab.dataset.tab);
    if (pane) pane.classList.add('active');
  });
});

onClick(btnCapture, takePhoto);
onClick(btnPickFile, () => filePicker.click());
async function onFileChosen(input) {
  try {
    const file = input.files && input.files[0];
    input.value = '';
    await handlePickedFile(file);
  } catch (err) {
    showError('画像の取り込みに失敗しました: ' + errText(err));
  }
}
filePicker.addEventListener('change', () => onFileChosen(filePicker));
if (cameraCapture) {
  cameraCapture.addEventListener('change', () => onFileChosen(cameraCapture));
}
onClick(btnRotateLeft, () => rotateMeishi(-90));
onClick(btnRotateRight, () => rotateMeishi(90));
onClick(btnAutoCrop, autoCropMeishi);
onClick(btnCropSquare, () => openCropEditor('square'));
onClick(btnCropQuad, () => openCropEditor('quad'));
onClick(btnCaptureBack, startBackCapture);
onClick(btnScan, startMeishiScan);
onClick(btnRetry, resetCamera);
onClick(btnCancel, resetCamera);
onClick(btnSave, saveCard);
onClick(btnCropCancel, closeCropEditor);
onClick(btnCropApply, applyCrop);
onClick(btnAddTag, addNewTag);
if (tagList) {
  tagList.addEventListener('click', (ev) => {
    const chip = ev.target.closest ? ev.target.closest('.tag-chip') : null;
    if (!chip) return;
    ev.preventDefault();
    toggleTag(chip.getAttribute('data-name'));
  });
}
if (newTagInput) {
  newTagInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      addNewTag();
    }
  });
}

cropCanvas.addEventListener('pointerdown', onCropPointerDown);
cropCanvas.addEventListener('mousedown', onCropPointerDown);
cropCanvas.addEventListener('touchstart', onCropPointerDown, { passive: false });
window.addEventListener('pointermove', onCropPointerMove, { passive: false });
window.addEventListener('mousemove', onCropPointerMove);
window.addEventListener('pointerup', onCropPointerUp);
window.addEventListener('mouseup', onCropPointerUp);

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 500);
});

showCameraFor('front');
startCamera();
loadContactTags();
if (!window.MEISHI_OCR) {
  showError('secrets.js が読み込めません。GitHub Pages に secrets.js があるか確認してください');
}
console.log('meishi-ocr', APP_VERSION);
