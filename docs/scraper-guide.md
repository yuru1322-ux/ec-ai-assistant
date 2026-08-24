# Scraper Guide

`src/scraper.js` dispatches product URLs to shop-specific scrapers before falling back to generic extraction.

Dedicated shop scrapers must not be weakened into broad `document.images` extraction. For shops with dedicated image logic, failure should usually become `要確認：商品画像取得失敗` rather than collecting unrelated page images.

## Dispatcher Order

1. Zalando preflight and dedicated scraping
2. Selfridges protection stop
3. `page.goto()` for other shops, via `inspectGenericAccess()` (see HTTP
   Status Detection below)
4. Phase Eight
5. Self-Portrait
6. Harvey Nichols
7. Vivienne Westwood or Hobbs London
8. Generic fallback for unsupported shops

Step 3's `page.goto()` is shared by every shop reached in steps 4-8 —
Phase Eight, Self-Portrait, and Harvey Nichols do not have their own
`page.goto()`/`shouldStop` preflight; they rely on this same shared call.
Only Zalando (step 1) and Selfridges (step 2) bypass it with their own
dedicated navigation.

## HTTP Status Detection (A-column)

`inspectGenericAccess()` in `src/scraper.js` wraps the shared `page.goto()`
from Dispatcher Order step 3. If the response status is 403, 404, or 5xx, it
returns `{ shouldStop: true, status: '要確認：A列の商品情報取得に失敗しました', reason: 'HTTP {status}' }`
and `scrapeProductPage()` returns immediately, before any shop-specific
dispatch runs. This is the same pattern as Zalando's `inspectZalandoPage()`.
`src/index.js` already handles `shouldStop` from any source: if the row has
no N-column URL it stops the row with that status; if the row has an
N-column URL, it records the status as a note and continues processing with
the N-column data and the D-column manual cost, unaffected by the A-column
failure.

This only detects a blocking HTTP status code. It does not detect a "soft
block" — a page that returns HTTP 200 but serves a bot-challenge or error
page in its body (observed on mytheresa.com: HTTP 200 with a "Something
went wrong... Reference BOT:" page). Soft-blocked pages still fall through
to normal extraction and typically end up with most or all fields empty,
which surfaces as the existing per-field `要確認：...取得失敗` statuses
rather than a single clear "site blocked" status.

This check does not apply to `scrapeImagesFromUrl()` (the N-column image
path): a blocked N-column page currently still attempts extraction and
usually yields zero images, which `src/index.js`'s `resolveImageStatus()`
already reports as `要確認：情報取得元URL（N列）から画像取得失敗`. Adding
the same HTTP-status check there would need a different status string (the
failure is not on "A列") and was left out of this change; see
`docs/known-issues.md` if this becomes a recurring problem.

## Image-Only Dispatch (N-column)

`scrapeImagesFromUrl()` in `src/scraper.js` is a separate dispatcher used
only for the N-column image source URL. It checks the same shop list as
`scrapeProductPage()` plus Tessabit, which participates in this dispatcher
only. Product data (name, price, color, etc.) for Tessabit N-column rows
still comes from `scrapeProductPage()`'s generic fallback; only image
extraction is dedicated.

## Generic Fallback

Generic fallback reads, for product text fields:

- JSON-LD Product
- `h1`
- meta/OG title and description
- generic labeled text for brand/color/material/category

Do not rely on generic fallback for shops that have dedicated handlers.

### Generic Image Extraction

`extractGenericImages()` in `src/scraper.js` is shared by both
`scrapeProductPage()`'s generic fallback (A-column) and
`scrapeImagesFromUrl()`'s generic fallback (N-column). Both call the exact
same function; there is no separate image logic between the two paths
anymore.

Source priority (each step only runs if the previous one did not already
return enough images):

1. JSON-LD `Product.image` (string, array, or `{url}`/`{"@id"}` object
   forms are all accepted)
2. `og:image` / `og:image:secure_url` meta tags
3. `document.images`, filtered and capped (see below)

"Enough" is 3 images (`GENERIC_IMAGE_SUFFICIENT_COUNT`). Below 3, the next
source is added; below 3 even after JSON-LD + og:image, DOM collection also
runs. This threshold is a judgment call, not a measured value — raise it if
JSON-LD-only results turn out to be routinely too sparse for a listing.

DOM collection (`document.images`), only used when priority sources are
insufficient:

- Per `<img>`, candidates are: the best (highest `w`/`x`) candidate from
  `srcset`, the best from `data-srcset`, then `currentSrc`, `src`,
  `data-src`, `data-original`, `data-zoom-image`.
- `data:` URIs and `.svg` are dropped before any other filtering.
- URL keyword exclusion (case-insensitive substring match): `logo`, `icon`,
  `sprite`, `banner`, `placeholder`, `cookie`, `consent`, `onetrust`,
  `payment`, `badge`, `social`, `flag`, `avatar`, `spinner`, `loader`,
  `newsletter`, `swatch`. Verified against breuninger.com (an N-column
  source with no dedicated scraper): this list caught the OneTrust
  cookie-banner logo (`onetrust`, `cookie`, `logo` all matched) and
  Chanel/carrier SVGs (dropped earlier by the `.svg` rule instead). It does
  **not** catch breuninger's "you may also like" product-recommendation
  carousel — those thumbnails share the exact same CDN host and path shape
  as the real product photos and contain no exclusion keyword. See
  "Product Identifier Filtering" below for how that case is actually
  closed.
- Product identifier filtering (see "Product Identifier Filtering" below):
  when a product code can be extracted from the JSON-LD/og:image URL, DOM
  candidates are restricted to URLs containing that code, and
  most-frequent-host limiting is skipped in favor of this more precise
  filter.
- Most-frequent-host limiting: fallback used only when no product
  identifier could be extracted, or when the extracted identifier matched
  zero DOM candidates. Keeps only URLs on the single most common hostname
  among the (keyword/svg/data-filtered) DOM candidates. On breuninger.com
  this removes the site's navigation "flyout" images and payment/carrier
  icon hosts, which are on different hosts than the product's own CDN. It
  does **not** help against same-host contamination (that's what product
  identifier filtering is for).
- Every returned image (from all three sources) carries
  `excludeBelowWidth: 400` (`GENERIC_IMAGE_MIN_WIDTH`). `src/images.js`
  measures the actually downloaded image and drops anything narrower.
  Verified against breuninger.com: 400 keeps every real product photo
  (all ≥1359px wide in practice) and drops the page's 144×197 colour-swatch
  thumbnails.
- Capped at 15 images total (`GENERIC_IMAGE_MAX_COUNT`), across all three
  sources combined, in source-priority then DOM-document-order. A
  console.log line reports when the cap truncates a larger result.

### Product Identifier Filtering

`extractProductIdentifier()` in `src/scraper.js` pulls a likely product-code
token out of the first JSON-LD `Product.image` URL (or the first `og:image`
URL if JSON-LD had none) so DOM candidates can be restricted to the same
product instead of relying only on keyword/host heuristics:

- Looks at the URL's pathname only (not the hostname), splits on
  non-alphanumeric characters, and keeps tokens of 8+ characters that are
  either purely numeric or a mix of letters and digits (a bare word like
  `download` does not count).
- The longest matching token is assumed to be the product code, on the
  reasoning that a coincidentally-long token (a date, a timestamp) is
  usually shorter than an actual SKU/product-code string.
- If an identifier is found, DOM candidates are filtered to only those
  whose URL contains it, **instead of** most-frequent-host limiting. If
  filtering yields zero matches (or no identifier could be extracted at
  all), the pipeline falls back to most-frequent-host limiting — this
  never regresses below the pre-identifier-filtering behavior.
- Every application (or fallback) is logged, including the identifier used
  and the before/after candidate count.

This closes the "Known Gap" originally documented here: breuninger.com's
JSON-LD image URL and its own gallery images share a numeric product code
(e.g. `100323682811000`) in the path, while the "you may also like"
carousel's images carry a *different* product code. Verified on both
breuninger.com pages used to build this feature (rows 20 and 21 of the
production sheet, one boy's-fit and one women's-fit jacket): with product
identifier filtering, 15/15 final images were the correct product on both
pages, confirmed by opening every downloaded file. With the filtering
disabled (most-frequent-host limiting only, the pre-identifier-filtering
behavior), the same raw candidate pool produced 1 contaminated image out of
15 (a different colourway's thumbnail) on one of the two pages when re-run
after the site's homepage content had rotated — i.e. the contamination this
gap describes is not hypothetical, it reproduced once ordering shifted
slightly. See the row 20/21 production test for the full comparison.

Residual risk: this only helps when the trusted JSON-LD/og:image URL
contains a matchable identifier and the site's DOM candidates repeat that
same identifier in their own URLs. A site where product photo URLs don't
embed any product code (fully random/hashed filenames) gets no benefit
from this filter and falls back to most-frequent-host limiting, which
still cannot distinguish same-host "other products" — see the general
caveat below.

`canonicalKey` is left unset on generic image objects, same as before this
change: `src/images.js` falls back to its own query-stripped URL as the key.
Different CDN size-tier URLs for the same underlying photo (e.g. a `webp`
and a `jpg` version, or two different pixel-width paths) are **not**
deduplicated against each other — they differ by path, not just query
string, and are downloaded as separate, non-identical files. This can use
up part of the 15-image budget on near-duplicate resolutions of the same
shot rather than more distinct angles; it does not introduce wrong or
unrelated images.

### General Caveat: Sites Without a Matchable Product Identifier

Same-host, same-URL-shape "other product" contamination (e.g. a "you may
also like" recommendation carousel using the same CDN and path pattern as
the real product's own photos) is closed for sites where product identifier
filtering applies — see "Product Identifier Filtering" above. It remains a
real risk only when **no** product identifier can be extracted from the
trusted JSON-LD/og:image URL, or when DOM candidates don't repeat that
identifier in their own URLs (e.g. fully random/hashed image filenames with
no embedded product code). In that fallback case the pipeline still has
only keyword exclusion, most-frequent-host limiting, the 400px floor, and
the 15-image cap to rely on — none of which can distinguish a same-host,
above-400px "other product" from the real one. This is a residual risk for
future unknown N-column sites, not a guarantee of correctness.

## Vivienne Westwood

File: `src/shops/vivienneWestwood.js`

URL match:

- hostname exactly `www.viviennewestwood.com`
- path starts with `/en-gb/`

Product data:

- Product name: JSON-LD/name and page selectors
- Brand: JSON-LD brand
- Price/currency: JSON-LD offers
- Description/Features/Code/Composition/Care: page sections and text blocks
- Color: selected swatch first, then title/variant/JSON-LD/URL/meta fallback
- Product code: page Code, JSON-LD sku/mpn, URL fallback
- Category: URL/category text

Images:

- `.b-product_gallery-main .b-product_image-img`
- `.b-product_slider .b-product_image-img`
- Chooses zoom/link/srcset/data-original/data-src/currentSrc/src in priority order
- `sw`, `sh`, and `q` are safely set with URL APIs
- Canonical key ignores size/quality variations
- Warning width: 2000

Known limits:

- Only en-gb official pages are treated as Vivienne official.
- Locale/region rendering can still affect page content.

## Hobbs London

File: `src/shops/hobbsLondon.js`

URL match:

- `hobbs.com`
- `www.hobbs.com`

Product data:

- Name: `h1.product-detail__product-name`, JSON-LD fallback
- Price/currency: JSON-LD offers, meta, `.product-detail__prices`
- Color: `.product-detail__attribute--color .product-detail__attribute__display-value`, selected color option, JSON-LD fallback
- Description: `#collapseDetails p`, JSON-LD/meta fallback
- Features: `#collapseDetails li`
- Composition/material: `#collapseDescription li`
- Product code: `Product Code`, JSON-LD sku/mpn, URL fallback
- Category: breadcrumb first, URL fallback
- Model/dimensions/care extracted from detail/fabric text where available

Images:

- `.primary-images .main-gallery-inner img.primary-images__image`
- thumbnails are excluded
- high quality URL sets `fmt=jpg`, `qlt=95`, `wid=2000`
- warning width: 2000

## Zalando

File: `src/shops/zalando.js`

URL match:

- any hostname matching `zalando.*`

Preflight:

- stops on HTTP 403
- stops on HTTP 503
- stops on page.goto timeout
- stops when main product region is not detected

Stop status:

```text
要確認：Zalandoページ取得失敗
```

Product data:

- Product root: main/article/product-like region
- Price/currency: product price display, meta/OG, JSON-LD offers
- EUR is expected for Zalando Ireland and is returned as `currency = EUR`
- Brand/name: product main region, JSON-LD fallback
- Color: current selected color text around product main region
- Materials/features: Material & care, Details, Size & fit sections
- Product code: Article number or URL fallback
- Category: breadcrumbs first, then URL/name fallback

Images:

- product gallery images from `img01.ztat.net/article/spp-media-`
- `document.images` all-image fallback is not used
- high quality sets `imwidth=1800`
- canonical key removes image width variants

Important:

- Do not implement Akamai or bot-protection bypass.
- EUR to GBP conversion happens in `src/index.js`, not in `zalando.js`.

## Harvey Nichols

File: `src/shops/harveyNichols.js`

URL match:

- `harveynichols.com`
- `www.harveynichols.com`

Product data:

- Uses `window.BC_product` and `window.BCData`
- Name: `BC_product.custom_fields["Displayable Product Name"]`, h1 fallback; removes brand/New Season noise
- Brand: `BC_product.brand.name`
- Price: `BCData.product_attributes.price.with_tax`, page/meta fallback
- Currency: BCData/product/meta fallback
- Color: `BC_product.custom_fields.Colour`
- Material/features/description: `.tab-content.info-care` and `.tab-content.size-fit`
- Product code: SKU No., BCData sku/mpn, Style No.
- Category: `BC_product.category`

Images:

- `window.BC_product.images` only
- `/images/stencil/{size}/` and `/images/stencil/{:size}/` normalized to `/images/stencil/2000w/`
- canonical key removes stencil size segment
- warning width: 1500

## Self-Portrait

File: `src/shops/selfPortrait.js`

URL match:

- `self-portrait.com`
- `www.self-portrait.com`

Product data:

- Name: JSON-LD Product.name, h1 fallback
- Brand: JSON-LD brand.name, ShopifyAnalytics vendor fallback
- Price/currency: JSON-LD offers, ShopifyAnalytics variant fallback
- SKU/product code: JSON-LD offer SKU, Shopify variant SKU
- Color: JSON-LD color, then current product name/handle/variant fallback
- Category: JSON-LD BreadcrumbList
- Description and Features: `#drw-PrdAccordion_AccDescription`
- Composition: `#drw-PrdAccordion_AccComposition`
- Model info: extracted from description text

Images:

- JSON-LD Product.image is highest priority
- DOM `main img` is only supplemental when it matches the same image stem
- SKU matching is supplemental only
- Shopify CDN `cdn/shop/files` images only
- excludes EDITS, RESIDENCY, banner, logo, navigation, related, thumbnails, and known non-product ranges
- removes `width` query to get high-resolution Shopify images
- canonical key removes width and preserves `v`
- warning width: 3000

Size guide:

- Opens Size Guide
- selects Garment measurement
- selects Centimetres
- screenshots `.prd-SizeGuide_Table` as JPEG
- returns table rows and formatted measurements
- `src/index.js` stores formatted garment measurements as `scraped.dimensions`
- `src/images.js` saves `size_guide.jpg`

Important:

- Do not confuse Garment measurement with Body measurement or Size conversion.
- Table rows and columns vary by product.

## Phase Eight

File: `src/shops/phaseEight.js`

URL match:

- `phase-eight.com`
- `www.phase-eight.com`

Product data:

- Name: JSON-LD Product.name
- Brand: JSON-LD offers.seller.name or `Phase Eight`
- Price/currency: JSON-LD offers, meta/page fallback
- SKU/product code: JSON-LD sku/mpn, Style code, URL fallback
- Description: product detail DOM, JSON-LD/meta fallback
- Features: product detail DOM patterns such as Size Fit, Length, Fastening, Sleeve length
- Composition/material: Details/Material accordion text
- Color: current selected color DOM or product text/JSON-LD fallback
- Category: breadcrumb/product URL/name inference

Images:

- Checks all JSON-LD Product nodes, not just the first
- Selects the image-bearing Product node with best score for current product
- Preserves JSON-LD image order
- Falls back only to Phase Eight gallery DOM:
  - `.primary-images .main-gallery-inner img.primary-images__image`
- Does not use broad `document.images`
- high quality for `/dw/image/v2/` images sets `sw=2000` and `sh=2800`
- canonical key removes query string
- warning width: 2000

Known detail:

- Some pages have one Product node for the current variation without images and another Product node for the product group with images. Keep the all-node selection logic.

## Tessabit

File: `src/shops/tessabit.js`

URL match:

- `tessabit.com`
- `www.tessabit.com`

Product data:

- Product data (name, description, color, material, price, currency, etc.) is
  not extracted by this file. Tessabit is currently only used as an N-column
  image source, and product data comes from the generic fallback in
  `scraper.js`. `scrapeProductPage()` is unchanged for Tessabit; only
  `scrapeImagesFromUrl()` dispatches to this shop.

Images:

- `.multimedia--image-original span.js-zoom-image[data-zoom]`
- Positive-selector approach, like Hobbs London: only elements inside the
  product gallery container are candidates. This is deliberate, not
  incidental — it is what keeps the favorite-button star icon
  (`.detail__icon`, outside the container) and the site-wide promotional
  popup image (outside the product container entirely) out of the result,
  without needing an exclusion keyword list.
- The `data-zoom` attribute already points at the highest resolution the
  site serves for that image (`/product/{id}/original/{uuid}.jpg`). No URL
  rewriting is applied or needed.
- Tessabit is backed by a custom CDN (`tessabit.azureedge.net`) that
  pre-generates a separate file per size tier (`micro`, `mini`, `medium`,
  `large`, `big`, `original`), each with its own UUID filename. Unlike
  Hobbs/Vivienne/Phase Eight, there is no query parameter or path segment
  that can be edited to request a larger size — the `mini` thumbnail URL and
  the `original` gallery URL do not share a filename, so a higher-resolution
  URL cannot be constructed from a smaller one. The only reliable source for
  the maximum resolution is the `data-zoom` attribute on the gallery
  element.
- The visible gallery viewer renders as a CSS background image on a `<span>`
  (via `data-bgset`/`style`), not as an `<img src>`. This is why
  `document.images` (used by the generic fallback) cannot reach it at all —
  it only sees the small `mini` thumbnail-strip `<img>` elements and an
  unrelated `<img>` pair that mirrors the gallery URLs but resolves to a
  browser-selected mid-tier candidate, never the true maximum.
- Canonical key: URL with the query string removed.
- Warning width: 1000 (this shop's real maximum is 1000×1334; do not reuse
  the 1500–3000 values from other shops here).

Known limits:

- Verified against the product used for investigation (row 18,
  `/en-GB/product/117062/...`). Other Tessabit product pages are assumed to
  follow the same markup but have not all been individually verified.

## Selfridges

File: `src/shops/selfridges.js`

URL match:

- `selfridges.com` and subdomains

Behavior:

- Selfridges is currently excluded from automatic scraping.
- `inspectSelfridgesPage()` attempts page access only to classify the failure reason.
- It always returns `shouldStop: true`.
- Status:

```text
要確認：Selfridgesページ取得不可
```

The internal Selfridges product ID may be extracted from URL, but product fields and images remain empty and must not be auto-confirmed from guesses.

Do not bypass Cloudflare or implement bot-protection circumvention.

## mytheresa.com

No dedicated file. mytheresa.com is handled entirely by the generic
fallback path — writing a dedicated scraper for it would be pointless,
because the bot protection blocks the product page itself regardless of
extraction approach; there is no page content for a dedicated scraper to
parse any better than the generic one does. See
`docs/known-issues.md`'s "mytheresa.com" section for the full record of
what was tried (headless off, extended wait, tracking-parameter removal,
homepage-first navigation, alternate locale — all blocked) and **do not
repeat that investigation**.

What actually handles mytheresa.com rows:

- The shared `page.goto()` in the generic path returns `HTTP 200` for
  mytheresa.com (not a blocking status code), so `inspectGenericAccess()`
  (see "HTTP Status Detection" above) does not fire — the bot-challenge
  page is a soft block, not a hard one.
- `getCompletionStatus()` in `src/index.js` catches this by result: since
  the A-column scrape's name, price, and images all come back empty and
  there is no N-column URL to supply a name, it returns
  `要確認：A列の商品情報取得に失敗しました` as a single status instead of
  enumerating individual missing fields.
- Because mytheresa.com rows have no N-column URL, `processProduct()`
  still continues past this point rather than stopping (mytheresa.com is
  intentionally **not** wired to `shouldStop: true` the way Selfridges
  is — see `docs/known-issues.md`'s design note on this). Shop name and
  category can still be determined from the A-column URL alone, so
  pricing runs normally as long as D-column cost is filled in manually.

Operationally this means mytheresa.com rows follow the semi-automatic
workflow documented in README.md's "既知の制限": manual D-column cost,
automatic category/pricing, manual E/F/G columns.

