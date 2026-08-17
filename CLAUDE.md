# Claude Code Handoff

## Project Purpose

This project automates BUYMA listing preparation from Google Sheets product URLs. It reads product rows, scrapes official EC product pages with Playwright, downloads product images, generates BUYMA listing copy with the OpenAI Responses API, calculates BUYMA pricing, and writes results back to Google Sheets.

## Read First

Read these files before changing code:

1. `README.md`
2. `docs/project-overview.md`
3. `docs/spreadsheet-spec.md`
4. `docs/pricing-rules.md`
5. `docs/scraper-guide.md`
6. `docs/buyma-generation.md`
7. `docs/known-issues.md`
8. `prompts/buyma-generation.md`
9. Relevant files under `src/`

Current code is authoritative when README or older notes disagree with implementation.

## Environment

Verified on this Mac on 2026-08-17:

- Node.js v24.19.0 at `/usr/local/bin/node` (official LTS installer)
- npm 11.17.0 at `/usr/local/bin/npm`
- Playwright Chromium revision 1228 installed and launch-verified
- Dependencies installed with pnpm and matching `pnpm-lock.yaml`

`node` and `npm` are on `PATH`. Do not use a bundled or cached Node runtime from
another tool. Do not run `npm install`; dependencies already match the lockfile.

## Commands

Setup commands, safe to run:

```bash
cd /Users/yuika/Documents/EC
npm run playwright:install   # only when Chromium is missing
npm run auth:google          # only when the OAuth token is missing or expired
```

Pipeline command, requires explicit user permission:

```bash
npm start                    # scrapes, calls OpenAI, and writes to the live sheet
```

`npm start` runs `src/index.js`, which writes D-M columns on the live spreadsheet.
Never run it for verification. See `Safety Rules For Verification`.

Limit execution with `.env`:

```env
START_ROW=2
END_ROW=2
```

## Entrypoint

- Main process: `src/index.js`
- Google OAuth: `src/googleAuth.js`
- Google Sheets I/O: `src/sheets.js`
- Scraping dispatcher: `src/scraper.js`
- Pricing: `src/pricing.js`
- OpenAI generation: `src/openaiClient.js`
- Prompt: `prompts/buyma-generation.md`

## Main Features

- Reads rows from Google Sheets.
- Skips rows whose status starts with `完了`.
- Uses shop-specific scrapers when available.
- Downloads images into `images/{spreadsheetRowNumber}/`.
- Generates BUYMA titles, product comment, and product details as JSON.
- Writes D-M columns only.
- Calculates GBP-based costs, international shipping, listing price, and profit rate.
- Handles EUR product price conversion to GBP using `EUR_GBP_RATE`.
- Saves Self-Portrait garment measurement screenshots as `size_guide.jpg`.

## Important Prohibitions

- Do not edit A/B/C columns in Google Sheets.
- Do not commit `.env`, OAuth JSON, tokens, `images/`, `logs/`, or `node_modules/`.
- Do not expose API keys, OAuth secrets, refresh tokens, or sheet credentials.
- Do not infer missing product facts.
- Do not auto-confirm price or currency when price/currency is unavailable or unsupported.
- Do not change pricing formulas unless explicitly requested.
- Do not replace shop-specific image extraction with broad `document.images` fallback.
- Do not bypass Cloudflare, Akamai, bot protection, or access controls.
- Do not run bulk sheet updates before a one-row test.
- Do not run `npm start` or `src/index.js` without explicit user permission.
- Do not include execution, write, or delete operations in verification commands.
- Do not commit or push unless explicitly requested.

## Safety Rules For Verification

These rules apply to environment checks, syntax checks, and read-only tests.

1. Do not `require` or execute `src/index.js` for verification. Loading it starts
   `main()`, which writes `処理中` to column H on the live sheet.
2. Do not run `npm start` without explicit user permission.
3. Do not include any command that can trigger `main()` in a verification command.
4. Any operation that can write to the live spreadsheet is allowed only when the
   user has explicitly said it may be run.
5. Read-only checks must use read-only Google Sheets APIs such as
   `spreadsheets.values.get`, `spreadsheets.get`, and `readSettings()`.
   Do not use `values.update`, `values.batchUpdate`, `updateStatus()`, or
   `writeResult()` for verification.
6. Before presenting a verification command, confirm line by line that it contains
   no execution, write, or delete operation. Do not rely on a warning comment that
   tells the user to skip a dangerous line.

Modules that are safe to load for verification because they have no side effects
on load:

```text
src/config.js
src/sheets.js
src/pricing.js
src/scraper.js
src/openaiClient.js
src/images.js
src/shops/*.js
```

`src/index.js` and `src/googleAuth.js` call `main()` on load and must not be
required for verification.

## Google Sheets

The active sheet columns are:

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

The `設定` tab provides runtime settings such as `GBP_JPY_RATE`, `BUYMA_FEE_RATE`, `CONSUMPTION_TAX`, and `EUR_GBP_RATE`.

## BUYMA Generation

Always use `prompts/buyma-generation.md`. Output JSON has exactly:

```json
{
  "title": "",
  "titleCandidates": [],
  "description": "",
  "productDetails": ""
}
```

Current sheet title behavior: column E receives up to five generated title candidates joined by newlines. The original scraped product name is kept internally as `scraped.name`.

## Shop-Specific Scrapers

Current shop files are in `src/shops/`:

- `vivienneWestwood.js`
- `hobbsLondon.js`
- `zalando.js`
- `harveyNichols.js`
- `selfPortrait.js`
- `phaseEight.js`
- `selfridges.js`

Do not weaken these dedicated paths. For Selfridges, automatic scraping is intentionally disabled and should stop with `要確認：Selfridgesページ取得不可`.

## Commit And Push

Before commit or push:

1. Run `git status --short --branch`.
2. Confirm changed files are only the requested files.
3. Do not include credentials or generated image/log files.
4. Commit and push only when the user explicitly asks.

