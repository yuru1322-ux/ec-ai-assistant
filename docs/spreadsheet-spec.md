# Spreadsheet Spec

## Main Sheet

The active spreadsheet name comes from `.env` via `GOOGLE_SHEET_NAME`. The project has been operated with a sheet such as `2026/07`, but the code does not hard-code that name.

## Row Selection

`src/sheets.js` reads:

```text
{GOOGLE_SHEET_NAME}!A{START_ROW}:N{END_ROW}
```

Rows are processed only when:

- A column URL exists
- H column status does not start with `完了`

## Official Column Structure

```text
A 商品URL
B ブランド名
C 備考欄
D 原価（GBP） — dual-purpose: program output, and manual fallback input
E 商品名
F 商品説明
G 画像ファイル名
H ステータス
I カテゴリー
J 原価＋ショップ配送料（GBP）
K 国際送料（GBP）
L 出品価格（円）
M 利益率
N 情報取得元URL
```

## Client Input Columns

Do not modify:

- A 商品URL
- B ブランド名
- C 備考欄
- N 情報取得元URL

B is used for brand margin calculation. It is not the shop name. The shop is resolved from the A-column URL hostname, never from the N-column URL.

D is normally a program output column, but it is also read as a manual fallback input before processing. See "Manual Cost Input (Column D)" below.

N holds an alternate product-page URL supplied by the client, used when the A-column shop does not allow image use or cannot be scraped (e.g. blocked by bot protection). See "Alternate Info Source (Column N)" below.

## Manual Cost Input (Column D)

`readProducts()` reads column D as `manualCost` using the Sheets API default `FORMATTED_VALUE` render option, so the value arrives as a display string (e.g. `1,032`, `€1,200.00`).

`parseManualCost()` in `src/index.js` parses this string:

- NFKC-normalizes the text (handles full-width digits and punctuation) and trims
  whitespace, including a leading newline (observed in real sheet data).
- Rejects unsupported currencies outright — `円`, `JPY`, `¥`, `USD`, `$` — returning
  `null` rather than silently defaulting to GBP.
- Detects currency: `€`/`EUR`/`EURO`/`ユーロ` → EUR; `£`/`GBP`/`ポンド`/`スターリング`
  (also matches `英ポンド`/`UKポンド` as substrings) → GBP; otherwise defaults to GBP.
- Rejects a minus sign outright, returning `null` (a negative cost is never valid).
- Strips everything except digits, `.`, and `,`, then resolves which of `.`/`,` is
  the decimal separator vs. the thousands separator (`parseLocalizedNumber()`):
  - If both appear, whichever occurs **last** in the string is the decimal
    separator (handles both `1,250.00` and `1.250,00` as 1250.00).
  - If only one appears more than once, it is a thousands separator (`1.250.000` → 1250000).
  - If only one appears exactly once, it is a thousands separator when followed by
    exactly 3 digits to the end of the string (`1.250` → 1250), otherwise a decimal
    separator (`1.25` → 1.25, `1250,00` → 1250.00).
- Returns `null` if the parsed amount is not finite, or is below 5 — an amount that
  low is treated as a decimal-separator misread (e.g. `1250` read as `1.25`) rather
  than a real cost, since no product this project lists has a genuine cost under 5.

Cost resolution order (`determineCost()` in `src/index.js`):

1. If the A-column scrape produced a usable price/currency, it is converted to GBP and used. The D-column manual value is ignored in this case.
2. Otherwise, `parseManualCost(manualCost)` is evaluated.
   - A GBP value is used directly; a EUR value is converted using the `設定` sheet's `EUR_GBP_RATE` (same conversion used for scraped EUR prices).
   - If column D was left empty, cost remains unavailable (unchanged from prior behavior) — no extra status note.
   - If column D has a non-empty value that `parseManualCost()` could not parse (unsupported currency, misread amount, garbage text), the status gets `要確認：D列の原価表記を確認してください` instead of silently treating it as empty.
3. If neither source yields a usable value, cost remains unavailable.

The final GBP cost (whichever source it came from) is written back to column D, so a EUR manual entry is replaced by its GBP-converted number after the first run. Because the replaced value contains no currency marker, re-processing the row a second time parses it as a plain GBP number and does not convert it twice.

## Alternate Info Source (Column N)

When column N contains a URL, `src/index.js` scrapes it (via `scrapeProductPage()`) in addition to the A-column URL, and merges the two results with `mergeSourceData()`:

- Fields preferred from N when present, falling back to A: `name`, `brand`, `description`, `features`, `composition`, `material`, `color`, `colorSource`, `dimensions`, `productCode`, `sku`, `mpn`, `category`, `fastening`, `hardware`, `decoration`, `pockets`, `lining`, `countryOfOrigin`, `weight`, `modelInfo`, `careInstructions`.
- `price` and `currency` are always taken from the A-column scrape only, regardless of what N contains. N's page belongs to a different shop, and its displayed price is that shop's resale price, not the purchase cost.
- Image and size-guide fields (`imageSources`, `imageUrls`, `sizeGuideScreenshotBase64`, etc.) are excluded from the merge entirely; images are resolved separately (see below), never from the merge result.
- Shop resolution for shipping/category/margin purposes always uses the A-column URL (`product.url`), never the N-column URL.

When column N has a URL, images are downloaded from that URL's page (via `scrapeImagesFromUrl()` in `src/scraper.js`) instead of the A-column page. `scrapeImagesFromUrl()` reuses each shop's existing `isXxxUrl()`/`extractXxxImages()` exports when the N-column URL matches one of the 7 registered shops, and falls back to a generic image extractor otherwise. If the N-column URL is syntactically invalid, no image source is used at all (the A-column page's images are not used as a substitute, since the whole point of column N is that the A-column shop's images must not be downloaded).

If the A-column scrape stops (`shouldStop`) or throws, and column N has a URL, processing continues instead of aborting the row: A-side data is treated as empty, the A-side failure reason is kept in the status, and N-column data/images are used as available.

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

