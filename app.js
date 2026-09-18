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
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });
    video.srcObject = stream;
  } catch (err) {
    alert('カメラを起動できませんでした: ' + err.message);
  }
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

function captureFrameFromVideo() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    throw new Error('カメラ映像がまだ準備できていません');
  }

  // 画面の向きに合わせてキャンバスへ描画（端末を横にした場合のズレを補正）
  let angle = 0;
  try {
    const type = (screen.orientation && screen.orientation.type) || '';
    if (type.indexOf('landscape-primary') !== -1) angle = 0;
    else if (type.indexOf('landscape-secondary') !== -1) angle = 180;
    else if (type.indexOf('portrait-secondary') !== -1) angle = 180;
    // portrait-primary はそのまま（後で横長化）
  } catch (e) {
    // ignore
  }

  // video の実ピクセルはそのまま描画（CSS回転はしない）
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, vw, vh);
  return canvasToJpegBase64(canvas, 0.9);
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
  try {
    let base64 = captureFrameFromVideo();

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
    if (captureSide === 'back') {
      captureLabel.textContent = '表・裏 撮影済み';
    } else {
      captureLabel.textContent = '表面 撮影済み（裏面は任意）';
    }
  } catch (err) {
    alert(err.message || String(err));
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
  btnSave.style.display = 'none';
  editForm.classList.remove('show');
  status.classList.remove('show');
  showCameraFor('front');
}

btnRetry.addEventListener('click', resetCamera);
btnCancel.addEventListener('click', resetCamera);

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
