/* meishi-ocr frontend v20261112a */
const APP_VERSION = '20261112a';

const CROP_MODE_LS_KEY = 'meishi_crop_mode';
const GUIDE_ORIENTATION_LS_KEY = 'meishi_guide_orientation';

const EDIT_UNDO_MAX_DEPTH = 6;

function createCaptureEditHistoryStore() {
  if (!window.MeishiEditHistory) {
    throw new Error('MeishiEditHistory が読み込まれていません');
  }
  return {
    front: MeishiEditHistory.createEditHistory(EDIT_UNDO_MAX_DEPTH),
    back: MeishiEditHistory.createEditHistory(EDIT_UNDO_MAX_DEPTH)
  };
}

const captureEditHistory = createCaptureEditHistoryStore();

const SEARCH_SORT_LS_KEY = 'meishi_search_sort';
const SEARCH_FILTER_TAGS_LS_KEY = 'meishi_search_filter_tags';
const SEARCH_TAG_MODE_LS_KEY = 'meishi_search_tag_mode';
const SEARCH_PAGE_SIZE = 40;
const SEARCH_SORT_OPTIONS = [
  { id: 'dateDesc', label: '新しい順' },
  { id: 'dateAsc', label: '古い順' },
  { id: 'company', label: '会社名順' },
  { id: 'name', label: '氏名順' }
];

function getGasUrl() {
  return (window.MeishiConfig && window.MeishiConfig.readGasUrl())
    || (window.MEISHI_OCR && window.MEISHI_OCR.GAS_URL)
    || '';
}

function getApiToken() {
  return (window.MeishiConfig && window.MeishiConfig.readApiToken())
    || (window.MEISHI_OCR && window.MEISHI_OCR.API_TOKEN)
    || '';
}

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
const cameraStage = $('cameraStage');
const captureGuide = $('captureGuide');
const captureGuideFrame = $('captureGuideFrame');
const guideOrientBar = $('guideOrientBar');
const btnGuideLandscape = $('btnGuideLandscape');
const btnGuidePortrait = $('btnGuidePortrait');
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
const editHistoryTools = $('editHistoryTools');
const btnUndoEdit = $('btnUndoEdit');
const btnRestoreOriginal = $('btnRestoreOriginal');
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
const searchSort = $('searchSort');
const searchTagList = $('searchTagList');
const searchTagModeOr = $('searchTagModeOr');
const searchTagModeAnd = $('searchTagModeAnd');
const searchResults = $('searchResults');
const btnLoadMore = $('btnLoadMore');
const btnClearSearchTags = $('btnClearSearchTags');
const tagList = $('tagList');
const newTagInput = $('newTagInput');
const btnAddTag = $('btnAddTag');
const editRegisteredDate = $('edit-registeredDate');
const scanPane = $('tab-scan');
const cardDetail = $('cardDetail');
const cardDetailTitle = $('cardDetailTitle');
const cardDetailBody = $('cardDetailBody');
const cardDetailClose = $('cardDetailClose');

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
let searchFilterTags = [];
let searchCards = [];
let searchOffset = 0;
let searchTotal = 0;
let searchHasMore = false;
let searchLoading = false;
let activeCardIndex = -1;
let activeCardSide = 'front';
let searchRequestId = 0;
let detailReturnFocus = null;

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
  const gasUrl = getGasUrl();
  const token = getApiToken();
  if (!gasUrl || gasUrl === 'YOUR_GAS_WEBAPP_URL') {
    throw new Error('接続設定で GAS のデプロイ URL を入力して保存してください');
  }
  if (!token || token === 'YOUR_API_TOKEN') {
    throw new Error('接続設定で API トークンを入力して保存してください');
  }
}

async function gasFetch(payload) {
  assertConfig();
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 90000) : null;
  let response;
  try {
    response = await fetch(getGasUrl(), {
      method: 'POST',
      body: JSON.stringify(Object.assign({ token: getApiToken() }, payload)),
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
  if (editHistoryTools) editHistoryTools.classList.toggle('show', !!on);
  actionTools.classList.toggle('show', !!on);
  if (on) updateEditHistoryControls();
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
  updateEditHistoryControls();
}

function getCropMode() {
  const v = localStorage.getItem(CROP_MODE_LS_KEY) || 'guide';
  return v === 'detect' ? 'detect' : 'guide';
}

function setCropMode(mode) {
  localStorage.setItem(CROP_MODE_LS_KEY, mode === 'detect' ? 'detect' : 'guide');
  syncCropModeUI();
}

function getGuideOrientation() {
  const v = localStorage.getItem(GUIDE_ORIENTATION_LS_KEY) || 'landscape';
  return v === 'portrait' ? 'portrait' : 'landscape';
}

function setGuideOrientation(orientation) {
  localStorage.setItem(GUIDE_ORIENTATION_LS_KEY, orientation === 'portrait' ? 'portrait' : 'landscape');
  syncGuideOrientationButtons();
  repositionCaptureGuide();
}

function syncGuideOrientationButtons() {
  const o = getGuideOrientation();
  if (btnGuideLandscape) btnGuideLandscape.classList.toggle('active', o === 'landscape');
  if (btnGuidePortrait) btnGuidePortrait.classList.toggle('active', o === 'portrait');
}

function syncCropModeUI() {
  const mode = getCropMode();
  document.querySelectorAll('input[name="cropMode"]').forEach((el) => {
    el.checked = el.value === mode;
  });
  if (guideOrientBar) guideOrientBar.style.display = mode === 'guide' ? 'flex' : 'none';
  if (btnAutoCrop) {
    btnAutoCrop.textContent = mode === 'guide' ? 'ガイド枠で切り直す' : '自動で真四角';
  }
  updateCaptureGuideVisibility();
}

function updateCaptureGuideVisibility() {
  if (!captureGuide) return;
  const show = getCropMode() === 'guide' && video.style.display !== 'none';
  captureGuide.classList.toggle('show', show);
  captureGuide.setAttribute('aria-hidden', show ? 'false' : 'true');
  if (show) repositionCaptureGuide();
}

function repositionCaptureGuide() {
  if (!cameraStage || !captureGuideFrame || !window.MeishiCaptureGuide) return;
  const w = cameraStage.clientWidth;
  const h = cameraStage.clientHeight;
  if (w < 20 || h < 20) return;
  const rect = MeishiCaptureGuide.layoutGuideRect(w, h, getGuideOrientation(), 0.07);
  captureGuideFrame.style.left = rect.left + 'px';
  captureGuideFrame.style.top = rect.top + 'px';
  captureGuideFrame.style.width = rect.width + 'px';
  captureGuideFrame.style.height = rect.height + 'px';
}

function measureGuideFrameRect() {
  if (!cameraStage || !window.MeishiCaptureGuide) return null;
  repositionCaptureGuide();
  return MeishiCaptureGuide.layoutGuideRect(
    cameraStage.clientWidth,
    cameraStage.clientHeight,
    getGuideOrientation(),
    0.07
  );
}

function getVideoDisplaySize() {
  return {
    width: video.clientWidth || (cameraStage && cameraStage.clientWidth) || 0,
    height: video.clientHeight || (cameraStage && cameraStage.clientHeight) || 0
  };
}

async function cropBase64Region(base64, crop) {
  const img = await loadImageFromBase64(base64);
  const x = Math.max(0, Math.min(Math.floor(crop.x), img.width - 1));
  const y = Math.max(0, Math.min(Math.floor(crop.y), img.height - 1));
  const w = Math.max(8, Math.min(Math.floor(crop.width), img.width - x));
  const h = Math.max(8, Math.min(Math.floor(crop.height), img.height - y));
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
  return canvasToJpegBase64(out, 0.92);
}

async function applyGuideCropToBase64(base64, options) {
  options = options || {};
  const img = await loadImageFromBase64(base64);
  let crop;
  if (options.source === 'camera' && options.guideRect) {
    const display = options.displaySize || getVideoDisplaySize();
    crop = MeishiCaptureGuide.mapGuideRectToSourceCrop(
      options.guideRect,
      img.width,
      img.height,
      display.width,
      display.height
    );
  } else {
    crop = MeishiCaptureGuide.centerGuideCropRect(img.width, img.height, getGuideOrientation(), 0.08);
  }
  return cropBase64Region(base64, crop);
}

function showCameraFor(side) {
  captureSide = side;
  clearError();
  statusBox.classList.remove('show');
  editForm.classList.remove('show');
  btnSave.classList.remove('show');
  if (scanPane) scanPane.classList.remove('reviewing');
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
  updateCaptureGuideVisibility();
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
  if (captureGuide) {
    captureGuide.classList.remove('show');
    captureGuide.setAttribute('aria-hidden', 'true');
  }
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

function getSideHistory(side) {
  return side === 'back' ? captureEditHistory.back : captureEditHistory.front;
}

function getSideImageBase64(side) {
  return side === 'back' ? imageBack : imageFront;
}

function assignSideImage(base64, side) {
  const use = side || getActiveCropSide() || 'front';
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

function rememberEditMutation(side) {
  const use = side || getActiveCropSide();
  if (!use) return;
  const current = getSideImageBase64(use);
  if (!current) return;
  MeishiEditHistory.recordEdit(getSideHistory(use), current);
}

function setCaptureOriginalForSide(side, base64) {
  if (!side || !base64) return;
  MeishiEditHistory.setCaptureOriginal(getSideHistory(side), base64);
  updateEditHistoryControls();
}

function resetCaptureEditHistory(side) {
  if (side === 'back' || side === 'front') {
    MeishiEditHistory.resetEditHistory(getSideHistory(side));
  } else {
    MeishiEditHistory.resetEditHistory(captureEditHistory.front);
    MeishiEditHistory.resetEditHistory(captureEditHistory.back);
  }
}

function updateEditHistoryControls() {
  const side = getActiveCropSide();
  if (!btnUndoEdit && !btnRestoreOriginal) return;
  if (!side) {
    if (btnUndoEdit) btnUndoEdit.disabled = true;
    if (btnRestoreOriginal) btnRestoreOriginal.disabled = true;
    return;
  }
  const history = getSideHistory(side);
  const current = getSideImageBase64(side);
  if (btnUndoEdit) {
    btnUndoEdit.disabled = !MeishiEditHistory.hasUndo(history);
  }
  if (btnRestoreOriginal) {
    btnRestoreOriginal.disabled = !MeishiEditHistory.hasOriginal(history) ||
      MeishiEditHistory.isCurrentOriginal(current, history);
  }
}

function undoLastImageEdit() {
  const side = getActiveCropSide();
  if (!side) {
    showError('元に戻す対象がありません');
    return;
  }
  const history = getSideHistory(side);
  const prev = MeishiEditHistory.undoEdit(history);
  if (!prev) {
    showError('これ以上元に戻せません');
    return;
  }
  assignSideImage(prev, side);
  lastCapturedSide = side;
  updatePreviewVisibility();
  updateEditHistoryControls();
  captureLabel.textContent = (side === 'back' ? '裏面' : '表面') + 'を1つ前の状態に戻しました';
  clearError();
}

function restoreOriginalCapture() {
  const side = getActiveCropSide();
  if (!side) {
    showError('元の写真がありません');
    return;
  }
  const history = getSideHistory(side);
  const original = MeishiEditHistory.getOriginal(history);
  if (!original) {
    showError('元の写真がありません');
    return;
  }
  const current = getSideImageBase64(side);
  if (current && current !== original) {
    MeishiEditHistory.recordEdit(history, current);
  }
  history.undoStack = [];
  assignSideImage(original, side);
  lastCapturedSide = side;
  updatePreviewVisibility();
  updateEditHistoryControls();
  captureLabel.textContent = '撮影直後の写真に戻しました。「4点で切る」からやり直せます';
  clearError();
}

function setActiveCropBase64(base64, side, options) {
  const use = side || cropState.side || getActiveCropSide();
  const skipHistory = options && options.skipHistory;
  if (!skipHistory) rememberEditMutation(use);
  assignSideImage(base64, use);
  updateEditHistoryControls();
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
      updateCaptureGuideVisibility();
    } catch (e) {
      captureLabel.textContent = '映像準備中でも撮影できます';
      updateCaptureGuideVisibility();
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

async function applyCapturedImage(base64, captureOptions) {
  captureOptions = captureOptions || {};
  const fullBase64 = await resizeBase64(base64, 2000, 0.9);
  const sideKey = captureSide === 'back' ? 'back' : 'front';
  const useGuide = getCropMode() === 'guide';
  let working = fullBase64;

  if (useGuide) {
    working = await applyGuideCropToBase64(fullBase64, captureOptions);
    skipAutoLandscape[sideKey] = true;
  } else if (!skipAutoLandscape[sideKey]) {
    working = await ensureLandscapeBase64(fullBase64);
    skipAutoLandscape[sideKey] = false;
  }

  if (captureSide === 'back') {
    setCaptureOriginalForSide('back', fullBase64);
    assignSideImage(working, 'back');
    lastCapturedSide = 'back';
  } else {
    setCaptureOriginalForSide('front', fullBase64);
    assignSideImage(working, 'front');
    imageBack = '';
    resetCaptureEditHistory('back');
    lastCapturedSide = 'front';
    faceBox = null;
    faceImage = '';
    skipAutoLandscape.back = false;
  }
  showPostCaptureActions();
  updateEditHistoryControls();
  if (useGuide) {
    captureLabel.textContent = captureSide === 'back'
      ? '裏面をガイド枠で切り取りました'
      : '表面をガイド枠で切り取りました';
  } else {
    captureLabel.textContent = captureSide === 'back'
      ? '表・裏 撮影済み'
      : '表面 撮影済み（裏面は任意）';
  }
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
    const guideRect = getCropMode() === 'guide' ? measureGuideFrameRect() : null;
    const displaySize = getVideoDisplaySize();
    const base64 = await captureFrameFromVideo();
    await applyCapturedImage(base64, {
      source: 'camera',
      guideRect: guideRect,
      displaySize: displaySize
    });
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
  await applyCapturedImage(base64, { source: 'file' });
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
    rememberEditMutation(side);
    const rotated = await rotateBase64(getSideImageBase64(side), deg);
    assignSideImage(rotated, side);
    lastCapturedSide = side;
    updatePreviewVisibility();
    updateEditHistoryControls();
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
  resetCaptureEditHistory();
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
  if (scanPane) scanPane.classList.remove('reviewing');
  statusBox.classList.remove('show');
  setLoading(false);
  clearError();
  closeCropEditor();
  showCameraFor('front');
  if (!video.srcObject) startCamera();
}

function orderQuadPoints(pts) {
  if (window.MeishiCrop && window.MeishiCrop.orderQuadPoints) {
    return window.MeishiCrop.orderQuadPoints(pts);
  }
  const tagged = pts.map((p) => ({ p: p, s: p.x + p.y, d: p.x - p.y }));
  const tl = tagged.reduce((a, b) => (a.s < b.s ? a : b)).p;
  const br = tagged.reduce((a, b) => (a.s > b.s ? a : b)).p;
  const tr = tagged.reduce((a, b) => (a.d > b.d ? a : b)).p;
  const bl = tagged.reduce((a, b) => (a.d < b.d ? a : b)).p;
  return [tl, tr, br, bl];
}

function detectCardCorners(img) {
  if (!window.MeishiCrop || !window.MeishiCrop.detectCardCorners) {
    throw new Error('画像処理ライブラリが読み込まれていません');
  }
  return window.MeishiCrop.detectCardCorners(img);
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

async function reapplyGuideCropFromOriginal() {
  const side = getActiveCropSide();
  if (!side) {
    showError('先に名刺を撮影してください');
    return;
  }
  const history = getSideHistory(side);
  const source = MeishiEditHistory.getOriginal(history) || getSideImageBase64(side);
  if (!source) {
    showError('切り直す元画像がありません');
    return;
  }
  cropBusy = true;
  clearError();
  captureLabel.textContent = 'ガイド枠で切り直しています...';
  setLoading(true, 'ガイド枠で切り直しています');
  try {
    rememberEditMutation(side);
    const next = await applyGuideCropToBase64(source, { source: 'center' });
    assignSideImage(next, side);
    lastCapturedSide = side;
    updatePreviewVisibility();
    updateEditHistoryControls();
    setToolsVisible(true);
    captureLabel.textContent = 'ガイド枠で切り直しました';
  } catch (err) {
    showError('ガイド枠の切り直しに失敗しました: ' + errText(err));
  } finally {
    cropBusy = false;
    setLoading(false);
  }
}

async function autoCropMeishi() {
  if (cropBusy) return;
  if (getCropMode() === 'guide') {
    await reapplyGuideCropFromOriginal();
    return;
  }
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
    const insetX = img.width * 0.03;
    const insetY = img.height * 0.03;
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

function loadSearchFilterTagsFromStorage() {
  try {
    const raw = localStorage.getItem(SEARCH_FILTER_TAGS_LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    searchFilterTags = Array.isArray(parsed) ? parsed.filter((t) => String(t || '').trim()) : [];
  } catch (e) {
    searchFilterTags = [];
  }
}

function saveSearchFilterTagsToStorage() {
  localStorage.setItem(SEARCH_FILTER_TAGS_LS_KEY, JSON.stringify(searchFilterTags));
}

function getSearchTagMode() {
  const mode = localStorage.getItem(SEARCH_TAG_MODE_LS_KEY) || 'or';
  return mode === 'and' ? 'and' : 'or';
}

function setSearchTagMode(mode) {
  localStorage.setItem(SEARCH_TAG_MODE_LS_KEY, mode === 'and' ? 'and' : 'or');
}

function isSearchTagSelected(name) {
  return searchFilterTags.indexOf(name) !== -1;
}

function toggleSearchFilterTag(name) {
  if (!name) return;
  const i = searchFilterTags.indexOf(name);
  if (i >= 0) searchFilterTags.splice(i, 1);
  else searchFilterTags.push(name);
  saveSearchFilterTagsToStorage();
  renderSearchTagList();
  runSearch();
}

function clearSearchFilterTags() {
  if (!searchFilterTags.length) return;
  searchFilterTags = [];
  saveSearchFilterTagsToStorage();
  renderSearchTagList();
  runSearch();
}

function syncSearchTagModeControls() {
  const mode = getSearchTagMode();
  if (searchTagModeOr) searchTagModeOr.checked = mode === 'or';
  if (searchTagModeAnd) searchTagModeAnd.checked = mode === 'and';
}

function renderSearchTagList() {
  if (!searchTagList) return;
  const ordered = tagCatalog.slice().sort((a, b) => {
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    return String(a.name).localeCompare(String(b.name), 'ja');
  });
  searchFilterTags.forEach((name) => {
    if (!ordered.some((t) => t.name === name)) {
      ordered.unshift({ name: name, memberCount: 0 });
    }
  });
  if (!ordered.length) {
    searchTagList.innerHTML = '<div class="tag-hint">タグがありません。Google連絡先のラベルがここに表示されます。</div>';
    return;
  }
  searchTagList.innerHTML = ordered.map((t) => {
    const selected = isSearchTagSelected(t.name) ? ' selected' : '';
    const count = t.memberCount >= 0 ? '<span class="tag-count">' + t.memberCount + '</span>' : '';
    return '<button type="button" class="tag-chip' + selected + '" data-search-tag="' + escapeHtml(t.name) + '">' +
      escapeHtml(t.name) + count + '</button>';
  }).join('');
  if (btnClearSearchTags) {
    btnClearSearchTags.hidden = searchFilterTags.length === 0;
  }
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
    renderSearchTagList();
  } catch (err) {
    if (tagList && !tagCatalog.length) {
      tagList.innerHTML = '<div class="tag-hint">既存タグを取得できませんでした。新規追加はできます。<br>' +
        escapeHtml(errText(err)) + '</div>';
    }
  }
}

function cropFaceFromSide(box, side) {
  const base64 = side === 'back' ? imageBack : imageFront;
  if (!box || !base64) return Promise.resolve('');
  return loadImageFromBase64(base64).then((img) => {
    const padX = Math.round((box.right - box.left) * 0.18);
    const padY = Math.round((box.bottom - box.top) * 0.22);
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
    const faceSide = result.faceSide === 'back' ? 'back' : 'front';
    faceImage = faceBox ? await cropFaceFromSide(faceBox, faceSide) : '';
    selectedTags = [];
    if (editRegisteredDate) editRegisteredDate.value = todayDateStr();
    editForm.classList.add('show');
    if (scanPane) scanPane.classList.add('reviewing');
    btnSave.classList.add('show');
    captureLabel.textContent = '内容を確認して登録してください';
    renderTagList();
    loadContactTags();
    if (faceImage) {
      statusTitle.textContent = '顔を検出';
      statusMsg.textContent = (faceSide === 'back' ? '裏面' : '表面') +
        'の顔写真を検出しました。登録時に連絡先へ反映します。';
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
    if (scanPane) scanPane.classList.remove('reviewing');
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
    if (scanPane) scanPane.classList.add('reviewing');
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

function driveImageUrl(url) {
  const source = String(url || '').trim();
  if (!source) return '';
  if (source.indexOf('drive.google.com') === -1) return source;
  const pathMatch = source.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const queryMatch = source.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const id = (pathMatch && pathMatch[1]) || (queryMatch && queryMatch[1]);
  return id ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1200' : source;
}

function bindImageFallbacks(root) {
  if (!root) return;
  root.querySelectorAll('img[data-card-image]').forEach((img) => {
    img.addEventListener('error', () => {
      const placeholder = document.createElement('div');
      placeholder.className = 'search-card-image-placeholder';
      placeholder.textContent = '画像を表示できません';
      img.replaceWith(placeholder);
    }, { once: true });
  });
}

function galleryImageMarkup(card) {
  const side = card.frontImageUrl ? '表面' : card.backImageUrl ? '裏面' : '';
  const url = card.frontImageUrl || card.backImageUrl || '';
  if (!url) return '<div class="search-card-image-placeholder">画像なし</div>';
  return '<img class="search-card-image" data-card-image src="' + escapeHtml(driveImageUrl(url)) +
    '" alt="' + escapeHtml((card.name || card.company || '名刺') + 'の' + side) + '" loading="lazy">';
}

function getSearchSort() {
  const saved = localStorage.getItem(SEARCH_SORT_LS_KEY);
  if (saved && SEARCH_SORT_OPTIONS.some((o) => o.id === saved)) return saved;
  return 'dateDesc';
}

function setSearchSort(value) {
  localStorage.setItem(SEARCH_SORT_LS_KEY, value);
}

function initSearchSortControl() {
  if (!searchSort) return;
  const current = getSearchSort();
  searchSort.innerHTML = SEARCH_SORT_OPTIONS.map((o) =>
    '<option value="' + o.id + '"' + (o.id === current ? ' selected' : '') + '>' + o.label + '</option>'
  ).join('');
  searchSort.value = current;
}

function searchSummaryText(query) {
  const q = (query || '').trim();
  const head = q ? '「' + escapeHtml(q) + '」の結果' : '名刺一覧';
  let tagPart = '';
  if (searchFilterTags.length) {
    const modeLabel = getSearchTagMode() === 'and' ? 'AND（すべて）' : 'OR（いずれか）';
    tagPart = ' · タグ ' + modeLabel + ': ' + searchFilterTags.map(escapeHtml).join('、');
  }
  if (!searchTotal) return head + tagPart;
  return head + tagPart + '：' + searchCards.length + ' / ' + searchTotal + ' 件';
}

function renderSearchCards(query) {
  if (!searchCards.length) {
    const q = (query || '').trim();
    searchResults.innerHTML = '<div class="empty-search-card"><div class="search-card-name">' +
      (q ? '一致する名刺がありません' : '保存した名刺はまだありません') +
      '</div><div class="search-card-detail">' +
      (q ? '検索語を変えてお試しください。' : 'スキャンした名刺を登録すると、ここに画像で並びます。') +
      '</div></div>';
    if (btnLoadMore) btnLoadMore.hidden = true;
    searchResults.classList.add('show');
    return;
  }
  searchResults.innerHTML = '<p class="search-summary">' + searchSummaryText(query) + '</p><div class="card-gallery">' +
    searchCards.map((card, index) =>
      '<button class="search-card" type="button" data-card-index="' + index + '" aria-label="' +
        escapeHtml((card.name || card.company || '名刺') + 'の詳細を開く') + '">' +
        galleryImageMarkup(card) +
        '<span class="search-card-copy"><span class="search-card-topline"><span class="search-card-name">' +
          escapeHtml(card.name || '（氏名なし）') + '</span><span class="search-card-date">' +
          escapeHtml(card.registeredDate || '') + '</span></span><span class="search-card-company">' +
          escapeHtml(card.company || '') + (card.title ? ' / ' + escapeHtml(card.title) : '') +
        '</span>' + (card.tags ? '<span class="search-card-tags"># ' + escapeHtml(card.tags) + '</span>' : '') +
      '</span></button>'
    ).join('') + '</div>';
  searchResults.classList.add('show');
  bindImageFallbacks(searchResults);
  if (btnLoadMore) {
    btnLoadMore.hidden = !searchHasMore;
    btnLoadMore.disabled = searchLoading;
    btnLoadMore.textContent = searchLoading ? '読み込み中…' : 'もっと見る（残り ' + Math.max(0, searchTotal - searchCards.length) + ' 件）';
  }
}

const CARD_DETAIL_FIELDS = [
  ['furigana', 'ふりがな'], ['company', '会社名'], ['department', '部門'], ['title', '役職'],
  ['mobile1', '携帯電話1'], ['mobile2', '携帯電話2'], ['phone', '電話番号'], ['fax', 'FAX'],
  ['email1', 'メール1'], ['email2', 'メール2'], ['address', '住所'], ['website', 'ウェブページ'],
  ['memo', 'メモ'], ['tags', 'タグ'], ['registeredDate', '登録日']
];

function renderCardDetail() {
  const card = searchCards[activeCardIndex];
  if (!card) return;
  const hasFront = !!card.frontImageUrl;
  const hasBack = !!card.backImageUrl;
  if (activeCardSide === 'front' && !hasFront) activeCardSide = 'back';
  if (activeCardSide === 'back' && !hasBack) activeCardSide = 'front';
  const imageUrl = activeCardSide === 'back' ? card.backImageUrl : card.frontImageUrl;
  const sideLabel = activeCardSide === 'back' ? '裏面' : '表面';
  const imageMarkup = imageUrl
    ? '<img data-card-image src="' + escapeHtml(driveImageUrl(imageUrl)) + '" alt="名刺の' + sideLabel + '">'
    : '<div class="search-card-image-placeholder">画像なし</div>';
  const stageMarkup = hasFront && hasBack
    ? '<button type="button" class="detail-image-stage" data-detail-toggle aria-label="' +
      (activeCardSide === 'front' ? '裏面を表示' : '表面を表示') + '">' + imageMarkup + '</button>'
    : '<div class="detail-image-stage">' + imageMarkup + '</div>';
  const switchMarkup = hasFront && hasBack
    ? '<div class="detail-side-switch" aria-label="名刺の面を選択"><button type="button" data-detail-side="front" class="' +
      (activeCardSide === 'front' ? 'active' : '') + '">表面</button><button type="button" data-detail-side="back" class="' +
      (activeCardSide === 'back' ? 'active' : '') + '">裏面</button></div>'
    : '';
  const fields = CARD_DETAIL_FIELDS.filter(([key]) => card[key]).map(([key, label]) =>
    '<div class="detail-field"><dt>' + label + '</dt><dd>' + escapeHtml(card[key]) + '</dd></div>'
  ).join('');
  cardDetailTitle.textContent = card.name || card.company || '名刺詳細';
  cardDetailBody.innerHTML = stageMarkup + switchMarkup +
    (imageUrl ? '<a class="detail-original-link" href="' + escapeHtml(imageUrl) + '" target="_blank" rel="noopener">元の画像を開く</a>' : '') +
    '<dl class="detail-fields">' + fields + '</dl>';
  bindImageFallbacks(cardDetailBody);
}

function openCardDetail(index, source) {
  if (!searchCards[index]) return;
  activeCardIndex = index;
  activeCardSide = searchCards[index].frontImageUrl ? 'front' : 'back';
  detailReturnFocus = source || null;
  renderCardDetail();
  cardDetail.classList.add('show');
  cardDetail.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  cardDetailClose.focus();
}

function closeCardDetail() {
  cardDetail.classList.remove('show');
  cardDetail.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (detailReturnFocus && document.contains(detailReturnFocus)) detailReturnFocus.focus();
  detailReturnFocus = null;
}

async function runSearch(opts) {
  opts = opts || {};
  const append = !!opts.append;
  const query = (searchInput.value || '').trim();
  const sort = getSearchSort();

  if (!append) {
    searchRequestId += 1;
    searchOffset = 0;
    searchCards = [];
    searchTotal = 0;
    searchHasMore = false;
    searchResults.innerHTML = '<div class="empty-search-card"><div class="search-card-detail">名刺を読み込んでいます…</div></div>';
    searchResults.classList.add('show');
    if (btnLoadMore) btnLoadMore.hidden = true;
  }

  const requestId = searchRequestId;
  const fetchOffset = append ? searchOffset : 0;
  if (searchLoading) return;
  searchLoading = true;
  if (btnLoadMore && append) {
    btnLoadMore.disabled = true;
    btnLoadMore.textContent = '読み込み中…';
  }

  try {
    const result = await gasFetch({
      action: 'search',
      query: query,
      offset: fetchOffset,
      limit: SEARCH_PAGE_SIZE,
      sort: sort,
      tags: searchFilterTags.slice(),
      tagMode: getSearchTagMode()
    });
    if (requestId !== searchRequestId) return;
    const rows = (result && result.data) || [];
    searchTotal = typeof result.total === 'number' ? result.total : rows.length;
    searchHasMore = !!result.hasMore;
  searchOffset = fetchOffset + rows.length;
    searchCards = append ? searchCards.concat(rows) : rows.slice();
    renderSearchCards(query);
  } catch (err) {
    if (requestId !== searchRequestId) return;
    if (!append) {
      searchResults.innerHTML = '<div class="empty-search-card"><div class="search-card-name">名刺を読み込めませんでした</div><div class="search-card-detail">' +
        escapeHtml(errText(err)) + '</div></div>';
      searchResults.classList.add('show');
    } else {
      showError('追加の読み込みに失敗しました: ' + errText(err));
      if (btnLoadMore) {
        btnLoadMore.disabled = false;
        btnLoadMore.textContent = 'もっと見る（再試行）';
      }
    }
  } finally {
    searchLoading = false;
  }
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    const pane = $('tab-' + tab.dataset.tab);
    if (pane) pane.classList.add('active');
    if (tab.dataset.tab === 'search') {
      if (!searchResults.dataset.loaded) {
        searchResults.dataset.loaded = 'true';
        loadSearchFilterTagsFromStorage();
        syncSearchTagModeControls();
        if (window.MeishiConfig && window.MeishiConfig.isConfigured()) {
          loadContactTags().finally(() => runSearch());
        } else {
          runSearch();
        }
      }
    }
  });
});

searchResults.addEventListener('click', (event) => {
  const cardButton = event.target.closest && event.target.closest('[data-card-index]');
  if (!cardButton) return;
  openCardDetail(Number(cardButton.getAttribute('data-card-index')), cardButton);
});

cardDetailBody.addEventListener('click', (event) => {
  const sideButton = event.target.closest && event.target.closest('[data-detail-side]');
  if (sideButton) {
    activeCardSide = sideButton.getAttribute('data-detail-side') === 'back' ? 'back' : 'front';
    renderCardDetail();
    return;
  }
  const toggle = event.target.closest && event.target.closest('[data-detail-toggle]');
  if (toggle) {
    activeCardSide = activeCardSide === 'front' ? 'back' : 'front';
    renderCardDetail();
  }
});

cardDetailClose.addEventListener('click', closeCardDetail);
cardDetail.addEventListener('click', (event) => {
  if (event.target === cardDetail) closeCardDetail();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && cardDetail.classList.contains('show')) closeCardDetail();
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
onClick(btnUndoEdit, undoLastImageEdit);
onClick(btnRestoreOriginal, restoreOriginalCapture);
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
  searchTimer = setTimeout(() => runSearch(), 500);
});

if (searchSort) {
  searchSort.addEventListener('change', () => {
    setSearchSort(searchSort.value);
    runSearch();
  });
}

if (btnLoadMore) {
  onClick(btnLoadMore, () => runSearch({ append: true }));
}

if (searchTagList) {
  searchTagList.addEventListener('click', (ev) => {
    const chip = ev.target.closest ? ev.target.closest('[data-search-tag]') : null;
    if (!chip) return;
    ev.preventDefault();
    toggleSearchFilterTag(chip.getAttribute('data-search-tag'));
  });
}

function onSearchTagModeChange(mode) {
  setSearchTagMode(mode);
  syncSearchTagModeControls();
  if (searchFilterTags.length) runSearch();
}

if (searchTagModeOr) {
  searchTagModeOr.addEventListener('change', () => {
    if (searchTagModeOr.checked) onSearchTagModeChange('or');
  });
}
if (searchTagModeAnd) {
  searchTagModeAnd.addEventListener('change', () => {
    if (searchTagModeAnd.checked) onSearchTagModeChange('and');
  });
}

if (btnClearSearchTags) {
  onClick(btnClearSearchTags, clearSearchFilterTags);
}

initSearchSortControl();
loadSearchFilterTagsFromStorage();
syncSearchTagModeControls();

document.querySelectorAll('input[name="cropMode"]').forEach((el) => {
  el.addEventListener('change', () => {
    if (el.checked) setCropMode(el.value);
  });
});
if (btnGuideLandscape) {
  btnGuideLandscape.addEventListener('click', () => setGuideOrientation('landscape'));
}
if (btnGuidePortrait) {
  btnGuidePortrait.addEventListener('click', () => setGuideOrientation('portrait'));
}
syncGuideOrientationButtons();
syncCropModeUI();
window.addEventListener('resize', () => {
  if (captureGuide && captureGuide.classList.contains('show')) repositionCaptureGuide();
});

showCameraFor('front');
if (window.MeishiConfig && window.MeishiConfig.isConfigured()) {
  startCamera();
  loadContactTags();
} else {
  openSetupPanel(true);
}

initSetupPanel();
console.log('meishi-ocr', APP_VERSION);

(function showVersions() {
  var el = document.querySelector('.app-ver');
  if (!el) return;
  el.textContent = 'PWA ' + APP_VERSION;
  var gasUrl = getGasUrl();
  if (!gasUrl || gasUrl === 'YOUR_GAS_WEBAPP_URL') return;
  fetch(gasUrl, { method: 'GET', redirect: 'follow' }).then(function (res) {
    return res.text();
  }).then(function (text) {
    var data = JSON.parse(text);
    if (!data || !data.version) return;
    var label = 'PWA ' + APP_VERSION + ' / GAS ' + data.version;
    if (data.pwaVersion && data.pwaVersion !== APP_VERSION) {
      label += '（版不一致: GASは PWA ' + data.pwaVersion + ' 想定）';
      el.style.color = '#e6a817';
    }
    el.textContent = label;
  }).catch(function () { /* 生存確認失敗は無視 */ });
})();

function openSetupPanel(blocking) {
  const panel = $('setupPanel');
  if (!panel) return;
  panel.classList.add('show');
  panel.setAttribute('aria-hidden', 'false');
  if (blocking) panel.classList.add('blocking');
  const gasInput = $('setupGasUrl');
  const tokenInput = $('setupApiToken');
  if (gasInput) gasInput.value = getGasUrl();
  if (tokenInput) tokenInput.value = getApiToken();
}

function closeSetupPanel() {
  const panel = $('setupPanel');
  if (!panel) return;
  panel.classList.remove('show', 'blocking');
  panel.setAttribute('aria-hidden', 'true');
}

function initSetupPanel() {
  const btnSave = $('setupSave');
  const btnClose = $('setupClose');
  const btnLink = $('openSetup');
  if (btnLink) {
    btnLink.addEventListener('click', (ev) => {
      ev.preventDefault();
      openSetupPanel(false);
    });
  }
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const gasUrl = ($('setupGasUrl') && $('setupGasUrl').value) || '';
      const token = ($('setupApiToken') && $('setupApiToken').value) || '';
      if (!gasUrl.trim() || !token.trim()) {
        showError('GAS URL と API トークンの両方を入力してください');
        return;
      }
      window.MeishiConfig.saveConnection(gasUrl, token);
      window.MEISHI_OCR = {
        GAS_URL: getGasUrl(),
        API_TOKEN: getApiToken()
      };
      closeSetupPanel();
      clearError();
      if (!video.srcObject) startCamera();
      loadContactTags();
    });
  }
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      if (window.MeishiConfig.isConfigured()) closeSetupPanel();
      else showError('初回は接続設定を保存してください');
    });
  }
}
