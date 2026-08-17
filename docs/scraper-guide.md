# Scraper Guide

`src/scraper.js` dispatches product URLs to shop-specific scrapers before falling back to generic extraction.

Dedicated shop scrapers must not be weakened into broad `document.images` extraction. For shops with dedicated image logic, failure should usually become `要確認：商品画像取得失敗` rather than collecting unrelated page images.

## Dispatcher Order

1. Zalando preflight and dedicated scraping
2. Selfridges protection stop
3. `page.goto()` for other shops
4. Phase Eight
5. Self-Portrait
6. Harvey Nichols
7. Vivienne Westwood or Hobbs London
8. Generic fallback for unsupported shops

## Generic Fallback

Generic fallback reads:

- JSON-LD Product
- `h1`
- meta/OG title and description
- generic labeled text for brand/color/material/category
- `document.images`

Do not rely on generic fallback for shops that have dedicated handlers.

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

