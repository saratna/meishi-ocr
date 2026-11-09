# 名刺OCR — 自作名刺管理システム

## 概要

Pixel のカメラで名刺を撮影し、**Cloud Vision OCR + Gemini 構造化抽出** → **Google Sheets / Drive** 保存 → **People API** で連絡先同期する PWA です。中継は **Google Apps Script（GAS）**。

**現行バージョン:** PWA `20261112a` / GAS `20261110b`（PWA 想定は `PWA_VERSION`、不一致時は警告色）

## システム構成

```
Pixel（PWA / GitHub Pages）→ GAS（中継）
├→ Cloud Vision API（OCR / 顔検出）
├→ Gemini（構造化抽出）
├→ Google Drive（表・裏画像）
├→ Google Sheets（名刺DB A〜S列）
└→ People API（連絡先・写真・ラベル）
```

## クイックセットアップ（新版）

### 1. GAS（10分程度）

1. [script.google.com](https://script.google.com) で新規プロジェクト
2. **`code.gs` を全文貼り付け**（既存を Ctrl+A 削除してから）
3. `appsscript.json.example` を参考に OAuth スコープを設定
4. `CONFIG` に **Vision / Gemini の API キー**だけ入力（スプレッドシート・フォルダ ID は空で可）
5. エディタで **`setupMeishiOcr`** を実行 → 権限承認  
   - 名刺DBシート・Drive フォルダを自動作成  
   - **API_TOKEN** を Script Properties に保存（ログに表示）
6. **デプロイ → ウェブアプリ**（実行: 自分、アクセス: 全員）→ URL を控える

### 2. PWA（端末）

1. GitHub Pages で `index.html` を開く
2. **接続設定**に GAS の URL と API トークン（ログの値）を貼って保存  
   → **localStorage のみ**（リポジトリに秘密情報を置かない）
3. 撮影 → 自動切り取り → 読み取り

### 3. 既存利用者の移行

| 項目 | 手順 |
|------|------|
| トークン | 旧 `secrets.js` が公開されていた場合は **必ずローテート**（`setupMeishiOcr` で新トークン） |
| PWA | 接続設定に新 URL・新トークンを保存（旧 `secrets.js` 不要） |
| GAS | `code.gs` 差し替え → 保存 → **再デプロイ** |
| データ | 名刺DB **A〜S列は互換**。新列は末尾のみ追加 |

## セキュリティ

- **公開リポジトリに `GAS_URL` / `API_TOKEN` をコミットしない**（旧 `secrets.js` 方式は廃止）
- API キーは GAS の CONFIG または Script Properties のみ
- 過去にリポジトリへ載せたトークンは **無効化してローテート**（git 履歴の書き換えは不要）

## 撮影ガイド枠（20261112）

- カメラに **91:55 比率**のガイド枠を表示（横/縦名刺を切替）
- 既定は **ガイド枠切り取り**（従来の自動検出も選択可・localStorage）
- **元の写真**はフルフレームを保持し、ガイド切り取り後も「元の写真に戻す」可

## 撮影後のやり直し（20261111）

- 表面/裏面ごとに**撮影直後の元画像**を保持
- **1つ戻す**（最大6段） / **元の写真に戻す**
- 登録まで端末メモリのみ（JPEG・表裏それぞれ元 + undo 履歴）
- 自動切り取り改善の調査メモ: [docs/autocrop-improvement-proposal.md](docs/autocrop-improvement-proposal.md)

## 名刺帳タブ（20261110）

- 空欄検索で全件一覧（40件ずつ「もっと見る」）
- 並べ替え（登録日/作成日・会社名・氏名）— localStorage に保存
- タグ絞り込み（R列 / Google ラベル、`tags` API・OR/AND 選択）— localStorage に保存

## 精度改善（20261109）

| 領域 | 変更 |
|------|------|
| OCR | `DOCUMENT_TEXT_DETECTION` 優先、日本語ヒント、`TEXT_DETECTION` フォールバック |
| 抽出 | Gemini プロンプト強化（表裏統合・端の文字・携帯/固定の区別） |
| 後処理 | `normalizeMeishiCard`（電話・メール・URL・郵便番号・ふりがな） |
| 切り取り | 四隅検出後の **内側 inset(3%) を廃止** → **外側 outset(~2.2%)**、フォールバック余白縮小、エッジサンプル拡張 |

ローカル検証: `npm test`（`lib/card-normalize.js` / `lib/meishi-crop.js`）

## 端の読み取り切れ（切り取り）

**想定原因（旧版）:** 検出四隅を `insetQuad(0.03)` で内側に寄せていたため、住所・URL など端の文字が射影補正後に欠けやすかった。

**対策:** `lib/meishi-crop.js` で外側拡張・小さいフォールバック余白・枠線方向のエッジ補正。手動「4点で切る」の初期枠も 8% → 3% に変更。

## ファイル構成

```
meishi-ocr/
├── index.html
├── app.js
├── config.js              … localStorage 接続設定
├── lib/
│   ├── card-normalize.js
│   └── meishi-crop.js
├── code.gs
├── appsscript.json.example
├── token-generator.html
├── secrets.example.js     … 旧方式の参考のみ
├── tests/
└── readme.md
```

## 名刺DBカラム（A〜S）

従来どおり。`ensureSheetTagHeaders` / `setupMeishiOcr` で R・S 列を自動補完。

## GAS 更新のしかた

1. `code.gs` をエディタに **全文貼り替え**
2. 保存 → ウェブアプリ **新バージョンで再デプロイ**
3. PWA 上部の **PWA / GAS バージョン**を確認

## 開発・テスト

```bash
npm test
```

**未検証（実機・実 API なし）:** Pixel カメラ動作、Vision/Gemini 実レスポンス、Drive 権限ダイアログ、People API 同期の E2E。

## 利用 API

Cloud Vision、Gemini、Drive、Sheets、People API、Apps Script Web App
