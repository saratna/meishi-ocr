# 名刺OCR — 自作名刺管理システム

## 概要

CAMCARD の代替として自作した名刺管理システム。
Pixel のカメラで名刺を撮影し、OCR + AI で構造化抽出、Google Sheets に蓄積、Google 連絡先に自動同期する。

## システム構成

Pixel（PWA）→ Google Apps Script（中継サーバー）
├→ Cloud Vision API（OCR / 顔検出）
├→ Gemini（構造化抽出・モデル自動フォールバック）
├→ Google Drive（名刺 表・裏 画像保存）
├→ Google Sheets（名刺DB）
└→ People API（Google連絡先同期・顔写真）


## アーキテクチャ

### 三層構造

| 層 | 役割 | 技術 |
|---|------|------|
| OCR層 | 画像から生テキスト抽出 | Google Cloud Vision API |
| 知性層 | 構造化抽出・文脈補正・ふりがな推測 | Gemini（混雑時は別モデルへ自動切替） |
| DB層 | データ蓄積・検索・画像保存 | Google Sheets / Drive |

### 設計思想

- **AIには考えさせろ、計算はさせるな** — 数値処理はスプレッドシートに任せ、AIは判断・分類・生成のみ
- **OCR + VLM の二段構え** — Cloud Vision が文字を正確に読み、Gemini が文脈で補正。相互補完で精度向上
- **APIキーはGAS側に隠蔽** — PWA（ブラウザ）にはキーを露出させない
- **Gemini フォールバック** — receipt-ocr と同様、主モデルが混雑・不可のとき代替モデルへ自動切替

## 機能一覧

### スキャン・登録
- Pixel 背面カメラで名刺の**表面**を撮影
- 任意で「裏面も撮る」ボタンから裏面を追加撮影（裏面が無い名刺はそのまま可）
- 表＋裏の OCR を統合し、表で足りない項目を裏から補完
- Cloud Vision API で OCR / 顔検出
- Gemini で構造化抽出（氏名・会社名・役職・電話番号等）
- 登録前に編集・確認画面で修正可能
- Google Drive に表・裏画像を保存
- Google Sheets に保存（画像URL付き）
- Google 連絡先に自動同期（重複チェック付き）
  - 名刺に顔写真がある場合はくり抜いて連絡先の顔写真へ
  - 名刺表は Drive 保存＋連絡先のリンク／メモに記載（詳細の背景相当として参照）

### 検索
- 名前・ふりがな・会社名・部門・役職・メール・電話番号で検索
- リアルタイム検索（500ms デバウンス）
- 名刺表・裏の Drive リンク表示

### データ移行
- CAMCARD からのエクスポートデータ（Excel）を新構成に自動整形移行
- 電話番号先頭0消失の自動修正
- ふりがな一括推測（Gemini でバッチ処理）

### Google 連絡先同期
- People API で連絡先に登録
- 同姓同名の完全一致で重複チェック
- 既存連絡先は上書き更新、新規は作成
- バッチ処理（50件ずつ5分おき）で一括同期対応

## 名刺DBカラム構成

| 列 | 項目 |
|---|------|
| A | 作成時間 |
| B | 氏名 |
| C | ふりがな |
| D | 会社名 |
| E | 部門 |
| F | 役職 |
| G | 携帯電話1 |
| H | 携帯電話2 |
| I | 電話番号 |
| J | FAX |
| K | メールアドレス1 |
| L | メールアドレス2 |
| M | 住所 |
| N | ウェブページ |
| O | メモ |
| P | 名刺表画像URL |
| Q | 名刺裏画像URL |

## ファイル構成

```
meishi-ocr/
├── index.html            ... PWA フロントエンド
├── app.js                ... PWA ロジック
├── code.gs               ... GAS バックエンド（※参考用・APIキーは除外）
├── secrets.example.js    ... secrets.js のテンプレート
├── secrets.js            ... 実値（gitignore・GitHubに上げない）
├── token-generator.html  ... API_TOKEN 生成ツール
└── README.md             ... このファイル
```

## 利用API・サービス

| サービス | 用途 | 費用 |
|---------|------|------|
| Google Cloud Vision API | OCR・顔検出 | 月1,000枚まで無料 |
| Gemini（複数モデル） | 構造化抽出・ふりがな推測 | 無料枠あり |
| Google Drive | 名刺画像保存 | 無料枠あり |
| Google Sheets API | データ蓄積・検索 | 無料 |
| Google People API | 連絡先同期・写真 | 無料 |
| Google Apps Script | 中継サーバー | 無料 |
| GitHub Pages | PWA ホスティング | 無料 |

## Gemini モデル（フォールバック）

receipt-ocr と同じ考え方です。

1. `gemini-3.5-flash`（主）
2. `gemini-3.5-flash-lite`
3. `gemini-3.1-flash-lite`
4. `gemini-flash-latest`

429 / 503 / 混雑時はリトライ後、次のモデルへ自動切替。

## 月額コスト比較

| 項目 | 費用 |
|------|------|
| CAMCARD BUSINESS | 月1,700円〜 |
| CAMCARD プレミアム | 月480円 |
| **本システム（月100枚想定）** | **約100〜250円** |

## セットアップ手順

### 1. Google Cloud Console
1. プロジェクト作成
2. 以下のAPIを有効化:
   - Cloud Vision API
   - Generative Language API（Gemini）
   - Google Sheets API
   - People API
3. APIキー発行・制限設定（Cloud Vision + Generative Language のみ許可）

### 2. Google Sheets / Drive
1. スプレッドシート作成
2. 「名刺DB」タブを作成、ヘッダー行を設定（上記カラム）
3. 名刺画像保存用の Drive フォルダを作成し、フォルダIDを控える

### 3. Google Apps Script
1. スプレッドシートから「拡張機能」→「Apps Script」
2. code.gs の内容を貼り付け
3. APIキー・スプレッドシートID・`DRIVE_FOLDER_ID`・`API_TOKEN` を設定
4. サービスに「People API」を追加
5. ウェブアプリとしてデプロイ（アクセス: 全員）

### 4. PWA（トークン設定）
1. `secrets.example.js` をコピーして `secrets.js` を作成（**GitHub には上げない**）
2. `secrets.js` に次を設定
   - `GAS_URL` … ウェブアプリのデプロイURL
   - `API_TOKEN` … GAS の `CONFIG.API_TOKEN` と**同じ**長いランダム文字列
3. または `token-generator.html` でトークン生成 → secrets.js 全文をコピー
4. GitHub リポジトリにプッシュ（`secrets.js` 以外）
5. GitHub Pages を有効化（main / root）
6. Pixel の Chrome でアクセス → ホーム画面に追加

> Pages に載せるには、手元で `secrets.js` を置いた状態で別途デプロイするか、トークン付きファイルを Pages 用に手動配置する必要があります。

## 入口トークン（API_TOKEN）

- GAS: `CONFIG.API_TOKEN`
- フロント: `secrets.js` の `API_TOKEN`
- 未設定（`YOUR_API_TOKEN`）のままだと GAS は `Unauthorized` を返す
- `doGet`（生存確認）だけトークン不要

## 開発経緯

2026年3月18日、CAMCARD の代替として1日で構築。
Cloud Vision API + Gemini の二段構えOCRにより、
従来のOCR単体よりも高精度な名刺読み取りを実現。
データは100% Google Sheets に所有、ベンダーロックインなし。

## 注意事項

- code.gs 内のAPIキー・`API_TOKEN` の実値は公開しないこと（GitHubにはプレースホルダのまま）
- `secrets.js` は絶対に commit / push しない
- Google Sheets は1,000万セルが上限。名刺管理なら当面問題なし
- 同姓同名の別人がいる場合、連絡先が上書きされるリスクあり
- People API は連絡先写真スロットが実質1つ。顔がある場合は顔を優先し、名刺表は Drive / リンクで保持する
