// ===== ここにGASのウェブアプリURLを貼る =====
const GAS_URL = 'ここにデプロイしたGASのURLを貼る';

// ===== 要素取得 =====
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const preview = document.getElementById('preview');
const btnCapture = document.getElementById('btnCapture');
const btnScan = document.getElementById('btnScan');
const btnRetry = document.getElementById('btnRetry');
const btnSave = document.getElementById('btnSave');
const btnCancel = document.getElementById('btnCancel');
const loading = document.getElementById('loading');
const editForm = document.getElementById('editForm');
const status = document.getElementById('status');
const statusMsg = document.getElementById('statusMsg');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

let imageBase64 = '';

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

// ===== 撮影 =====
btnCapture.addEventListener('click', () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  imageBase64 = dataUrl.split(',')[1];

  preview.src = dataUrl;
  preview.style.display = 'block';
  video.style.display = 'none';
  btnCapture.style.display = 'none';
  btnScan.style.display = 'block';
  btnRetry.style.display = 'block';
  status.classList.remove('show');
  editForm.classList.remove('show');
});

// ===== 撮り直し =====
function resetCamera() {
  preview.style.display = 'none';
  video.style.display = 'block';
  btnCapture.style.display = 'block';
  btnScan.style.display = 'none';
  btnSave.style.display = 'none';
  btnRetry.style.display = 'none';
  editForm.classList.remove('show');
  status.classList.remove('show');
  imageBase64 = '';
}

btnRetry.addEventListener('click', resetCamera);
btnCancel.addEventListener('click', resetCamera);

// ===== 読み取り（OCR + Gemini → 編集フォームに表示） =====
btnScan.addEventListener('click', async () => {
  if (!imageBase64) return;

  btnScan.style.display = 'none';
  btnRetry.style.display = 'none';
  loading.classList.add('show');

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'scan', image: imageBase64 }),
      redirect: 'follow'
    });

    const result = await response.json();
    loading.classList.remove('show');

    if (result.status === 'success') {
      // フォームに値をセット
      FIELDS.forEach(f => {
        document.getElementById(f.id).value = result.data[f.key] || '';
      });
      editForm.classList.add('show');
      btnSave.style.display = 'block';
    } else {
      alert('読み取りエラー: ' + (result.message || '不明'));
      btnScan.style.display = 'block';
      btnRetry.style.display = 'block';
    }
  } catch (err) {
    loading.classList.remove('show');
    alert('通信エラー: ' + err.message);
    btnScan.style.display = 'block';
    btnRetry.style.display = 'block';
  }
});

// ===== 登録（編集後のデータをSheetsに書き込み） =====
btnSave.addEventListener('click', async () => {
  const cardData = {};
  FIELDS.forEach(f => {
    cardData[f.key] = document.getElementById(f.id).value;
  });

  btnSave.style.display = 'none';
  loading.textContent = '登録中...';
  loading.classList.add('show');

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'save', data: cardData }),
      redirect: 'follow'
    });

    const result = await response.json();
    loading.classList.remove('show');
    loading.textContent = '処理中...名刺を読み取っています';

    if (result.status === 'success') {
      editForm.classList.remove('show');
      statusMsg.textContent = cardData.name + ' / ' + cardData.company;
      status.classList.add('show');
      btnRetry.style.display = 'block';
    } else {
      alert('登録エラー: ' + (result.message || '不明'));
      btnSave.style.display = 'block';
    }
  } catch (err) {
    loading.classList.remove('show');
    loading.textContent = '処理中...名刺を読み取っています';
    // 送信は成功している可能性
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
      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'search', query: query }),
        redirect: 'follow'
      });

      const result = await response.json();

      if (result.status === 'success' && result.data.length > 0) {
        searchResults.innerHTML = result.data.map(card => `
          <div class="search-card">
            <div class="search-card-name">${card.name || '（氏名なし）'}</div>
            <div class="search-card-company">${card.company || ''}${card.title ? ' / ' + card.title : ''}</div>
            <div class="search-card-detail">
              ${card.mobile1 ? '📱 ' + card.mobile1 + '<br>' : ''}
              ${card.phone ? '📞 ' + card.phone + '<br>' : ''}
              ${card.email1 ? '✉ ' + card.email1 + '<br>' : ''}
              ${card.address ? '📍 ' + card.address : ''}
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
startCamera();
