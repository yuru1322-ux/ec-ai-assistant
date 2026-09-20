# Pricing Rules

This document summarizes `src/pricing.js` and `src/index.js` as the source of truth.

## Inputs

- Product URL from A column
- Brand name from B column
- Scraped product price and currency
- Scraped category/product data
- Settings from the `設定` sheet

## Currency Handling

In `src/index.js`, `getCostGbp()` converts scraped price into GBP cost.

GBP product:

```text
costGbp = scraped.price
```

EUR product:

```text
costGbp = scraped.price * settings.EUR_GBP_RATE
```

The result is rounded to 2 decimals.

Important:

- Only the EUR product price is converted.
- Shop shipping rules are already GBP values and must not be converted.
- Unknown currency stops pricing with `要確認：通貨判定失敗` or `要確認：通貨換算が必要（XXX→GBP）`.
- Missing or invalid `EUR_GBP_RATE` stops EUR pricing with `要確認：EUR/GBP為替レートを確認してください`.

## Per-Row Margin Override

`calculatePricing()` accepts an optional `marginRateOverride` (e.g. `0.2`) that
replaces the brand margin for that one calculation; values outside 0-1 are
ignored. It exists for a client instruction in the C-column note such as
`利益率20パーセントで計算してください`. **The note is not parsed automatically**
and `src/index.js` never passes the override: whether to honour a C-column
instruction is confirmed with the user each time, and the value is then passed
in explicitly (e.g. by a one-off script). Omitted, calculation is unchanged.
The brand-minimum check and the upper-limit warning use the overridden rate.

## C-Column Discount Instruction

If the C-column note (`備考欄`) tells the operator to apply a percentage
discount, e.g. `20%オフ適用して価格計算してください（＊セール品を除く）`, the
discount is applied to the cost **before** the pricing formulas run. The
formulas themselves are unchanged; `costGbp` simply becomes the discounted
value, and that same discounted value is what column D receives.

Implemented in `src/pricing.js` (`parseNoteDiscount()`, `applyNoteDiscount()`,
`describeNoteDiscountForManualCost()`) and called from `determineCost()` in
`src/index.js`.

```text
costGbp = round(scraped price in GBP * (1 - rate / 100), 2)
```

Rules:

- The note must say to **apply** it: `<n>%オフ適用` / `<n>%OFFを適用` / `<n>%引き適用`
  (full-width digits and `％` are accepted). A bare `20%オフ` mention without
  `適用` is not applied; the row gets
  `要確認：C列の割引指定を自動適用できませんでした。原価を確認してください`.
  A rate outside 0-100 is treated the same way.
- Applied only to the **scraped** cost. A D-column manual cost is used as
  typed, and the row gets `要確認：D列手入力の原価にはC列の割引指定を適用していません`.
- N-column prices are never used (unchanged), so they are never discounted either.
- If the note also says `セール品を除く` / `セール品は対象外`, sale items are
  skipped, decided by `scraped.onSale`:
  - `true`: not applied; status note `セール品のため20%オフは適用していません`
  - `false`: applied
  - not `true`/`false` (the shop's scraper cannot tell): not applied, status note
    `要確認：セール品か判定できないため20%オフを適用していません`. Not
    discounting is the safe side: an unneeded discount lowers the listing
    price and margin, a missing one only leaves the price higher.
  - Only the Collard Manson scraper sets `onSale` today (Shopify compare-at
    price or strike-through `.was_price` higher than the current price). Any
    other shop with such a note therefore gets the `要確認` line, not a discount.
- When applied, a status line is appended: `20%オフを適用（定価459→367.2 GBP）`.
- Rows whose note has no percentage discount are unaffected.
- The second sentence of the example note (`在庫のないサイズは在庫なしで登録してください`)
  is not processed by the pipeline: there is no sheet column for stock.

## Required Settings

`src/pricing.js` validates:

- `GBP_JPY_RATE`
- `BUYMA_FEE_RATE`
- `CONSUMPTION_TAX`

Invalid values produce:

- `エラー：GBP/JPY為替レートを確認してください`
- `エラー：BUYMA手数料率を確認してください`
- `エラー：消費税率を確認してください`

Current code validates `CONSUMPTION_TAX`, but does not add customs duty or consumption tax to total cost.

## Brand Minimum Margin

Default margin for unregistered brands:

```text
20%
```

Unregistered brands add:

```text
要確認：ブランド別利益率が未登録のため20％を適用しました
```

### 20% Zone

Confirmed via the 2026-09 profit margin rules document (「利益率設定ルール」):

- BOTTEGA VENETA
- RICK OWENS
- TOD’S
- TOD'S
- TODS
- HUGO BOSS
- THE NORTH FACE
- TED BAKER
- AMIRI
- TRUE RELIGION
- GHOSPELL
- PHASE EIGHT
- ALAIA
- VIVIENNE WESTWOOD
- SELF-PORTRAIT
- SELF PORTRAIT
- HOBBS LONDON

### 18% Zone

Added by the 2026-09 profit margin rules document. MAX MARA, GUCCI, SISTER JANE, and
MONCLER move here from the former 20% zone; HERNO, CANADA GOOSE, TATRAS, and MACKAGE
are new additions:

- HERNO
- MAX MARA
- CANADA GOOSE
- SISTER JANE
- GUCCI
- TATRAS
- MACKAGE
- MONCLER

### 15% Zone

These brands keep a required minimum margin of 15% (explicit exception):

- JADED LONDON
- ELIZABETH SCARLETT

## Brand Normalization

`normalizeBrandName()`:

- NFKC normalizes text
- removes `公式`
- normalizes apostrophes to `'`
- treats `&` as `AND`
- removes non-alphanumeric characters
- uppercases

Examples treated as equivalent:

- TOD’S / TOD'S / TODS
- SELF-PORTRAIT / SELF PORTRAIT

## Shop Resolution

`resolveShop()` parses the URL with `new URL()`, normalizes hostname, then checks `SHOP_DOMAINS`.

Hostname normalization:

- lowercase
- remove port
- remove leading `www.`, `m.`, or `mobile.`

Unknown shop:

```text
要確認：ショップ送料未登録
```

Invalid URL:

```text
要確認：商品URLを確認してください
```

Special shops not auto-calculated:

- HITCHHIKER
- HBX
- PRINTEMPS
- PARLOURX
- VALLGATAN12

They produce:

```text
要確認：ショップ送料を手入力してください
```

## Registered Shop Shipping

Shipping rules are in `SHOP_SHIPPING_RULES`.

Examples:

- HARVEY NICHOLS: free at GBP 300+, otherwise GBP 8
- ZALANDO: free at GBP 35+, otherwise GBP 4
- VIVIENNE WESTWOOD UK: free at GBP 300+, otherwise GBP 5
- SELF PORTRAIT: GBP 0 fixed
- SELFRIDGES: GBP 0 fixed, but Selfridges scraping is currently disabled by protection logic
- PHASE EIGHT: free at GBP 150+, otherwise GBP 4
- MONCLER: GBP 0 fixed — confirmed by the client (see "Flat International Shipping" below for its international-shipping treatment)
- MINOX BOUTIQUE: free at GBP 300+, otherwise GBP 8 — confirmed via the 2026-09 shop shipping list
- STUDIO: GBP 5 fixed — confirmed via the 2026-09 shop shipping list; no domain is registered in `SHOP_DOMAINS` yet, so URLs from this shop will not auto-resolve to it until a domain is confirmed and added

Do not add or change shipping rules without user instruction.

### Provisional Shipping Warning

`PROVISIONAL_SHIPPING_SHOPS` in `src/pricing.js` lists shops whose shipping rule is a
placeholder rather than a confirmed value. It is currently empty — `MONCLER` was
removed once the client confirmed its shipping terms, and `MINOX BOUTIQUE` was
removed once its confirmed rule arrived via the 2026-09 shop shipping list. When a
shop is added to this set, `calculatePricing()` adds a non-blocking warning:

```text
要確認：ショップ送料が暫定値（0）です
```

This does not stop price calculation. Once a shop's real shipping terms are known,
update its `SHOP_SHIPPING_RULES` entry and remove it from `PROVISIONAL_SHIPPING_SHOPS`
— the warning stops appearing automatically.

### Flat International Shipping

`FLAT_INTERNATIONAL_SHIPPING_GBP` in `src/pricing.js` lists shops whose international
shipping is a single confirmed GBP amount regardless of category or price bracket,
bypassing `INTERNATIONAL_SHIPPING_GBP` entirely:

```text
MONCLER: GBP 50 fixed (client-confirmed, applies ONLY to French-sourced Moncler
orders regardless of category or cost)
```

The flat rate is **not** triggered by the `moncler.com` URL. A Moncler row is
UK-sourced/UK-shipped by default and uses the normal category/price-bucket table
(e.g. アパレル: 25 up to GBP 250, 28 up to 599, 40 from 600); it gets the flat
GBP 50 only when the C-column note says France was the purchase route (see
"France Detection Beyond moncler.com"). Earlier code applied GBP 50 to every
`moncler.com` row; corrected on the client's instruction.

For these shops, a failed category resolution (`要確認：カテゴリー判定`) does **not**
block price calculation — it is dropped instead of added to the blocking warnings.
This exists because Moncler's official site (`moncler.com`) is in French
(`doudoune`, `manteaux`, etc.), which `CATEGORY_PATTERNS` does not recognize, and
category is not needed to determine shipping for these shops anyway. Column I
(category) is populated only when resolution succeeds and is left blank otherwise;
this does not affect J/K/L/M, which calculate identically either way.

#### France Detection Beyond moncler.com

The GBP 50 flat rate above is triggered only when **both** of these hold:

- the row is Moncler: brand (B column, normalized) is `MONCLER`, or the A-column
  resolves to the `MONCLER` shop (`moncler.com`), and
- `isFranceSourcedNote(note)` is true: the C-column note (passed to
  `calculatePricing()` as `note`) contains both `フランス` and a purchase-related
  keyword (`買付`, `買い付け`, or `仕入`) — i.e. an explicit client instruction
  that the item was bought via a French site.

This covers Moncler product rows sourced through a third-party retailer (e.g.
mytheresa.com) whose own moncler.com listing could not be scraped (bot-blocked,
soft-blocked, etc.): when the client's C-column note says so explicitly, the
flat GBP 50 rate applies instead of falling back to the category/price-bucket
table. This is scoped to brand=Moncler specifically (a client-confirmed rule
for this brand); it is not a general "any French purchase gets GBP 50" rule
for other brands.

Detection used to also trigger on the A-column URL's locale (hostname ending
`.fr`, or a `/fr/`-style first path segment) or on a EUR-denominated D-column
manual cost, without requiring a C-column note. Both produced false positives
(e.g. a `/fr/` URL segment picked for language reasons, unrelated to where the
item actually ships from) and were replaced with the note-only check above —
client confirmation, not a guess from the URL or currency.

When triggered, `internationalShippingGbp` is `FLAT_INTERNATIONAL_SHIPPING_GBP.get('MONCLER')`.
Because the flat rate no longer applies to every `moncler.com` row, a Moncler row
without the France note must resolve a category (column I, product name, etc.);
`要確認：カテゴリー判定` blocks it like any other shop.

## International Shipping

International shipping uses original GBP product cost, not cost plus shop shipping.

Categories:

- アクセサリー
- 革小物
- アパレル
- バッグ・靴
- 大型

Price buckets:

```text
cost <= 250
cost <= 599
cost >= 600
```

Rates:

```text
<=250:
アクセサリー 16
革小物 18
アパレル 25
バッグ・靴 30
大型 38

251-599:
アクセサリー 18
革小物 20
アパレル 28
バッグ・靴 35
大型 40

600+:
アクセサリー 25
革小物 28
アパレル 40
バッグ・靴 45
大型 50
```

Missing category:

```text
要確認：カテゴリー判定
```

Possible leather shoes:

```text
要確認：革靴の可能性があります。関税を手入力してください
```

This warning stops the calculation (`canCalculate: false`). The formulas contain
no duty term (`customsDutyJpy` is always 0), so it exists to make the operator
check duty by hand. **Collard Manson is exempt**
(`LEATHER_SHOES_DUTY_CHECK_EXEMPT_SHOPS` in `src/pricing.js`): client-confirmed
that no duty markup is needed, so its leather shoes/boots are priced like any
other product. The exemption is per shop, not per row; every other shop keeps
the check.

## Category Resolution

`resolveShippingCategory()` prioritizes:

1. explicit category/productData category/breadcrumb/categoryPath/product URL category
2. source URL
3. product name
4. description/features

Within explicit, URL, and support text, priority is:

```text
革小物
バッグ・靴
アパレル
アクセサリー
大型
```

For product name, priority is:

```text
革小物
アクセサリー
バッグ・靴
アパレル
大型
```

This keeps explicit accessory names such as necklace/ring/earrings correct while avoiding accidental matches in description text.

### URL collection segment (Collard Manson only)

For `collardmanson.co.uk`, the `/collections/{handle}/` part of the URL is
removed before URL keyword matching (`COLLECTION_SEGMENT_IGNORED_HOSTS` in
`src/pricing.js`). Its collections are brand groupings, e.g.
`/collections/rick-owens-jackets/` contains boots and jeans as well, so the word
`jackets` in it would otherwise classify any product opened from it as
`アパレル` whenever the page has no product type (observed on a pair of boots).
The product's own path (`/products/{handle}`) is still matched, then the
product name follows as usual. Other shops' URLs are unchanged.

Category logs are printed:

```text
カテゴリ判定: category=... source=... matched=...
```

## Current Total Cost Formula

Current implemented formula:

```text
costWithShopShippingGbp = productCostGbp + shopShippingGbp
totalCostJpy = ceil((costWithShopShippingGbp + internationalShippingGbp) * GBP_JPY_RATE) + packagingFeeJpy
```

Important:

- Do not use the older formula that added customs duty or consumption tax to total cost.
- `customsDutyJpy` and `consumptionTaxJpy` are currently returned as 0.
- `packagingFeeJpy` is the UK packaging fee described below. It is folded directly
  into `totalCostJpy` — there is no separate sheet column for it, and J
  (`原価＋ショップ配送料（GBP）`) and K (`国際送料（GBP）`) are unaffected. It only shows
  up indirectly through a higher L (`出品価格`) for the same M (`利益率`) target.

### UK Packaging Fee

Client-confirmed instruction (2026-09-06): every row is treated as UK-shipped by
default and gets a flat `UK_PACKAGING_FEE_JPY` (JPY 2000) added to
`totalCostJpy`, **unless** the C-column note (`備考欄`) indicates France
shipping.

France-shipping detection for this rule is `isFranceShippingNote(note)` in
`src/pricing.js`: a simple test for the substring `フランス` anywhere in the
C-column note, no other keyword required. This is intentionally
brand/shop-agnostic — it is unrelated to `isFranceSourcedNote()` (used only for
the Moncler flat GBP 50 international-shipping rate above), which requires
both `フランス` and a purchase-related keyword (`買付`/`買い付け`/`仕入`) and only
applies when brand is Moncler. A row can trigger one, both, or neither check
independently.

Do not change the JPY 2000 amount or the note-matching pattern without an
explicit client instruction.

## Listing Price

Minimum listing price:

```text
minimumListingPrice = totalCostJpy / (1 - BUYMA_FEE_RATE - brandMarginRate)
```

Rounding:

- below JPY 100,000: round up to nearest JPY 100
- JPY 100,000 or more: round up to nearest JPY 1,000

Profit:

```text
buymaFeeJpy = listingPriceJpy * BUYMA_FEE_RATE
profitJpy = listingPriceJpy - buymaFeeJpy - totalCostJpy
profitRate = profitJpy / listingPriceJpy
```

Profit rate is rounded to 3 decimals for sheet output.

## Profit Warnings

If profit rate is below the brand minimum:

```text
エラー：ブランド別最低利益率XX％を下回っています
```

Upper-limit guide:

- 20% zone: warning if over 22%
- 18% zone: warning if over 20%
- 15% zone (JADED LONDON, ELIZABETH SCARLETT): warning if over 17%

Warning:

```text
要確認：利益率がブランド別目安上限を超えています
```

