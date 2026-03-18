// ===== 設定 =====
const CONFIG = {
  VISION_API_KEY: 'YOUR_API_KEY',
  GEMINI_API_KEY: 'YOUR_API_KEY',
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_URL',
  SHEET_NAME: '名刺DB'
};

// ===== リクエスト受信 =====
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || 'scan_and_save';

    if (action === 'scan') {
      return handleScan(data.image);
    } else if (action === 'save') {
      return handleSave(data.data);
    } else if (action === 'search') {
      return handleSearch(data.query);
    } else {
      // 旧互換：scan_and_save
      return handleScanAndSave(data.image);
    }
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

function doGet(e) {
  return jsonResponse({ status: 'ok' });
}

// ===== スキャンのみ（編集用にデータを返す） =====
function handleScan(imageBase64) {
  const ocrText = callVisionAPI(imageBase64);
  const cardData = callGeminiAPI(imageBase64, ocrText);
  return jsonResponse({ status: 'success', data: cardData });
}

// ===== 保存のみ（編集後のデータを書き込み） =====
function handleSave(cardData) {
  writeToSheet(cardData);
  
  // Google連絡先にも同期
  try {
    const existing = findContact(cardData.name);
    if (existing) {
      updateContact(existing, cardData);
      cardData.contactStatus = '連絡先を更新しました';
    } else {
      createContact(cardData);
      cardData.contactStatus = '連絡先に新規登録しました';
    }
  } catch (e) {
    cardData.contactStatus = '連絡先同期エラー: ' + e.toString();
  }
  
  return jsonResponse({ status: 'success', data: cardData });
}

// ===== スキャン＋保存（旧互換） =====
function handleScanAndSave(imageBase64) {
  const ocrText = callVisionAPI(imageBase64);
  const cardData = callGeminiAPI(imageBase64, ocrText);
  writeToSheet(cardData);
  return jsonResponse({ status: 'success', data: cardData });
}

// ===== 検索 =====
function handleSearch(query) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return jsonResponse({ status: 'success', data: [] });
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
  const queryLower = query.toLowerCase();

  const results = dataRange
    .filter(row => {
      const searchTarget = [
        row[1],  // 氏名
        row[2],  // ふりがな
        row[3],  // 会社名
        row[4],  // 部門
        row[5],  // 役職
        row[10], // メールアドレス1
        row[6],  // 携帯電話1
        row[8]   // 電話番号
      ].join(' ').toLowerCase();
      return searchTarget.indexOf(queryLower) !== -1;
    })
    .slice(0, 20)
    .map(row => ({
      name: row[1],
      furigana: row[2],
      company: row[3],
      department: row[4],
      title: row[5],
      mobile1: row[6],
      mobile2: row[7],
      phone: row[8],
      fax: row[9],
      email1: row[10],
      email2: row[11],
      address: row[12],
      website: row[13],
      memo: row[14]
    }));

  return jsonResponse({ status: 'success', data: results });
}

// ===== Cloud Vision API =====
function callVisionAPI(imageBase64) {
  const url = 'https://vision.googleapis.com/v1/images:annotate?key=' + CONFIG.VISION_API_KEY;

  const requestBody = {
    requests: [{
      image: { content: imageBase64 },
      features: [{ type: 'TEXT_DETECTION' }]
    }]
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody)
  });

  const result = JSON.parse(response.getContentText());

  if (result.responses[0].fullTextAnnotation) {
    return result.responses[0].fullTextAnnotation.text;
  }
  return '';
}

// ===== Gemini API =====
function callGeminiAPI(imageBase64, ocrText) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + CONFIG.GEMINI_API_KEY;

  const prompt = `あなたは名刺データ抽出の専門家です。
以下のOCRテキストと名刺画像から、正確に情報を抽出してください。
OCRの読み取りミスがあれば文脈から補正してください。

【OCRテキスト】
${ocrText}

【出力形式】必ず以下のJSON形式のみで返してください。余計な説明は不要です。
{
  "name": "氏名（漢字）",
  "furigana": "ふりがな（ひらがな）",
  "company": "会社名",
  "department": "部門",
  "title": "役職",
  "mobile1": "携帯電話1",
  "mobile2": "携帯電話2",
  "phone": "電話番号",
  "fax": "FAX番号",
  "email1": "メールアドレス1",
  "email2": "メールアドレス2",
  "address": "住所",
  "website": "ウェブページ",
  "memo": ""
}

該当情報がない項目は空文字にしてください。
ふりがなは名刺に記載がなくても、漢字氏名から推測してひらがなで記入してください。`;

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: 'image/jpeg',
            data: imageBase64
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody)
  });

  const result = JSON.parse(response.getContentText());
  const text = result.candidates[0].content.parts[0].text;

  return JSON.parse(text);
}

// ===== Google Sheets 書き込み =====
function writeToSheet(cardData) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  const now = new Date();
  const timestamp = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  sheet.appendRow([
    timestamp,
    cardData.name || '',
    cardData.furigana || '',
    cardData.company || '',
    cardData.department || '',
    cardData.title || '',
    cardData.mobile1 || '',
    cardData.mobile2 || '',
    cardData.phone || '',
    cardData.fax || '',
    cardData.email1 || '',
    cardData.email2 || '',
    cardData.address || '',
    cardData.website || '',
    cardData.memo || ''
  ]);
}

// ===== JSON レスポンス =====
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== テスト =====
function testSetup() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  Logger.log('シート接続OK: ' + sheet.getName());
  Logger.log('現在の行数: ' + sheet.getLastRow());
}
// ===== CAMCARDデータ移行 =====
function migrateCAMCARD() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const oldSheet = ss.getSheetByName('Export VCF');
  const newSheet = ss.getSheetByName('名刺DB');
  
  if (!oldSheet) {
    Logger.log('エラー: Export VCFタブが見つかりません');
    return;
  }
  
  const lastRow = oldSheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('移行するデータがありません');
    return;
  }
  
  const oldData = oldSheet.getRange(2, 1, lastRow - 1, 48).getValues();
  let count = 0;
  
  oldData.forEach(row => {
    // 空行スキップ（お名前も苗字もない行）
    if (!row[1] && !row[2]) return;
    
    // 旧列マッピング
    const timestamp = row[0] || '';  // A: 作成時間
    const fullName = row[1] || '';   // B: お名前
    const lastName = row[2] || '';   // C: 苗字
    const firstName = row[3] || '';  // D: 名前
    
    // 氏名：「お名前」があればそれを使う、なければ苗字+名前
    const name = fullName || ((lastName + ' ' + firstName).trim());
    
    // 会社名：会社名1を優先
    const company = row[6] || row[9] || row[12] || '';  // G, J, M
    
    // 部門：部門1を優先
    const department = row[7] || row[10] || row[13] || '';  // H, K, N
    
    // 役職：役職1を優先
    const title = row[8] || row[11] || row[14] || '';  // I, L, O
    
    // 携帯電話
    const mobile1 = row[15] || '';  // P: 携帯電話1
    const mobile2 = row[16] || '';  // Q: 携帯電話2
    
    // 電話番号
    const phone = row[18] || '';    // S: 電話番号1
    
    // FAX
    const fax = row[21] || '';      // V: Fax1
    
    // メールアドレス
    const email1 = row[24] || '';   // Y: メールアドレス1
    const email2 = row[25] || '';   // Z: メールアドレス2
    
    // 住所：国名〜郵便番号を結合
    const addr1Parts = [
      row[32] || '',  // AG: 郵便番号
      row[27] || '',  // AB: 国名
      row[28] || '',  // AC: 都道府県
      row[29] || '',  // AD: 市
      row[30] || '',  // AE: 町1
      row[31] || ''   // AF: 町2
    ].filter(v => v !== '');
    const address = addr1Parts.length > 0 ? addr1Parts.join(' ') : (row[39] || '');
    
    // ウェブページ
    const website = row[40] || '';  // AO: ウェブページ
    
    // メモ：メモ1〜3を結合
    const memos = [
      row[45] || '',  // メモ1
      row[46] || '',  // メモ2
      row[47] || ''   // メモ3
    ].filter(v => v !== '');
    const memo = memos.join(' / ');
    
    // ふりがな：旧データにはないので空欄
    const furigana = '';
    
    // 新シートに追加
    newSheet.appendRow([
      timestamp,
      name,
      furigana,
      company,
      department,
      title,
      mobile1,
      mobile2,
      phone,
      fax,
      email1,
      email2,
      address,
      website,
      memo
    ]);
    
    count++;
  });
  
  Logger.log('移行完了: ' + count + '件');
}
// ===== ふりがな一括推測 =====
function generateFurigana() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    Logger.log('データがありません');
    return;
  }
  
  // B列（氏名）とC列（ふりがな）を取得
  const names = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  const furigana = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
  
  // ふりがなが空欄の行を収集（最大50件ずつ）
  const BATCH_SIZE = 50;
  const targets = [];
  
  for (let i = 0; i < names.length; i++) {
    if (names[i][0] && !furigana[i][0]) {
      targets.push({ row: i + 2, name: names[i][0] });
    }
    if (targets.length >= BATCH_SIZE) break;
  }
  
  if (targets.length === 0) {
    Logger.log('ふりがな未設定のデータはありません');
    return;
  }
  
  // 名前リストをGeminiに一括で送る
  const nameList = targets.map((t, idx) => `${idx + 1}. ${t.name}`).join('\n');
  
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + CONFIG.GEMINI_API_KEY;
  
  const prompt = `以下の日本語の氏名リストに対して、ひらがなでふりがなを付けてください。
外国人名の場合はカタカナではなく、できるだけひらがなで音を表記してください。
必ず以下のJSON配列形式のみで返してください。余計な説明は不要です。

【氏名リスト】
${nameList}

【出力形式】
[
  {"index": 1, "furigana": "やまだ たろう"},
  {"index": 2, "furigana": "すずき はなこ"}
]`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };
  
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody)
  });
  
  const result = JSON.parse(response.getContentText());
  const text = result.candidates[0].content.parts[0].text;
  const furiganaList = JSON.parse(text);
  
  // シートに書き込み
  let count = 0;
  furiganaList.forEach(item => {
    const idx = item.index - 1;
    if (idx >= 0 && idx < targets.length && item.furigana) {
      sheet.getRange(targets[idx].row, 3).setValue(item.furigana);
      count++;
    }
  });
  
  const remaining = names.filter((n, i) => n[0] && !furigana[i][0]).length - count;
  Logger.log('ふりがな設定: ' + count + '件完了 / 残り約' + remaining + '件');
  
  if (remaining > 0) {
    Logger.log('まだ残りがあります。もう一度 generateFurigana を実行してください。');
  }
}

// ===== ふりがな自動繰り返し（トリガー用） =====
function generateFuriganaAll() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) return;
  
  const furigana = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
  const names = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  
  const remaining = names.filter((n, i) => n[0] && !furigana[i][0]).length;
  
  if (remaining === 0) {
    Logger.log('全件完了しています');
    // トリガーがあれば削除
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => {
      if (t.getHandlerFunction() === 'generateFuriganaAll') {
        ScriptApp.deleteTrigger(t);
      }
    });
    return;
  }
  
  Logger.log('残り' + remaining + '件。処理開始...');
  generateFurigana();
}

// ===== ふりがな処理を自動で繰り返すトリガー設定 =====
function startFuriganaJob() {
  // 既存トリガー削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'generateFuriganaAll') {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  // 1分おきに実行するトリガーを作成
  ScriptApp.newTrigger('generateFuriganaAll')
    .timeBased()
    .everyMinutes(1)
    .create();
  
  Logger.log('ふりがな自動処理トリガーを設定しました。50件ずつ1分おきに処理します。');
  Logger.log('全件完了すると自動でトリガーが削除されます。');
  Logger.log('1,117件 ÷ 50件 = 約23回 ≒ 約23分で完了予定');
}
// ===== 電話番号先頭0修正 =====
function fixPhoneNumbers() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    Logger.log('データがありません');
    return;
  }
  
  // 対象列: G(7)携帯1, H(8)携帯2, I(9)電話, J(10)FAX
  const phoneCols = [7, 8, 9, 10];
  let fixCount = 0;
  
  phoneCols.forEach(col => {
    const values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
    
    values.forEach((row, i) => {
      let val = String(row[0]).trim();
      if (!val || val === '' || val === '0') return;
      
      // 既に+で始まる国番号付きはスキップ
      if (val.startsWith('+')) return;
      
      // 既に0で始まるものはスキップ
      if (val.startsWith('0')) return;
      
      // 日本の電話番号パターンの判定
      // 携帯: 70, 80, 90 で始まる → 先頭に0を付ける
      // 固定: 1〜9 で始まる → 先頭に0を付ける
      // FAX: 同上
      if (val.match(/^[1-9][0-9\-\s]{7,}/)) {
        sheet.getRange(i + 2, col).setValue("'" + '0' + val);
        fixCount++;
      }
    });
  });
  
  Logger.log('電話番号修正完了: ' + fixCount + '件');
}
// ===== Google連絡先同期 =====
function syncToContacts() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    Logger.log('データがありません');
    return;
  }
  
  const data = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  data.forEach((row, idx) => {
    const name = row[1];
    if (!name) return;
    
    const cardData = {
      name: row[1],
      furigana: row[2],
      company: row[3],
      department: row[4],
      title: row[5],
      mobile1: row[6],
      mobile2: row[7],
      phone: row[8],
      fax: row[9],
      email1: row[10],
      email2: row[11],
      address: row[12],
      website: row[13],
      memo: row[14]
    };
    
    try {
      // 既存の連絡先を検索
      const existing = findContact(name);
      
      if (existing) {
        // 既存あり → 上書き更新
        updateContact(existing, cardData);
        updated++;
      } else {
        // 新規作成
        createContact(cardData);
        created++;
      }
      
      // API レートリミット対策
      if ((idx + 1) % 10 === 0) {
        Utilities.sleep(1000);
      }
    } catch (e) {
      Logger.log('エラー（行' + (idx + 2) + ' ' + name + '）: ' + e.toString());
      skipped++;
    }
  });
  
  Logger.log('===== 同期完了 =====');
  Logger.log('新規作成: ' + created + '件');
  Logger.log('上書き更新: ' + updated + '件');
  Logger.log('スキップ: ' + skipped + '件');
}

// ===== 連絡先検索 =====
function findContact(name) {
  try {
    const response = People.People.searchContacts({
      query: name,
      readMask: 'names,emailAddresses,phoneNumbers'
    });
    
    if (response.results && response.results.length > 0) {
      // 名前が完全一致するものを探す
      for (let i = 0; i < response.results.length; i++) {
        const person = response.results[i].person;
        if (person.names) {
          for (let j = 0; j < person.names.length; j++) {
            if (person.names[j].displayName === name ||
                person.names[j].unstructuredName === name) {
              return person;
            }
          }
        }
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ===== 連絡先新規作成 =====
function createContact(data) {
  const contactBody = buildContactBody(data);
  People.People.createContact(contactBody);
}

// ===== 連絡先更新 =====
function updateContact(existing, data) {
  const resourceName = existing.resourceName;
  
  // 現在のetagを取得
  const current = People.People.get(resourceName, {
    personFields: 'names,emailAddresses,phoneNumbers,organizations,addresses,urls,biographies,metadata'
  });
  
  const contactBody = buildContactBody(data);
  contactBody.etag = current.etag;
  
  People.People.updateContact(contactBody, resourceName, {
    updatePersonFields: 'names,emailAddresses,phoneNumbers,organizations,addresses,urls,biographies'
  });
}

// ===== 連絡先データ構築 =====
function buildContactBody(data) {
  const body = {};
  
  // 氏名
  if (data.name) {
    const nameParts = data.name.split(/[\s　]+/);
    body.names = [{
      unstructuredName: data.name,
      familyName: nameParts[0] || '',
      givenName: nameParts.slice(1).join(' ') || ''
    }];
    
    // ふりがな
    if (data.furigana) {
      const furiParts = data.furigana.split(/[\s　]+/);
      body.names[0].phoneticFamilyName = furiParts[0] || '';
      body.names[0].phoneticGivenName = furiParts.slice(1).join(' ') || '';
    }
  }
  
  // 電話番号
  const phones = [];
  if (data.mobile1) phones.push({ value: String(data.mobile1), type: 'mobile' });
  if (data.mobile2) phones.push({ value: String(data.mobile2), type: 'mobile' });
  if (data.phone) phones.push({ value: String(data.phone), type: 'work' });
  if (data.fax) phones.push({ value: String(data.fax), type: 'workFax' });
  if (phones.length > 0) body.phoneNumbers = phones;
  
  // メールアドレス
  const emails = [];
  if (data.email1) emails.push({ value: data.email1, type: 'work' });
  if (data.email2) emails.push({ value: data.email2, type: 'other' });
  if (emails.length > 0) body.emailAddresses = emails;
  
  // 会社・部門・役職
  if (data.company || data.department || data.title) {
    body.organizations = [{
      name: data.company || '',
      department: data.department || '',
      title: data.title || ''
    }];
  }
  
  // 住所
  if (data.address) {
    body.addresses = [{
      formattedValue: data.address,
      type: 'work'
    }];
  }
  
  // ウェブサイト
  if (data.website) {
    body.urls = [{
      value: data.website,
      type: 'work'
    }];
  }
  
  // メモ
  if (data.memo) {
    body.biographies = [{
      value: data.memo,
      contentType: 'TEXT_PLAIN'
    }];
  }
  
  return body;
}

// ===== バッチ同期（時間制限対策・100件ずつ） =====
function syncToContactsBatch() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    Logger.log('データがありません');
    return;
  }
  
  // 進捗管理（スクリプトプロパティに保存）
  const props = PropertiesService.getScriptProperties();
  let startIdx = parseInt(props.getProperty('syncIndex') || '0');
  
  const data = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
  const BATCH_SIZE = 50;
  const endIdx = Math.min(startIdx + BATCH_SIZE, data.length);
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  for (let i = startIdx; i < endIdx; i++) {
    const row = data[i];
    const name = row[1];
    if (!name) { skipped++; continue; }
    
    const cardData = {
      name: row[1],
      furigana: row[2],
      company: row[3],
      department: row[4],
      title: row[5],
      mobile1: row[6],
      mobile2: row[7],
      phone: row[8],
      fax: row[9],
      email1: row[10],
      email2: row[11],
      address: row[12],
      website: row[13],
      memo: row[14]
    };
    
    try {
      const existing = findContact(name);
      if (existing) {
        updateContact(existing, cardData);
        updated++;
      } else {
        createContact(cardData);
        created++;
      }
      Utilities.sleep(500);
    } catch (e) {
      Logger.log('エラー（' + name + '）: ' + e.toString());
      skipped++;
    }
  }
  
  props.setProperty('syncIndex', String(endIdx));
  
  Logger.log('===== バッチ ' + (startIdx + 1) + '〜' + endIdx + ' / ' + data.length + ' =====');
  Logger.log('新規: ' + created + ' / 更新: ' + updated + ' / スキップ: ' + skipped);
  
  if (endIdx >= data.length) {
    Logger.log('全件同期完了！');
    props.deleteProperty('syncIndex');
    // トリガー削除
    ScriptApp.getProjectTriggers().forEach(t => {
      if (t.getHandlerFunction() === 'syncToContactsBatch') {
        ScriptApp.deleteTrigger(t);
      }
    });
  }
}

// ===== 連絡先同期トリガー開始 =====
function startContactSync() {
  // 進捗リセット
  PropertiesService.getScriptProperties().setProperty('syncIndex', '0');
  
  // 既存トリガー削除
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncToContactsBatch') {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  // 5分おきに実行
  ScriptApp.newTrigger('syncToContactsBatch')
    .timeBased()
    .everyMinutes(5)
    .create();
  
  Logger.log('連絡先同期を開始しました。50件ずつ5分おきに処理します。');
  Logger.log('1,117件 ÷ 50件 = 約23回 ≒ 約46分で完了予定');
  
  // 初回即実行
  syncToContactsBatch();
}
