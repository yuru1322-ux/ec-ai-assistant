# Project Overview

## Purpose

The EC automation project prepares BUYMA listings from product URLs stored in Google Sheets. It combines Playwright scraping, shop-specific extraction logic, OpenAI Responses API text generation, image downloading, and BUYMA price calculation.

## Runtime Stack

- Node.js CommonJS JavaScript
- Playwright Chromium for product page access
- Google Sheets API for row reads and writes
- OpenAI Responses API for BUYMA title/comment/detail generation
- dotenv for local configuration

## Main Flow

1. `src/index.js` creates `images/` and `logs/` if missing.
2. `src/sheets.js` authenticates with Google Sheets.
3. `readSettings()` reads the `設定` tab once at process start.
4. `readProducts()` reads product rows from the configured sheet.
5. Rows with a URL and status not starting with `完了` are processed.
6. Each row status is set to `処理中`.
7. `src/scraper.js` opens the product URL with Playwright.
8. Shop-specific scraper logic is used when available.
9. Product images are downloaded by `src/images.js`.
10. Self-Portrait size guide screenshots are saved when available.
11. `src/openaiClient.js` sends scraped data to OpenAI using `prompts/buyma-generation.md`.
12. `src/pricing.js` calculates category, shipping, listing price, and profit rate.
13. `writeResult()` writes D-M columns back to Google Sheets.
14. Errors are logged under `logs/`.

## Key Files

- `src/index.js`: orchestration and per-row processing
- `src/config.js`: environment variable configuration
- `src/sheets.js`: Google Sheets auth/read/write
- `src/scraper.js`: scraper dispatcher and generic fallback
- `src/shops/*.js`: shop-specific scrapers
- `src/images.js`: image download, dedupe, row folder handling, size guide save
- `src/openaiClient.js`: OpenAI Responses API call and output sanitizing
- `src/pricing.js`: pricing, brand margin, shop shipping, category logic
- `src/googleAuth.js`: OAuth token generation
- `src/logger.js`: error log writer
- `prompts/buyma-generation.md`: official generation prompt

## Image Storage

Product images are saved under the spreadsheet row number:

```text
images/
  43/
    01_main.jpg
    02_sub.jpg
    03_sub.jpg
    size_guide.jpg
```

Before saving images for a row, generated files matching `01_main.*`, `数字_sub.*`, and `size_guide.*` are deleted from that row folder. Other manually added files are preserved.

Column G stores image file names only, sorted by file name. It does not store URLs, folders, or full paths.

## Logs

Runtime errors are written to `logs/error-row-{row}-{timestamp}.log`. Log files are ignored by Git.

## External Services

- Google Sheets API
- OpenAI API
- Product websites accessed through Playwright

Network access, site rendering, cookies, region display, and bot protection can affect scraping. Do not bypass access controls.

## Claude Code First Prompt

Use this prompt when first opening the project in Claude Code:

```text
Please read CLAUDE.md, README.md, docs/, src/, and prompts/buyma-generation.md.
Do not change code yet.
Explain the current project structure, Google Sheets columns, pricing calculation, BUYMA generation prompt, shop-specific scrapers, image handling, known limitations, and safety rules.
Also report any README content that appears older than the current implementation.
```

## Minimal E2E Test

1. Pick one safe test row.
2. Set `.env`:

```env
START_ROW=2
END_ROW=2
```

3. Run:

```bash
npm start
```

4. Verify:

- Product page opened
- Scraped name, brand, price, currency, category
- BUYMA titles, comment, details generated
- Images saved in `images/{row}/`
- Self-Portrait saves `size_guide.jpg` when supported
- D-M columns updated
- A/B/C columns unchanged
- H status is `完了`, `完了（サイズ情報なし）`, `要確認...`, or `エラー...`

