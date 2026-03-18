# 名刺OCR — 自作名刺管理システム

## 概要

CAMCARD の代替として自作した名刺管理システム。
Pixel のカメラで名刺を撮影し、OCR + AI で構造化抽出、Google Sheets に蓄積、Google 連絡先に自動同期する。

## システム構成

Pixel（PWA）→ Google Apps Script（中継サーバー）
 ├→ Cloud Vision API（OCR）
 ├→ Gemini 2.5 Flash（構造化抽出）
 ├→ Google Sheets（名刺DB）
 └→ People API（Google連絡先同期）


## アーキテクチャ

### 三層構造

| 層 | 役割 | 技術 |
|---|------|------|
| OCR層 | 画像から生テキスト抽出 | Google Cloud Vision API |
| 知性層 | 構造化抽出・文脈補正・ふりがな推測 | Gemini 2.5 Flash |
| DB層 | データ蓄積・検索 | Google Sheets API |

### 設計思想

- **AIには考えさせろ、計算はさせるな** — 数値処理はスプレッドシートに任せ、AIは判断・分類・生成のみ
- **OCR + VLM の二段構え** — Cloud Vision が文字を正確に読み、Gemini が文脈で補正。相互補完で精度向上
- **APIキーはGAS側に隠蔽** — PWA（ブラウザ）にはキーを露出させない

## 機能一覧

### スキャン・登録
- Pixel 背面カメラで名刺を撮影
- Cloud Vision API で OCR
- Gemini 2.5 Flash で構造化抽出（氏名・会社名・役職・電話番号等）
- 登録前に編集・確認画面で修正可能
- Google Sheets に保存
- Google 連絡先に自動同期（重複チェック付き）

### 検索
- 名前・ふりがな・会社名・部門・役職・メール・電話番号で検索
- リアルタイム検索（500ms デバウンス）

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

## ファイル構成

meishi-ocr/ ├── index.html ... PWA フロントエンド（カメラ・編集フォーム・検索UI） ├── app.js ... PWA ロジック（カメラ制御・API通信・タブ切替） ├── code.gs ... GAS バックエンド（※参考用・APIキーは除外） └── README.md ... このファイル


## 利用API・サービス

| サービス | 用途 | 費用 |
|---------|------|------|
| Google Cloud Vision API | OCR | 月1,000枚まで無料 |
| Gemini 2.5 Flash | 構造化抽出・ふりがな推測 | 無料枠あり |
| Google Sheets API | データ蓄積・検索 | 無料 |
| Google People API | 連絡先同期 | 無料 |
| Google Apps Script | 中継サーバー | 無料 |
| GitHub Pages | PWA ホスティング | 無料 |

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

### 2. Google Sheets
1. スプレッドシート作成
2. 「名刺DB」タブを作成、ヘッダー行を設定

### 3. Google Apps Script
1. スプレッドシートから「拡張機能」→「Apps Script」
2. code.gs の内容を貼り付け
3. APIキー・スプレッドシートIDを設定
4. サービスに「People API」を追加
5. ウェブアプリとしてデプロイ（アクセス: 全員）

### 4. PWA
1. index.html の GAS_URL にデプロイURLを設定
2. GitHub リポジトリにプッシュ
3. GitHub Pages を有効化（main / root）
4. Pixel の Chrome でアクセス → ホーム画面に追加

## 開発経緯

2026年3月18日、CAMCARD の代替として1日で構築。
Cloud Vision API + Gemini の二段構えOCRにより、
従来のOCR単体よりも高精度な名刺読み取りを実現。
データは100% Google Sheets に所有、ベンダーロックインなし。

## 注意事項

- code.gs 内のAPIキーは公開しないこと（GitHubには 'YOUR_API_KEY' で保存）
- Google Sheets は1,000万セルが上限。名刺管理なら当面問題なし
- 同姓同名の別人がいる場合、連絡先が上書きされるリスクあり