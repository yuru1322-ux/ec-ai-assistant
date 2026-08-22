# Known Issues And Safety Rules

## Known Limitations

### Site Access Controls

Do not bypass bot protection, Akamai, Cloudflare, or other access control systems.

- Zalando may fail due to Akamai or product main area detection.
- Selfridges is currently excluded from automatic scraping and stops with `要確認：Selfridgesページ取得不可`.

### Region And Locale

Shop pages can render different data depending on country, cookie, browser locale, and site session. If official information is missing, do not infer it.

### Generic Scraper

The generic scraper can mix in irrelevant images because it uses `document.images`. Dedicated shop scrapers should avoid this and should not fall back to generic image extraction unless explicitly designed and tested.

### README Drift

README still contains service-account setup text. Current code supports:

- service account if `GOOGLE_APPLICATION_CREDENTIALS` exists
- OAuth client/token fallback via `google-oauth-client.json` and `google-oauth-token.json`

Treat implementation as authoritative when documentation differs.

## Status Values

Core constants from `src/status.js`:

- `処理中`
- `正常終了`
- `完了`
- `エラー発生`
- `エラー`

Common completion statuses:

- `完了`
- `完了（サイズ情報なし）`
- `要確認：商品名取得失敗`
- `要確認：商品説明取得失敗`
- `要確認：Features取得失敗`
- `要確認：素材取得失敗`
- `要確認：カラー取得失敗`
- `要確認：価格取得失敗`
- `要確認：商品コード取得失敗`
- `要確認：商品画像取得失敗`
- `要確認：カテゴリー判定`
- `要確認：ショップ送料未登録`
- `要確認：ショップ送料を手入力してください`
- `要確認：商品URLを確認してください`
- `要確認：通貨判定失敗`
- `要確認：通貨換算が必要（XXX→GBP）`
- `要確認：EUR/GBP為替レートを確認してください`
- `要確認：ブランド別利益率が未登録のため20％を適用しました`
- `要確認：利益率がブランド別目安上限を超えています`
- `要確認：革靴の可能性があります。関税を手入力してください`
- `要確認：Zalandoページ取得失敗`
- `要確認：Selfridgesページ取得不可`
- `要確認：情報取得元URL（N列）を確認してください`
- `要確認：情報取得元URL（N列）から画像取得失敗`
- `要確認：情報取得元URL（N列）の取得に失敗しました`
- `要確認：A列の商品情報取得に失敗しました`
- `要確認：原価はD列の手入力値（GBP）を使用しました`
- `要確認：原価はD列の手入力値（EUR→GBP換算）を使用しました`
- `要確認：D列の原価表記を確認してください`
- `要確認：ショップ送料が暫定値（0）です`

`appendStatusMessages()` suppresses duplicate reason text.

Status text must never contain a separator character (読点`、`, comma, or newline)
or a raw error message/stack trace. `extractStatusReasons()` splits on `、`, `,`,
and `\n` to detect duplicate reasons; embedding free-form error text (which commonly
contains commas and newlines) breaks that dedup and can make an H-column cell grow
unbounded across repeated runs. When an exception must be recorded, log it via
`writeErrorLog()` and push a short fixed status string instead.

## Secrets

Never commit or display:

- `.env`
- `google-oauth-client.json`
- `google-oauth-token.json`
- service account JSON
- OpenAI API keys
- OAuth refresh tokens

`.gitignore` currently excludes:

- `node_modules/`
- `.pnpm-store/`
- `.DS_Store`
- `.env`
- `google-oauth-client.json`
- `google-oauth-token.json`
- `images/`
- `logs/`

## Git Safety

- Check `git status --short --branch` before and after work.
- Do not commit or push unless explicitly requested.
- Do not reset, revert, or delete branches unless explicitly requested.
- Do not include generated images/logs or credentials.

## Sheet Safety

- Do not update A/B/C columns.
- Do not bulk-process production rows before testing one row.
- Do not overwrite client notes.
- If a row fails, continue other rows when running normal processing.
- For manual category/price recalculation tasks, do not scrape or regenerate copy unless requested.

## Scraper Safety

- Do not infer product facts from URL slugs when the site did not provide them, except for internal diagnostics.
- Do not auto-confirm prices from stale search indexes.
- Do not use search-engine snippets as authoritative product facts unless the user explicitly accepts that risk.
- Do not mix brand name and shop name. B column is brand; URL hostname resolves shop.

## Codex-Specific Items That Do Not Transfer

- Codex approval state and approved command prefixes do not transfer to Claude Code.
- Codex bundled Node path may not exist or may differ outside this environment.
- Google OAuth browser flow may need to be rerun in the Claude/local shell environment.
- In-app browser sessions/cookies do not transfer.

## Claude Code Migration Readiness

Claude Code can work on this project after reading `CLAUDE.md` and `docs/`, but should first verify:

- Node/npm availability
- `.env` values exist locally
- Google OAuth token is valid
- Playwright Chromium is installed
- OpenAI API key is configured
- `GOOGLE_SHEET_NAME`, `START_ROW`, and `END_ROW` are safe for the intended task

