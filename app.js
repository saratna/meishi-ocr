// ===== ここにGASのウェブアプリURLを貼る =====
const GAS_URL = 'https://script.google.com/macros/s/AKfycbz9xDQyBcK0VJ_hV7XssOA5SoLuK_yv08DQp99Q-yiVoVohkiP_7MesINuNeJo6leA/exec';

// ===== 要素取得 =====
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const preview = document.getElementById('preview');
const btnCapture = document.getElementById('btnCapture');
const btnSend = document.getElementById('btnSend');
const btnRetry = document.getElementById('btnRetry');
const loading = document.getElementById('loading');
const status = document.getElementById('status');
const resultContent = document.getElementById('resultContent');

let imageBase64 = '';

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

  // JPEG品質0.9で圧縮
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  imageBase64 = dataUrl.split(',')[1];

  // プレビュー表示
  preview.src = dataUrl;
  preview.style.display = 'block';
  video.style.display = 'none';
  btnCapture.style.display = 'none';
  btnSend.style.display = 'block';
  btnRetry.style.display = 'block';
  status.classList.remove('show');
});

// ===== 撮り直し =====
btnRetry.addEventListener('click', () => {
  preview.style.display = 'none';
  video.style.display = 'block';
  btnCapture.style.display = 'block';
  btnSend.style.display = 'none';
  btnRetry.style.display = 'none';
  status.classList.remove('show');
  imageBase64 = '';
});

// ===== 送信・登録 =====
btnSend.addEventListener('click', async () => {
  if (!imageBase64) return;

  btnSend.style.display = 'none';
  btnRetry.style.display = 'none';
  loading.classList.add('show');
  status.classList.remove('show');

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 }),
      mode: 'no-cors'
    });

    // no-corsモードではレスポンスが読めないため、
    // 成功前提で処理（GAS側でエラーハンドリング済み）
    loading.classList.remove('show');
    
    // GASからレスポンスを取得する代替方法
    // no-corsの場合はリダイレクト方式を使う
    await fetchWithRedirect(imageBase64);

  } catch (err) {
    loading.classList.remove('show');
    alert('エラーが発生しました: ' + err.message);
    btnSend.style.display = 'block';
    btnRetry.style.display = 'block';
  }
});

// ===== GASへの送信（リダイレクト対応版） =====
async function fetchWithRedirect(base64) {
  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ image: base64 }),
      redirect: 'follow'
    });

    const result = await response.json();

    loading.classList.remove('show');

    if (result.status === 'success') {
      showResult(result.data);
    } else {
      alert('処理エラー: ' + (result.message || '不明なエラー'));
      btnSend.style.display = 'block';
      btnRetry.style.display = 'block';
    }
  } catch (err) {
    loading.classList.remove('show');

    // レスポンス読み取り不可の場合でも送信は成功している可能性
    resultContent.innerHTML = '<p>送信しました。スプレッドシートを確認してください。</p>';
    status.classList.add('show');
    btnRetry.style.display = 'block';
  }
}

// ===== 結果表示 =====
function showResult(data) {
  const fields = [
    ['氏名', data.name],
    ['ふりがな', data.furigana],
    ['会社名', data.company],
    ['部門', data.department],
    ['役職', data.title],
    ['携帯電話1', data.mobile1],
    ['携帯電話2', data.mobile2],
    ['電話番号', data.phone],
    ['FAX', data.fax],
    ['メール1', data.email1],
    ['メール2', data.email2],
    ['住所', data.address],
    ['Web', data.website]
  ];

  resultContent.innerHTML = fields
    .filter(([_, val]) => val && val.length > 0)
    .map(([label, val]) => `
      <div class="result-row">
        <span class="result-label">${label}</span>
        <span class="result-value">${val}</span>
      </div>
    `).join('');

  status.classList.add('show');
  btnRetry.style.display = 'block';
}

// ===== 起動 =====
startCamera();
