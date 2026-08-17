# Spreadsheet Spec

## Main Sheet

The active spreadsheet name comes from `.env` via `GOOGLE_SHEET_NAME`. The project has been operated with a sheet such as `2026/07`, but the code does not hard-code that name.

## Row Selection

`src/sheets.js` reads:

```text
{GOOGLE_SHEET_NAME}!A{START_ROW}:M{END_ROW}
```

Rows are processed only when:

- A column URL exists
- H column status does not start with `完了`

## Official Column Structure

```text
A 商品URL
B ブランド名
C 備考欄
D 原価（GBP）
E 商品名
F 商品説明
G 画像ファイル名
H ステータス
I カテゴリー
J 原価＋ショップ配送料（GBP）
K 国際送料（GBP）
L 出品価格（円）
M 利益率
```

## Client Input Columns

Do not modify:

- A 商品URL
- B ブランド名
- C 備考欄

B is used for brand margin calculation. It is not the shop name. The shop is resolved from the A-column URL hostname.

## Program Output Columns

`src/sheets.js` writes only these columns:

```text
D cost
E title
F description
G imageFileNames
H status
I category
J costWithShopShipping
K internationalShipping
L listingPrice
M profitRate
```

The code writes each output column individually using `values.batchUpdate`, avoiding A-C.

## Column Value Details

- D is numeric GBP cost. For EUR products, the product price is converted to GBP before writing.
- E currently receives up to five BUYMA generated title candidates joined by newlines.
- F receives generated `description` and `productDetails`, separated by a blank line.
- G receives saved product image file names only, sorted by file name.
- H receives status and warnings/errors.
- I receives the shipping category used for international shipping.
- J, K, L, M are numeric outputs.

G must not contain image URLs, folder paths, or full paths.

## Settings Tab

`src/sheets.js` reads the `設定` sheet range:

```text
設定!A:B
```

Expected format:

```text
A列: 設定名
B列: 設定値
```

The first row key `設定名` is ignored.

Currently used settings:

- `GBP_JPY_RATE`
- `BUYMA_FEE_RATE`
- `CONSUMPTION_TAX`
- `EUR_GBP_RATE`

These are operational values and must not be hard-coded into pricing logic.

Validation:

- `GBP_JPY_RATE`: must be numeric and greater than 0
- `BUYMA_FEE_RATE`: must be numeric and 0 or greater
- `CONSUMPTION_TAX`: must be numeric and 0 or greater
- `EUR_GBP_RATE`: used in `src/index.js` for EUR products; must be numeric and greater than 0 when needed

Current pricing code validates `CONSUMPTION_TAX`, but the current pricing formula does not add customs duty or consumption tax to total cost.

## Authentication Files

Possible auth files:

- `google-oauth-client.json`
- `google-oauth-token.json`
- service account JSON configured by `GOOGLE_APPLICATION_CREDENTIALS`

Secrets must not be printed, committed, or copied into docs.

## Google OAuth

If the OAuth token is missing or invalid, run:

```bash
npm run auth:google
```

If `npm` is unavailable:

```bash
/Users/yuika/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node src/googleAuth.js
```

The local callback listener uses:

```text
127.0.0.1:53682
```

