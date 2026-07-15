# BUYMA商品作成ツール

Googleスプレッドシートの商品URLとブランド名を読み込み、Playwrightで商品情報と画像を取得し、OpenAI Responses APIでBUYMA向けの商品タイトル5案・商品コメント・製品詳細・トップ画像生成用プロンプトを生成して、スプレッドシートへ書き戻すNode.jsツールです。

## ディレクトリ構成

```text
/
├── src
│   ├── config.js
│   ├── images.js
│   ├── index.js
│   ├── logger.js
│   ├── openaiClient.js
│   ├── scraper.js
│   ├── sheets.js
│   ├── status.js
│   └── utils.js
├── images
├── prompts
│   └── buyma-generation.md
├── logs
├── .env.example
├── package.json
└── README.md
```

## セットアップ方法

1. 依存パッケージをインストールします。

```bash
npm install
```

2. Playwrightのブラウザをインストールします。

```bash
npm run playwright:install
```

3. `.env.example` を `.env` にコピーして、必要な値を設定します。

```bash
cp .env.example .env
```

## 必要なAPIキー

- Google Sheets APIを利用できるGoogle Cloudサービスアカウント
- OpenAI APIキー

## Google Sheets API設定方法

1. Google Cloud Consoleでプロジェクトを作成します。
2. Google Sheets APIを有効化します。
3. サービスアカウントを作成します。
4. サービスアカウントのJSONキーを作成し、プロジェクトルートに `google-service-account.json` として保存します。
5. 対象スプレッドシートをサービスアカウントのメールアドレスに共有します。編集権限が必要です。
6. `.env` に以下を設定します。

```env
GOOGLE_SHEET_ID=1q6DIJiJZ8iusEOiI7bJMW1MaQ83x-T_ntrTrsmPlRI4
GOOGLE_SHEET_NAME=シート1
GOOGLE_APPLICATION_CREDENTIALS=./google-service-account.json
```

読み込み列は以下です。

- A列: 商品URL
- B列: ブランド

書き戻し列は以下です。

- C列: 商品タイトル5案
- D列: 商品コメント・製品詳細
- E列: 画像生成プロンプト
- F列: 保存画像ファイルパス
- G列: ステータス

## OpenAI API設定方法

OpenAIのAPIキーを発行し、`.env` に設定します。

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
```

このツールはOpenAI Responses APIを使用します。

## Playwrightセットアップ方法

依存関係のインストール後、以下を実行します。

```bash
npm run playwright:install
```

画面を表示しながら動作確認したい場合は `.env` で以下を設定します。

```env
HEADLESS=false
```

## 実行方法

```bash
npm start
```

実行時に `images` フォルダと `logs` フォルダが存在しない場合は自動作成されます。

## ステータス

処理開始時はステータス列に `処理中` を書き込みます。

正常に生成と書き戻しが終わると、いったん `正常終了` を含む結果を書き込み、その後 `完了` に更新します。

エラーが発生した場合は `logs` フォルダへログを保存し、ステータス列に `エラー` を書き込みます。

## 画像保存ルール

取得できた商品画像は `./images` に保存されます。

ファイル名は以下の形式です。

```text
ブランド_商品名_1.jpg
ブランド_商品名_2.jpg
ブランド_商品名_3.jpg
```

画像形式がPNG、WebP、GIFとして取得された場合は、実際の形式に合わせて拡張子が変わります。
## 補足

商品ページのHTML構造はショップごとに異なるため、このツールはJSON-LD、OGP、meta description、一般的な商品情報ラベルを順番に参照して情報を取得します。特定サイトで取得精度を上げたい場合は、`src/scraper.js` にサイト別セレクタを追加してください。
