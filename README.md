# BUYMA商品作成ツール

Googleスプレッドシートの商品URLとブランド名を読み込み、Playwrightで商品情報と画像を取得し、OpenAI Responses APIでBUYMA向けの商品タイトル・商品コメント・製品詳細を生成して、スプレッドシートへ書き戻すNode.jsツールです。

このREADMEはセットアップと実行の入口です。仕様の詳細は次のドキュメントを参照してください。実装とドキュメントが食い違う場合は、**実装が正**です。

| ドキュメント | 内容 |
| --- | --- |
| `CLAUDE.md` | Claude Code向け引き継ぎ。禁止事項と安全ルール |
| `docs/project-overview.md` | 全体構成と処理フロー |
| `docs/spreadsheet-spec.md` | スプレッドシート列と`設定`シートの仕様 |
| `docs/pricing-rules.md` | 価格計算の全ルール |
| `docs/scraper-guide.md` | ショップ別スクレイパーの仕様 |
| `docs/buyma-generation.md` | BUYMA生成の出力仕様 |
| `docs/known-issues.md` | 既知の制限・ステータス一覧・安全ルール |
| `prompts/buyma-generation.md` | OpenAIへ渡す本番プロンプト |

## 実行環境

| 項目 | バージョン |
| --- | --- |
| Node.js | v24.19.0（`/usr/local/bin/node`、公式LTS。最低要件 >=18） |
| npm | 11.17.0（`/usr/local/bin/npm`） |
| Playwright Chromium | revision 1228 |
| パッケージ管理 | pnpm（`pnpm-lock.yaml`） |

依存パッケージは pnpm で導入済みで、`pnpm-lock.yaml` と一致しています。**`npm install` は実行しないでください。** 依存を入れ直す必要がある場合のみ次を使います。

```bash
pnpm install --frozen-lockfile
```

## ディレクトリ構成

```text
/
├── CLAUDE.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── .env.example
├── docs
│   ├── buyma-generation.md
│   ├── known-issues.md
│   ├── pricing-rules.md
│   ├── project-overview.md
│   ├── scraper-guide.md
│   └── spreadsheet-spec.md
├── prompts
│   └── buyma-generation.md
├── src
│   ├── config.js          環境変数の読み込み
│   ├── googleAuth.js      Google OAuthトークン取得
│   ├── imageMetadata.js   画像の形式・寸法・ハッシュ判定
│   ├── images.js          画像ダウンロードと保存
│   ├── index.js           オーケストレーション（エントリポイント）
│   ├── logger.js          エラーログ出力
│   ├── openaiClient.js    OpenAI Responses API呼び出し
│   ├── pricing.js         価格計算・ショップ送料・カテゴリー判定
│   ├── scraper.js         スクレイピングのディスパッチャと汎用フォールバック
│   ├── sheets.js          Google Sheetsの認証・読み書き
│   ├── status.js          ステータス定数
│   ├── utils.js           共通ユーティリティ
│   └── shops              ショップ別専用スクレイパー
│       ├── harveyNichols.js
│       ├── hobbsLondon.js
│       ├── phaseEight.js
│       ├── selfPortrait.js
│       ├── selfridges.js
│       ├── vivienneWestwood.js
│       └── zalando.js
├── images                 行番号ごとの保存画像（gitignore）
└── logs                   エラーログ（gitignore）
```

## セットアップ

### 1. Playwrightのブラウザ

未導入の場合のみ実行します。

```bash
npm run playwright:install
```

### 2. `.env` の作成

```bash
cp .env.example .env
```

設定項目は「環境変数」の節を参照してください。

### 3. Google OAuth

このツールはGoogle OAuth（デスクトップアプリ型クライアント）でスプレッドシートにアクセスします。

1. Google Cloud Consoleでプロジェクトを作成し、Google Sheets APIを有効化します。
2. 認証情報からOAuthクライアントIDを作成します。種類は**デスクトップアプリ**を選びます。
3. リダイレクトURIに `http://127.0.0.1:53682/oauth2callback` を設定します。
4. クライアントJSONをプロジェクトルートに `google-oauth-client.json` として保存します。
5. OAuth同意画面の公開ステータスを**「本番環境」**にします。「テスト」のままだとリフレッシュトークンが7日で失効し、毎週再認証が必要になります。
6. トークンを取得します。

```bash
npm run auth:google
```

表示されたURLをブラウザで開いて許可すると、`google-oauth-token.json` が保存されます。同意画面が未検証の場合は「このアプリはGoogleで確認されていません」という警告が出ますが、「詳細」から進めます。

使用スコープは `https://www.googleapis.com/auth/spreadsheets` です。

対象スプレッドシートは、認証したGoogleアカウントに編集権限がある必要があります。

サービスアカウントも利用できます。`GOOGLE_APPLICATION_CREDENTIALS` が指すファイルが存在する場合に限り、OAuthより優先して使われます。存在しない場合はOAuthにフォールバックします。

### 4. OpenAI APIキー

OpenAIのAPIキーを発行し、`.env` に設定します。このツールはOpenAI Responses APIを使用し、JSON Schemaで出力形式を固定しています。

## 環境変数

`.env` の全項目です。

| 変数 | 説明 |
| --- | --- |
| `GOOGLE_SHEET_ID` | 対象スプレッドシートのID |
| `GOOGLE_SHEET_NAME` | 処理対象シート名。運用中は `2026/07` のような月次シート |
| `GOOGLE_APPLICATION_CREDENTIALS` | サービスアカウントJSONのパス。存在する場合のみ使用 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuthクライアントJSONのパス |
| `GOOGLE_OAUTH_TOKEN` | OAuthトークンJSONのパス |
| `OPENAI_API_KEY` | OpenAI APIキー |
| `OPENAI_MODEL` | 使用モデル。既定は `gpt-4.1-mini` |
| `START_ROW` | 処理開始行 |
| `END_ROW` | 処理終了行。空欄はシート末尾までを意味する |
| `HEADLESS` | `false` にするとブラウザを表示して実行 |
| `REQUEST_TIMEOUT_MS` | ページ取得と画像取得のタイムアウト |

`.env`、`google-oauth-client.json`、`google-oauth-token.json` は `.gitignore` で除外されています。コミットしないでください。

## 実行方法

```bash
npm start
```

`images` フォルダと `logs` フォルダが存在しない場合は自動作成されます。

### 対象行の指定

`START_ROW` と `END_ROW` で処理対象行を絞ります。**`END_ROW` を空欄のまま実行しないでください。** 空欄はシート末尾までの全行が対象になります。

行範囲は固定設定ではなく、**実行ごとに指定する運用値**として扱います。新規商品行を追加したら、その範囲だけを指定してください。

初回テストは1行だけを対象にします。

```env
START_ROW=2
END_ROW=2
```

一括処理は、1行テストが成功してから行ってください。

## スプレッドシート

### 列構成

| 列 | 内容 | 区分 |
| --- | --- | --- |
| A | 商品URL | 入力 |
| B | ブランド名 | 入力 |
| C | 備考欄 | 入力 |
| D | 原価（GBP） | 入出力兼用 |
| E | 商品名 | 出力 |
| F | 商品説明・製品詳細 | 出力 |
| G | 画像ファイル名 | 出力 |
| H | ステータス | 出力 |
| I | カテゴリー | 出力 |
| J | 原価＋ショップ配送料（GBP） | 出力 |
| K | 国際送料（GBP） | 出力 |
| L | 出品価格（円） | 出力 |
| M | 利益率 | 出力 |
| N | 情報取得元URL | 入力 |

**A列、B列、C列、N列は更新しません。** 顧客の入力列であり、A列はショップ判定、B列はブランド別利益率判定の唯一の根拠です。N列は画像・商品情報の代替取得元URLです。

### D列（原価）の手入力運用

A列サイトから価格が取得できない場合（Moncler公式のようにアクセス自体ができない場合など）、D列に原価を手入力できます。

受け付ける表記：

| 種類 | 例 |
|---|---|
| 数値のみ | `1250` |
| 桁区切り（英国式：カンマが桁区切り、ピリオドが小数点） | `1,250.00` |
| 桁区切り（欧州式：ピリオドが桁区切り、カンマが小数点） | `1.250,00` |
| 通貨記号 | `€1,250.00`、`£1,032` |
| 通貨コード | `1250 EUR`、`EUR 1250` |
| 日本語表記 | `1,250.00ユーロ`、`1250ポンド` |

- 通貨を明示しない場合はGBPとして扱われます。
- `円`・`JPY`・`¥`・`USD`・`$`など**未対応の通貨表記は採用されず**、`要確認：D列の原価表記を確認してください`が出ます（GBPとして誤って計算されることはありません）。
- 桁区切りと小数点の判別は自動で行われます（`1.250,00`と`1,250.00`はどちらも1250として認識されます）。
- 解析結果が5未満になった場合（誤読の可能性が高いため）も採用されず、同じく`要確認：D列の原価表記を確認してください`が出ます。
- **セルに通貨書式（€表示など）を設定しないでください。** 換算後にGBPの数値を書き戻した後も€表示のまま残ってしまい、金額を誤読する原因になります。書式は「自動」または「数値」にしてください。
- 初回実行後、D列はGBP換算後の数値に置き換わります。EUR入力はGBP数値に変わるため、次回実行時に二重換算されることはありません。
- 内容を確認したら、H列を `完了` から始まる文字列に書き換えると、以降の実行で上書きされなくなります。

### N列（情報取得元URL）の運用

A列サイトが画像利用を許可していない、またはbot対策で自動取得できない場合、別ECサイトの同一商品ページURLをN列に入力します。

- N列にURLがある行は、A列サイトからは画像を取得せず、N列URLのページから画像を取得します。
- 商品名・商品説明・素材・カラー等の商品情報はN列を優先し、値がなければA列を使用します。
- **価格・通貨は常にA列由来の値のみを使用します。** N列は別の店の商品ページであり、そこに表示される価格は仕入れ原価ではないためです。

書き込みはD列からM列のみで、`values.batchUpdate` により列ごとに個別更新します。

補足事項です。

- D列はEUR建て商品の場合、GBPへ換算した値を書き込みます。
- E列には生成されたタイトル候補を最大5件、改行で連結して書き込みます。
- F列には商品コメントと製品詳細を空行区切りで書き込みます。
- G列には保存画像のファイル名のみを昇順で書き込みます。画像URL、保存フォルダ、フルパスは書き込みません。
- D列、J列、K列、L列、M列は数値として書き込みます。

詳細は `docs/spreadsheet-spec.md` を参照してください。

### `設定` シート

価格計算の運用値は `設定` シートで管理します。A列が設定名、B列が設定値です。

| 設定名 | 用途 |
| --- | --- |
| `GBP_JPY_RATE` | GBPから円への換算レート |
| `BUYMA_FEE_RATE` | BUYMA手数料率 |
| `CONSUMPTION_TAX` | 消費税率 |
| `EUR_GBP_RATE` | EURからGBPへの換算レート。Zalandoなどのユーロ建て商品で使用 |

これらはコードにハードコードしません。未設定、空欄、数値以外、不正な値の場合は価格計算を停止し、ステータスへエラーを追記します。

`CONSUMPTION_TAX` は現在バリデーションのみに使われており、**総原価には加算されていません**。関税と消費税は常に0として扱われます。

計算式、ブランド別利益率、ショップ送料、国際送料の全ルールは `docs/pricing-rules.md` を参照してください。

## スクレイピング

`src/scraper.js` がURLからショップを判定し、専用スクレイパーへ振り分けます。該当がない場合のみ汎用フォールバックを使います。

現在の専用スクレイパーは7ショップです。

| ファイル | 対象 |
| --- | --- |
| `src/shops/vivienneWestwood.js` | Vivienne Westwood（en-gb のみ） |
| `src/shops/hobbsLondon.js` | Hobbs London |
| `src/shops/zalando.js` | Zalando（ユーロ建て） |
| `src/shops/harveyNichols.js` | Harvey Nichols |
| `src/shops/selfPortrait.js` | Self-Portrait（サイズガイド取得あり） |
| `src/shops/phaseEight.js` | Phase Eight |
| `src/shops/selfridges.js` | Selfridges（自動取得は無効） |

汎用フォールバックはJSON-LD、OGP、meta description、一般的な商品情報ラベル、`document.images` を順に参照します。**専用スクレイパーを持つショップで汎用フォールバックに頼らないでください。** 特に画像取得を `document.images` に後退させると、ロゴ・バナー・関連商品などの無関係な画像が混入します。取得できない場合は無関係な画像を集めるのではなく、`要確認：商品画像取得失敗` として停止させます。

新しいショップに対応する場合は、`src/shops/` に専用ファイルを追加し、`src/scraper.js` のディスパッチャへ登録します。各ショップの抽出仕様と注意点は `docs/scraper-guide.md` を参照してください。

Cloudflare、Akamai、その他のbot対策やアクセス制御を回避する実装は行いません。

## 画像保存ルール

商品画像はスプレッドシートの行番号ごとのフォルダに保存されます。

```text
images/
  43/
    01_main.jpg
    02_sub.jpg
    03_sub.jpg
    size_guide.jpg
```

- ファイル名は `01_main` と `数字_sub` の形式です。
- 画像がPNG、WebP、GIFとして取得された場合は、実際の形式に合わせて拡張子が変わります。
- 保存前に、その行のフォルダから `01_main.*`、`数字_sub.*`、`size_guide.*` を削除します。手動で追加した他のファイルは残ります。
- 同一画像はURLの正規化キーとダウンロード後のハッシュの2段階で重複排除します。
- 解像度が低い画像は除外または警告の対象になります。
- `size_guide.jpg` はSelf-PortraitのGarment measurement（単位センチメートル）のスクリーンショットです。G列のファイル名一覧には含まれません。

## ステータス

H列のステータスは3系統です。

| 系統 | 例 | 意味 |
| --- | --- | --- |
| 完了 | `完了` / `完了（サイズ情報なし）` | 正常終了 |
| 要確認 | `要確認：カテゴリー判定` / `要確認：Selfridgesページ取得不可` | 処理は続行したが人の確認が必要 |
| エラー | `エラー` / `エラー：GBP/JPY為替レートを確認してください` | 中断、または価格計算の失敗 |

処理開始時に `処理中` を書き込みます。完了時は取得できなかった項目を判定し、`完了`、`完了（サイズ情報なし）`、または `要確認：…` を書き込みます。価格計算の警告とエラーは同じセルへ改行で追記されます。

例外が発生した場合は `logs/error-row-{行番号}-{タイムスタンプ}.log` にログを保存し、H列に `エラー` を書き込みます。

**H列が `完了` で始まる行は、次回実行時にスキップされます。** これにより再実行時の重複処理を防いでいます。

ステータスの全一覧は `docs/known-issues.md` を参照してください。

## 既知の制限

- Selfridgesは自動取得の対象外です。常に `要確認：Selfridgesページ取得不可` で停止します。
- Zalandoはbot対策やページ構造の検出失敗により取得できない場合があります。
- ショップページは国、Cookie、ブラウザロケール、セッションによって表示内容が変わります。取得できなかった情報を推測で補完しません。

詳細は `docs/known-issues.md` を参照してください。
