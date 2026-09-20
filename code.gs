// ===== 設定 =====
const CONFIG = {
  VISION_API_KEY: 'YOUR_API_KEY',
  GEMINI_API_KEY: 'YOUR_API_KEY',
  // まず使うモデル（混雑時は下の候補へ自動切替）
  GEMINI_MODEL: 'gemini-3.5-flash',
  GEMINI_MODEL_FALLBACKS: [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest'
  ],
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_URL',
  SHEET_NAME: '名刺DB',
  DRIVE_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID',
  // フロントの secrets.js と同じ長いランダム文字列にする（GitHub に実値を上げない）
  API_TOKEN: 'YOUR_API_TOKEN'
};

// ===== リクエスト受信 =====
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!isValidToken(data.token)) {
      return jsonResponse({ status: 'error', message: 'Unauthorized' });
    }

    const action = data.action || 'scan_and_save';

    if (action === 'scan') {
      return handleScan(data.image, data.imageBack);
    } else if (action === 'save') {
      return handleSave(data.data, data.image, data.imageBack, data.faceImage);
    } else if (action === 'search') {
      return handleSearch(data.query);
    } else if (action === 'tags') {
      return handleListTags();
    } else {
      // 旧互換：scan_and_save
      return handleScanAndSave(data.image);
    }
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

function doGet(e) {
  // 生存確認のみ（データ操作なし）。トークン不要。
  return jsonResponse({ status: 'ok' });
}

function isValidToken(token) {
  const expected = CONFIG.API_TOKEN;
  if (!expected || expected === 'YOUR_API_TOKEN') {
    return false;
  }
  return token === expected;
}

// ===== スキャンのみ（編集用にデータを返す） =====
function handleScan(imageFront, imageBack) {
  if (!imageFront) {
    return jsonResponse({ status: 'error', message: '表面画像がありません' });
  }

  var frontOcr = '';
  var backOcr = '';
  var visionNotes = [];
  try {
    frontOcr = callVisionAPI(imageFront);
  } catch (e) {
    visionNotes.push('表OCR: ' + e.toString());
    Logger.log(visionNotes[visionNotes.length - 1]);
  }
  if (imageBack) {
    try {
      backOcr = callVisionAPI(imageBack);
    } catch (e) {
      visionNotes.push('裏OCR: ' + e.toString());
      Logger.log(visionNotes[visionNotes.length - 1]);
    }
  }

  var cardData;
  try {
    cardData = callGeminiAPI(imageFront, frontOcr, imageBack, backOcr);
  } catch (e) {
    return jsonResponse({
      status: 'error',
      message: 'AI読み取りに失敗しました: ' + e.toString()
    });
  }

  var faceBox = null;
  try {
    faceBox = detectFaceBox(imageFront);
  } catch (e) {
    Logger.log('顔検出スキップ: ' + e.toString());
  }

  if (visionNotes.length && cardData && !cardData.memo) {
    cardData.memo = '';
  }

  return jsonResponse({
    status: 'success',
    data: cardData,
    faceBox: faceBox
  });
}

// ===== 保存のみ（編集後のデータを書き込み） =====
function handleSave(cardData, imageFront, imageBack, faceImage) {
  var driveNotes = [];

  try {
    if (imageFront) {
      const frontInfo = saveImageToDrive(imageFront, cardData, 'front');
      cardData.frontImageUrl = frontInfo.driveUrl;
      cardData.frontFilename = frontInfo.filename;
    }
    if (imageBack) {
      const backInfo = saveImageToDrive(imageBack, cardData, 'back');
      cardData.backImageUrl = backInfo.driveUrl;
      cardData.backFilename = backInfo.filename;
    }
  } catch (driveErr) {
    // Drive権限未承認でも Sheets / 連絡先は続行する
    driveNotes.push('Drive保存スキップ: ' + driveErr.toString());
    Logger.log(driveNotes[driveNotes.length - 1]);
  }

  writeToSheet(cardData);

  // Google連絡先にも同期（顔写真＋名刺表）
  try {
    const existing = findContact(cardData.name);
    var person = null;
    if (existing) {
      person = updateContact(existing, cardData);
      cardData.contactStatus = '連絡先を更新しました';
    } else {
      person = createContact(cardData);
      cardData.contactStatus = '連絡先に新規登録しました';
    }

    const resourceName = (person && person.resourceName)
      ? person.resourceName
      : (existing && existing.resourceName);

    if (resourceName) {
      applyContactPhotos(resourceName, faceImage, imageFront);
      try {
        applyContactTags(resourceName, cardData.tags);
      } catch (tagErr) {
        cardData.contactStatus = (cardData.contactStatus || '') + ' / タグ: ' + tagErr.toString();
      }
    }
  } catch (e) {
    cardData.contactStatus = '連絡先同期エラー: ' + e.toString();
  }

  if (driveNotes.length > 0) {
    cardData.driveStatus = driveNotes.join(' / ');
    if (cardData.contactStatus) {
      cardData.contactStatus = cardData.contactStatus + ' / ' + cardData.driveStatus;
    } else {
      cardData.contactStatus = cardData.driveStatus;
    }
  }

  return jsonResponse({ status: 'success', data: cardData });
}

// ===== スキャン＋保存（旧互換） =====
function handleScanAndSave(imageBase64) {
  const ocrText = callVisionAPI(imageBase64);
  const cardData = callGeminiAPI(imageBase64, ocrText, '', '');
  writeToSheet(cardData);
  return jsonResponse({ status: 'success', data: cardData });
}

// ===== 検索 =====
function handleSearch(query) {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID === 'YOUR_SPREADSHEET_URL') {
    return jsonResponse({ status: 'error', message: 'SPREADSHEET_ID が未設定です' });
  }
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    return jsonResponse({ status: 'error', message: 'シート「' + CONFIG.SHEET_NAME + '」が見つかりません' });
  }
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return jsonResponse({ status: 'success', data: [] });
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, 19).getValues();
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
        row[8],  // 電話番号
        row[17], // タグ
        row[18]  // 登録日
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
      memo: row[14],
      frontImageUrl: row[15] || '',
      backImageUrl: row[16] || '',
      tags: row[17] || '',
      registeredDate: row[18] || ''
    }));

  return jsonResponse({ status: 'success', data: results });
}

// ===== Cloud Vision API =====
function callVisionAPI(imageBase64) {
  if (!CONFIG.VISION_API_KEY || CONFIG.VISION_API_KEY === 'YOUR_API_KEY') {
    throw new Error('VISION_API_KEY が未設定です');
  }
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
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Vision HTTP ' + code + ' ' + String(body).substring(0, 180));
  }

  const result = JSON.parse(body);
  const resp = result.responses && result.responses[0];
  if (resp && resp.error) {
    throw new Error('Vision: ' + (resp.error.message || JSON.stringify(resp.error)));
  }
  if (resp && resp.fullTextAnnotation) {
    return resp.fullTextAnnotation.text;
  }
  return '';
}

// ===== Gemini API（モデル自動フォールバック付き） =====
function geminiUrl(modelName) {
  return 'https://generativelanguage.googleapis.com/v1beta/models/' +
    modelName + ':generateContent?key=' + CONFIG.GEMINI_API_KEY;
}

function isRetryableGeminiError(code, body) {
  if (code === 429 || code === 503 || code === 500) return true;
  const textBody = String(body || '').toLowerCase();
  return textBody.indexOf('high demand') !== -1 ||
    textBody.indexOf('resource_exhausted') !== -1 ||
    textBody.indexOf('unavailable') !== -1 ||
    textBody.indexOf('overloaded') !== -1 ||
    textBody.indexOf('try again') !== -1;
}

function geminiFetch(requestBody) {
  const models = [CONFIG.GEMINI_MODEL]
    .concat(CONFIG.GEMINI_MODEL_FALLBACKS || [])
    .filter(function (m, i, arr) { return m && arr.indexOf(m) === i; });

  var lastError = '';

  for (var mi = 0; mi < models.length; mi++) {
    var modelName = models[mi];
    for (var attempt = 1; attempt <= 3; attempt++) {
      var response = UrlFetchApp.fetch(geminiUrl(modelName), {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(requestBody),
        muteHttpExceptions: true
      });
      var code = response.getResponseCode();
      var body = response.getContentText();

      if (code >= 200 && code < 300) {
        return JSON.parse(body);
      }

      lastError = 'HTTP ' + code + ' / モデル=' + modelName + ' / ' + body.substring(0, 250);

      if (isRetryableGeminiError(code, body)) {
        Utilities.sleep(1500 * attempt);
        continue;
      }

      // 404などリトライ不可 → 次のモデルへ
      break;
    }
  }

  throw new Error('Geminiエラー（混雑またはモデル不可）: ' + lastError);
}

function callGeminiAPI(imageFront, frontOcr, imageBack, backOcr) {
  var sideNote = '';
  if (imageBack && backOcr) {
    sideNote = `
【裏面OCRテキスト】
${backOcr}

表で足りない項目（住所・メール・電話・部門など）は裏面から補完してください。
表と裏で矛盾する場合は表を優先し、裏にしかない情報を追加してください。`;
  } else if (imageBack) {
    sideNote = `
裏面画像も添付しています。表で足りない項目は裏面から補完してください。`;
  }

  const prompt = `あなたは名刺データ抽出の専門家です。
以下のOCRテキストと名刺画像から、正確に情報を抽出してください。
OCRの読み取りミスがあれば文脈から補正してください。
${sideNote}

【表面OCRテキスト】
${frontOcr}

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

  const parts = [
    { text: prompt },
    {
      inline_data: {
        mime_type: 'image/jpeg',
        data: imageFront
      }
    }
  ];

  if (imageBack) {
    parts.push({ text: '【裏面画像】' });
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: imageBack
      }
    });
  }

  const requestBody = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const result = geminiFetch(requestBody);
  const outText = result.candidates && result.candidates[0] &&
    result.candidates[0].content && result.candidates[0].content.parts &&
    result.candidates[0].content.parts[0] && result.candidates[0].content.parts[0].text;
  if (!outText) {
    throw new Error('Geminiから空の応答が返りました');
  }
  return parseGeminiJson(outText);
}

function parseGeminiJson(text) {
  var raw = String(text || '').trim();
  if (raw.indexOf('```') === 0) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    var start = raw.indexOf('{');
    var end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(raw.substring(start, end + 1));
    }
    throw new Error('GeminiのJSON解析に失敗: ' + raw.substring(0, 120));
  }
}

// ===== 顔検出（Vision FACE_DETECTION） =====
function detectFaceBox(imageBase64) {
  try {
    const url = 'https://vision.googleapis.com/v1/images:annotate?key=' + CONFIG.VISION_API_KEY;
    const requestBody = {
      requests: [{
        image: { content: imageBase64 },
        features: [{ type: 'FACE_DETECTION', maxResults: 3 }]
      }]
    };

    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      return null;
    }

    const result = JSON.parse(response.getContentText());
    const faces = result.responses && result.responses[0] && result.responses[0].faceAnnotations;
    if (!faces || faces.length === 0) return null;

    // 最大の顔を採用
    var best = null;
    var bestArea = 0;
    faces.forEach(function (face) {
      const v = face.boundingPoly && face.boundingPoly.vertices;
      if (!v || v.length < 2) return;
      const xs = v.map(function (p) { return p.x || 0; });
      const ys = v.map(function (p) { return p.y || 0; });
      const left = Math.min.apply(null, xs);
      const right = Math.max.apply(null, xs);
      const top = Math.min.apply(null, ys);
      const bottom = Math.max.apply(null, ys);
      const area = Math.max(0, right - left) * Math.max(0, bottom - top);
      if (area > bestArea) {
        bestArea = area;
        best = { left: left, top: top, right: right, bottom: bottom };
      }
    });

    return best;
  } catch (e) {
    return null;
  }
}

// ===== Drive に名刺画像保存 =====
function saveImageToDrive(imageBase64, cardData, side) {
  if (!CONFIG.DRIVE_FOLDER_ID || CONFIG.DRIVE_FOLDER_ID === 'YOUR_DRIVE_FOLDER_ID') {
    throw new Error('DRIVE_FOLDER_ID が未設定です。DriveフォルダIDを CONFIG に入れてください。');
  }

  const now = new Date();
  const stamp = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  const nameSafe = String(cardData.name || 'meishi')
    .replace(/[\\/:*?"<>|]/g, '_')
    .substring(0, 30);
  const filename = 'meishi_' + stamp + '_' + nameSafe + '_' + side + '.jpg';

  const blob = Utilities.newBlob(
    Utilities.base64Decode(imageBase64),
    'image/jpeg',
    filename
  );

  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (shareErr) {
    // 共有設定に失敗してもファイル自体は保存できている
    Logger.log('Drive共有設定スキップ: ' + shareErr.toString());
  }

  return {
    filename: filename,
    driveUrl: file.getUrl(),
    fileId: file.getId()
  };
}

// ===== Google Sheets 書き込み =====
function writeToSheet(cardData) {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID === 'YOUR_SPREADSHEET_URL') {
    throw new Error('SPREADSHEET_ID が未設定です');
  }
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    throw new Error('シート「' + CONFIG.SHEET_NAME + '」が見つかりません');
  }

  const now = new Date();
  const timestamp = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  ensureSheetTagHeaders(sheet);

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
    cardData.memo || '',
    cardData.frontImageUrl || '',
    cardData.backImageUrl || '',
    normalizeTagNames(cardData.tags).join(', '),
    cardData.registeredDate || Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd')
  ]);
}

function ensureSheetTagHeaders(sheet) {
  const headers = sheet.getRange(1, 1, 1, 19).getValues()[0];
  if (!headers[17]) sheet.getRange(1, 18).setValue('タグ');
  if (!headers[18]) sheet.getRange(1, 19).setValue('登録日');
}

function normalizeTagNames(tags) {
  var list = [];
  if (Array.isArray(tags)) {
    list = tags;
  } else if (tags) {
    list = String(tags).split(/[,、\n]/);
  }
  var seen = {};
  var out = [];
  list.forEach(function (t) {
    var name = String(t || '').trim();
    if (!name || seen[name]) return;
    seen[name] = true;
    out.push(name);
  });
  return out;
}

function handleListTags() {
  try {
    return jsonResponse({ status: 'success', data: listContactTags() });
  } catch (e) {
    return jsonResponse({ status: 'error', message: 'タグ取得に失敗: ' + e.toString() });
  }
}

function isSystemContactGroup(group) {
  var rn = (group && group.resourceName) || '';
  if (rn === 'contactGroups/myContacts' ||
      rn === 'contactGroups/all' ||
      rn === 'contactGroups/starred' ||
      rn === 'contactGroups/blocked' ||
      rn.indexOf('contactGroups/chatBuddies') === 0) {
    return true;
  }
  return group && group.groupType === 'SYSTEM_CONTACT_GROUP';
}

function listContactTags() {
  var groups = [];
  var pageToken = '';
  do {
    var params = {
      pageSize: 1000,
      groupFields: 'name,memberCount,groupType'
    };
    if (pageToken) params.pageToken = pageToken;
    var res = People.ContactGroups.list(params);
    var batch = (res && res.contactGroups) || [];
    batch.forEach(function (g) {
      if (!g || !g.name || isSystemContactGroup(g)) return;
      groups.push({
        name: g.name,
        resourceName: g.resourceName || '',
        memberCount: Number(g.memberCount || 0)
      });
    });
    pageToken = (res && res.nextPageToken) || '';
  } while (pageToken);

  groups.sort(function (a, b) {
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    return String(a.name).localeCompare(String(b.name), 'ja');
  });
  return groups;
}

function findContactGroupByName(name, groups) {
  name = String(name || '').trim();
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].name === name) return groups[i];
  }
  return null;
}

function createContactGroup(name) {
  var created = People.ContactGroups.create({
    contactGroup: { name: name }
  });
  var group = (created && created.contactGroup) ? created.contactGroup : created;
  return {
    name: (group && group.name) || name,
    resourceName: group && group.resourceName,
    memberCount: 0
  };
}

function applyContactTags(personResourceName, tags) {
  var names = normalizeTagNames(tags);
  if (!personResourceName || names.length === 0) return;

  var groups = listContactTags();
  names.forEach(function (tagName) {
    var group = findContactGroupByName(tagName, groups);
    if (!group) {
      group = createContactGroup(tagName);
      groups.push(group);
    }
    if (!group.resourceName) return;
    People.ContactGroups.Members.modify({
      resourceNamesToAdd: [personResourceName]
    }, group.resourceName);
  });
}

// ===== JSON レスポンス =====
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== テスト =====
// Apps Script エディタで testSetup を実行し、Drive権限の承認ダイアログが出たら許可する
function testListTags() {
  const tags = listContactTags();
  Logger.log('タグ件数: ' + tags.length);
  tags.slice(0, 30).forEach(function (t) {
    Logger.log((t.memberCount || 0) + ' : ' + t.name + ' / ' + t.resourceName);
  });
}

function testSetup() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  Logger.log('シート接続OK: ' + sheet.getName());
  Logger.log('現在の行数: ' + sheet.getLastRow());

  if (!CONFIG.DRIVE_FOLDER_ID || CONFIG.DRIVE_FOLDER_ID === 'YOUR_DRIVE_FOLDER_ID') {
    Logger.log('DRIVE_FOLDER_ID が未設定です');
    return;
  }

  try {
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    Logger.log('DriveフォルダOK: ' + folder.getName() + ' / id=' + folder.getId());
  } catch (e) {
    Logger.log('Drive接続エラー: ' + e.toString());
    Logger.log('対処: この関数を再実行して権限を承認するか、フォルダIDが自分のDriveのものか確認');
    throw e;
  }
}

// Drive権限だけ先に承認したいとき用（エディタで実行）
// createFile まで実行して Drive 書き込み権限を要求する
function authorizeDrive() {
  if (!CONFIG.DRIVE_FOLDER_ID || CONFIG.DRIVE_FOLDER_ID === 'YOUR_DRIVE_FOLDER_ID') {
    throw new Error('先に CONFIG.DRIVE_FOLDER_ID を正しいフォルダIDに設定してください');
  }

  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  Logger.log('フォルダOK: ' + folder.getName());

  const blob = Utilities.newBlob(
    'meishi-ocr drive auth ok ' + new Date().toISOString(),
    'text/plain',
    'meishi-ocr-auth-test.txt'
  );
  const file = folder.createFile(blob);
  Logger.log('createFile OK: ' + file.getUrl());
  file.setTrashed(true);
  Logger.log('Drive書き込み権限の承認が完了しました。ウェブアプリを新バージョンで再デプロイしてください。');
}

// ===== Geminiモデル確認（Apps Scriptでこの関数を実行） =====
function testGeminiModel() {
  Logger.log('CONFIG.GEMINI_MODEL = ' + CONFIG.GEMINI_MODEL);
  Logger.log('FALLBACKS = ' + JSON.stringify(CONFIG.GEMINI_MODEL_FALLBACKS || []));

  const listUrl = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + CONFIG.GEMINI_API_KEY;
  const listRes = UrlFetchApp.fetch(listUrl, { muteHttpExceptions: true });
  Logger.log('models list HTTP ' + listRes.getResponseCode());

  const ping = {
    contents: [{ parts: [{ text: 'Reply with OK' }] }],
    generationConfig: { temperature: 0 }
  };
  try {
    const result = geminiFetch(ping);
    Logger.log('ping OK: ' + JSON.stringify(result).substring(0, 300));
  } catch (e) {
    Logger.log('ping FAIL: ' + e.toString());
  }
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

  const result = geminiFetch(requestBody);
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
  return People.People.createContact(contactBody);
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

  return People.People.updateContact(contactBody, resourceName, {
    updatePersonFields: 'names,emailAddresses,phoneNumbers,organizations,addresses,urls,biographies'
  });
}

// ===== 連絡先写真 =====
// People API で書き込める写真スロットは実質1つ。
// - 顔あり: くり抜いた顔 → 連絡先の顔写真
// - 顔なし: 名刺表 → 連絡先写真（詳細の大きな表示＝バック相当）
// 名刺表・裏の原本は常に Drive + urls / メモにも残す（バック画像として参照可能）
function applyContactPhotos(resourceName, faceImageBase64, frontImageBase64) {
  if (faceImageBase64) {
    People.People.updateContactPhoto({
      photoBytes: faceImageBase64,
      personFields: 'photos'
    }, resourceName);
  } else if (frontImageBase64) {
    People.People.updateContactPhoto({
      photoBytes: frontImageBase64,
      personFields: 'photos,coverPhotos'
    }, resourceName);
  }
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
  
  // ウェブサイト・名刺画像リンク
  const urls = [];
  if (data.website) {
    urls.push({ value: data.website, type: 'work' });
  }
  if (data.frontImageUrl) {
    urls.push({ value: data.frontImageUrl, type: '名刺表' });
  }
  if (data.backImageUrl) {
    urls.push({ value: data.backImageUrl, type: '名刺裏' });
  }
  if (urls.length > 0) body.urls = urls;
  
  // メモ（名刺画像リンク・登録日・タグも併記）
  const bioParts = [];
  if (data.registeredDate) bioParts.push('登録日: ' + data.registeredDate);
  const tagNames = normalizeTagNames(data.tags);
  if (tagNames.length) bioParts.push('タグ: ' + tagNames.join(', '));
  if (data.memo) bioParts.push(data.memo);
  if (data.frontImageUrl) bioParts.push('名刺表: ' + data.frontImageUrl);
  if (data.backImageUrl) bioParts.push('名刺裏: ' + data.backImageUrl);
  if (bioParts.length > 0) {
    body.biographies = [{
      value: bioParts.join('\n'),
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
