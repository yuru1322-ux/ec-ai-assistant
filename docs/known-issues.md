# Known Issues And Safety Rules

## Known Limitations

### Site Access Controls

Do not bypass bot protection, Akamai, Cloudflare, or other access control systems.

- Zalando may fail due to Akamai or product main area detection.
- Selfridges is currently excluded from automatic scraping and stops with `要確認：Selfridgesページ取得不可`.

### Region And Locale

Shop pages can render different data depending on country, cookie, browser locale, and site session. If official information is missing, do not infer it.

### Generic Scraper

The generic image fallback (`extractGenericImages()` in `src/scraper.js`,
shared by both the A-column and N-column generic paths) prioritizes
JSON-LD `Product.image` and `og:image`, and only falls back to
`document.images` when those are insufficient. The DOM path is filtered by
a URL keyword blocklist, a product-identifier match extracted from the
trusted JSON-LD/og:image URL (falling back to most-frequent-host limiting
when no identifier is available), requires `excludeBelowWidth: 400`, and
is capped at 15 images. See `docs/scraper-guide.md`'s "Generic Image
Extraction" and "Product Identifier Filtering" sections for the full
filter list.

Verified end-to-end against breuninger.com in production (sheet rows 20
and 21, an N-column source with no dedicated scraper): raw candidates
(77–106 depending on the run) were reduced to 14 images per row, and every
one of the 28 downloaded files was opened and visually confirmed to be a
genuine photo of the correct product — no brand logos, no vendor (OneTrust)
logos, no other products or colourways, no navigation banners. A separate
comparison run also confirmed that without product identifier filtering
(most-frequent-host limiting only), the same site let 1 wrong-colourway
thumbnail through on one of the two pages once the site's homepage content
had rotated — this class of contamination is real, not hypothetical, and
product identifier filtering is what actually prevents it now.

Residual risk: product identifier filtering only helps when the trusted
JSON-LD/og:image URL contains a matchable product code that the site's own
DOM candidates repeat. A site with no embedded product code in its image
URLs falls back to most-frequent-host limiting, which cannot distinguish a
same-host "other product" from the real one — see
`docs/scraper-guide.md`'s "General Caveat" for detail. Dedicated shop
scrapers should still avoid `document.images` entirely and should not fall
back to generic image extraction unless explicitly designed and tested.

### A-Column Access Failure Detection

Three ways an A-column scrape has been observed to fail silently (no
exception, no obviously-wrong data at a glance) are handled by two layers:

1. **HTTP block (403/404/5xx)** — The generic fallback's shared
   `page.goto()` (used by Phase Eight, Self-Portrait, Harvey Nichols,
   Vivienne Westwood, Hobbs London, and any unsupported shop) checks the
   HTTP response status via `inspectGenericAccess()` in `src/scraper.js`.
   A blocking status returns `要確認：A列の商品情報取得に失敗しました`
   immediately, without attempting extraction. Observed on Moncler's
   official site (`HTTP 403`).
2. **Soft block (HTTP 200 with a bot-challenge or region-redirect page)** —
   Not detectable by status code, since the response is a normal 200.
   Instead, `getCompletionStatus()` in `src/index.js` detects this *by
   result*: if the A-column scrape's own name, price, and images are all
   empty, and the N-column hasn't already supplied a usable name, it
   returns the same `要確認：A列の商品情報取得に失敗しました` status
   instead of enumerating individual missing fields. This intentionally
   does not try to pattern-match the cause (bot-challenge text, redirect
   target, etc.) — different failure modes produce the same empty result,
   and matching by result is more robust than chasing each cause
   individually. Two distinct causes were observed to hit this path:
   - mytheresa.com: `HTTP 200`, body reads "Something went wrong...
     Reference BOT: ..." (a bot-challenge page).
   - viviennewestwood.com: `HTTP 200`, but redirected to the Japan-locale
     homepage instead of the requested `/en-gb/` product page (a
     region/geo redirect, likely tied to the scraping environment's
     network location). This is unrelated to today's code changes — it is
     pre-existing site/environment behavior, not a regression.

   This detection is skipped when the N-column already supplied a usable
   product name (`merged.name`), so a Moncler-official + N-column row
   (e.g. the tessabit or breuninger rows) is unaffected: the A-column
   block is still recorded separately via `extraNotes`, but the row
   continues processing normally with N-column data and D-column manual
   cost.

Neither layer inspects response body content for bot-challenge phrases —
that was considered and intentionally not implemented, since result-based
detection (empty name/price/images) already covers the soft-block cases
observed without needing per-cause pattern matching.

### mytheresa.com

mytheresa.com's product pages cannot be retrieved with any permitted
technique. This was investigated directly (not inferred) across two
rounds of testing against a real product URL from the production sheet.
**Do not repeat this investigation** — the following table is exhaustive
within the boundaries CLAUDE.md allows, and a future session should go
straight to the manual workflow in README.md's "既知の制限" instead of
re-testing headless modes, wait strategies, or URL variants.

| Technique tried | Result |
| --- | --- |
| `headless: false` (visible browser) | Blocked |
| Extended wait (60s `waitForSelector` on h1/price/image, replacing the initial short `domcontentloaded`-only wait) | Blocked — confirmed the page was genuinely blocked, not still rendering |
| Stripped tracking query parameters (`utm_*`, `gclid`, `gbraid`, `dplink`, `slink*`, ...) | Blocked |
| Homepage first, then navigate to the product page (same browser session/cookies) | Homepage succeeded under `headless:false` (real navigation content, not a challenge page); product page still blocked in the same session |
| Alternate locale (`/de/de/` instead of `/gb/en/`) | Blocked |

Every blocked attempt returned `HTTP 200` with a bot-challenge page in the
body ("Something went wrong... Please try again in a moment... Report the
issue..."). Two distinct Reference ID prefixes were observed — `BOT` and
`CPR` — suggesting more than one detection rule is involved, not a single
simple check.

The homepage succeeding under `headless:false` (with real content) while
the product page still blocked in the same browser session rules out a
blanket IP/region block: this is a product-page-specific defense, not a
site-wide one.

Techniques not tried, because CLAUDE.md prohibits them: User-Agent
spoofing, rewriting `navigator.webdriver` or other stealth-plugin
fingerprint changes, CAPTCHA solving, proxy/IP rotation. Do not attempt
these for mytheresa.com or any other shop.

See README.md's "既知の制限" for the semi-automatic manual workflow used
for mytheresa.com rows (manual D-column cost entry, automatic
category/pricing, manual E/F/G columns).

#### Design note: do not treat mytheresa.com as instant-stop like Selfridges

`processProduct()` in `src/index.js` returns immediately when
`scraped.shouldStop` is true **and** the row has no N-column URL (the
`if (!infoSourceUrlRaw) { ...; return; }` branch, before any pricing
runs). Selfridges uses this path deliberately: `inspectSelfridgesPage()`
always returns `shouldStop: true`, and Selfridges rows have no
alternative price source worth calculating from, so stopping before
pricing is correct there.

mytheresa.com rows do **not** have an N-column alternative either, but
unlike Selfridges they still have a usable D-column manual cost and a
determinable shop/category from the A-column URL alone (shop name
"MYTHERESA", its free-shipping threshold, and category keywords in the
URL path). If mytheresa.com were changed to return `shouldStop: true` (an
instant-stop shape like Selfridges), pricing (I/J/K/L/M columns) would
never be calculated for these rows even when D-column cost is filled in —
the early return happens before `determineCost()`/`calculatePricing()`
ever run. The current behavior — continue processing, let per-field or
A-column-total-failure statuses accumulate in H, still calculate pricing
from the manual D-column cost — is what makes the semi-automatic workflow
possible. Do not add a mytheresa-specific `shouldStop` path.

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

