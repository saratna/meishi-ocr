# 名刺OCR — 自作名刺管理システム

## 概要

CAMCARD の代替として自作した名刺管理システム。
Pixel のカメラで名刺を撮影し、OCR + AI で構造化抽出、Google Sheets に蓄積、Google 連絡先に自動同期する。

フロントの現行バージョン: **v20260920d**（`index.html` 上部に表示）

## システム構成

```
Pixel（PWA / GitHub Pages）→ Google Apps Script（中継サーバー）
├→ Cloud Vision API（OCR / 顔検出・表裏）
├→ Gemini（構造化抽出・モデル自動フォールバック）
├→ Google Drive（名刺 表・裏 画像保存）
├→ Google Sheets（名刺DB）
└→ People API（連絡先同期・顔写真・ラベル／タグ）
```

## アーキテクチャ

### 三層構造

| 層 | 役割 | 技術 |
|---|------|------|
| OCR層 | 画像から生テキスト抽出 | Google Cloud Vision API |
| 知性層 | 構造化抽出・文脈補正・ふりがな推測 | Gemini（混雑時は別モデルへ自動切替） |
| DB層 | データ蓄積・検索・画像保存 | Google Sheets / Drive |

### 設計思想

- **AIには考えさせろ、計算はさせるな** — 数値処理はスプレッドシートに任せ、AIは判断・分類・生成のみ
- **OCR + VLM の二段構え** — Cloud Vision が文字を正確に読み、Gemini が文脈で補正
- **APIキーはGAS側に隠蔽** — PWA（ブラウザ）にはキーを露出させない
- **Gemini フォールバック** — receipt-ocr と同様、主モデルが混雑・不可のとき代替モデルへ自動切替

## 機能一覧

### スキャン・登録
- 背面カメラで名刺の**表面**を撮影（失敗時は「アルバムから選ぶ」も可）
- 任意で「裏面も撮る」から裏面を追加撮影
- 撮影後: 左右90°回転 / 自動で正面長方形補正 / 正方形切取 / 4点切取
- 表＋裏の OCR を統合し、表で足りない項目を裏から補完
- Cloud Vision で OCR、Gemini で構造化抽出
- **顔検出は表・裏の両方**を見て、大きい方を連絡先写真にくり抜き
- 登録前に編集・確認（氏名〜メモ）
- **登録日**を手入力可能（既定は当日）
- **Google連絡先ラベル（タグ）**を使用頻度順で表示、複数選択・新規追加可
- Google Drive に表・裏画像を保存
- Google Sheets に保存（画像URL・タグ・登録日付き）
- Google 連絡先に自動同期（重複チェック付き）

### 検索
- 名前・ふりがな・会社名・部門・役職・メール・電話・タグ・登録日で検索
- リアルタイム検索（500ms デバウンス）
- 名刺表・裏の Drive リンク表示

### データ移行
- CAMCARD エクスポートの自動整形移行
- 電話番号先頭0消失の自動修正
- ふりがな一括推測（Gemini バッチ）

### Google 連絡先同期
- People API で連絡先登録・更新
- ラベル（タグ）を Contact Groups として付与
- 顔写真＋名刺表リンク／メモ
- バッチ同期（50件ずつ）対応

## 名刺DBカラム構成

| 列 | 項目 |
|---|------|
| A | 作成時間（システム記録） |
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
| R | タグ |
| S | 登録日 |

初回保存時にヘッダー R・S が無ければ自動で追加されます。

## ファイル構成

```
meishi-ocr/
├── index.html              ... PWA フロント（UI）
├── app.js                  ... PWA ロジック
├── manifest.json           ... PWA マニフェスト
├── code.gs                 ... GAS バックエンド（※GitHub上はキーをプレースホルダ）
├── appsscript.json.example ... GAS マニフェスト例（oauthScopes）
├── secrets.example.js      ... secrets.js のテンプレート
├── secrets.js              ... 実値（Pages動作用にリポジトリへ配置済み）
├── token-generator.html    ... API_TOKEN 生成ツール
└── readme.md               ... このファイル
```

## 利用API・サービス

| サービス | 用途 |
|---------|------|
| Google Cloud Vision API | OCR・顔検出（表裏） |
| Gemini（複数モデル） | 構造化抽出・ふりがな |
| Google Drive | 名刺画像保存 |
| Google Sheets | データ蓄積・検索 |
| Google People API | 連絡先・写真・ラベル |
| Google Apps Script | 中継サーバー |
| GitHub Pages | PWA ホスティング |

## Gemini モデル（フォールバック）

1. `gemini-3.5-flash`（主）
2. `gemini-3.5-flash-lite`
3. `gemini-3.1-flash-lite`
4. `gemini-flash-latest`

429 / 503 / 混雑時はリトライ後、次のモデルへ自動切替。

## セットアップ手順

### 1. Google Cloud Console
1. プロジェクト作成
2. Cloud Vision / Generative Language / Sheets / People API を有効化
3. APIキー発行（Vision + Generative Language に制限推奨）

### 2. Google Sheets / Drive
1. スプレッドシート作成、「名刺DB」タブとヘッダー行
2. 名刺画像用 Drive フォルダを作成し ID を控える

### 3. Google Apps Script
1. `code.gs` を貼り付け
2. `CONFIG` に Vision / Gemini / Spreadsheet / Drive / `API_TOKEN` を設定
3. People API サービスを追加
4. `appsscript.json.example` を参考に oauthScopes を合わせる
5. エディタで `authorizeDrive` / `testListTags` を実行して権限承認
6. **ウェブアプリを新バージョンで再デプロイ**（アクセス: 全員）

### 4. PWA
1. `secrets.js` の `GAS_URL` と `API_TOKEN` を GAS と一致させる
2. GitHub Pages（main / root）を有効化
3. Pixel Chrome で開き、画面上部のバージョン（例: v20260920d）を確認

## 入口トークン（API_TOKEN）

- GAS: `CONFIG.API_TOKEN`
- フロント: `secrets.js` の `API_TOKEN`
- 未設定のままだと GAS は `Unauthorized`
- `doGet`（生存確認）だけトークン不要

## GAS アクション一覧

| action | 内容 |
|--------|------|
| `scan` | OCR + Gemini + 顔検出（表裏） |
| `save` | Drive / Sheets / 連絡先 / タグ |
| `search` | 名刺DB検索 |
| `tags` | 連絡先ラベル一覧（使用頻度順） |

## 注意事項

- `code.gs` 内の API キー実値は公開リポジトリに書かない（プレースホルダのまま）
- `secrets.js` は Pages 動作用に追跡されています。漏洩に注意し、トークン漏れたら即ローテート
- People API の連絡先写真スロットは実質1つ。顔がある場合は顔を優先し、名刺表は Drive / リンクで保持
- 同姓同名は連絡先が上書きされるリスクあり
- フロント更新後はスマホで強制再読み込み（キャッシュ）
- **タグ・裏顔検出など GAS 変更は、エディタへの貼り付け＋再デプロイが必須**
