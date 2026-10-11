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
- MONCLER: GBP 0 fixed — confirmed by the client (non-UK rows: see "Non-UK Purchase / Shipping" below)
- LAB STORE WORLD: GBP 10 fixed — domains `labstorelondon.com` and `labstoreworld.com`
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

### Non-UK Purchase / Shipping (Flat GBP 50)

Client-confirmed (2026-10-11): every row that is **not** bought and shipped in
the UK — Italy, France or Germany — is priced, whatever the shop, with:

- shop shipping (J) = GBP 0 (the shop's `SHOP_SHIPPING_RULES` entry is not used)
- international shipping (K) = `NON_UK_INTERNATIONAL_SHIPPING_GBP` (GBP 50),
  instead of the `INTERNATIONAL_SHIPPING_GBP` category/price-bucket table
- the country's packaging fee (see "Packaging Fee" below)

A row is non-UK only from the C-column note — there is no per-shop country
setting (client decision, 2026-10-11: every shop, including Il Duomo, is decided
by column C). The note (`nonUkCountriesFromNote()`) must name `イタリア`,
`フランス` or `ドイツ` next to a purchase/shipping word (`買付`, `買い付け`,
`仕入`, `発送`), in either order, with at most 8 characters between them and no
separator or bracket (`、。,，()（）「」`, newline) in between.

```text
non-UK: フランス買付 / イタリアから発送 / 買い付け国はドイツ / フランスのサイトで買付
UK:     買い付け国はイギリス、発送国もイギリス / イギリス買付（フランス製） / フランス / ドイツ製
```

A bare country name is not enough (client decision: country + purchase/shipping
word). Detection is note-text-only: URL locale (`.fr`, `/fr/`) and a EUR D-column
manual cost were used for France in the past and produced false positives.

Because shop shipping is 0 for these rows, an unregistered shop
(`要確認：ショップ送料未登録`) or a manual-entry shop in `SPECIAL_SHOPS`
(`要確認：ショップ送料を手入力してください`) does not block them; only an invalid
A-column URL does. A failed category resolution does not block them either
(category is not needed for shipping; column I is left blank).

This replaces the earlier Moncler-only rule (`moncler.com`/brand Moncler + a
`フランス` + purchase-word note = GBP 50). A Moncler row bought and shipped in the
UK still uses the normal category table (e.g. アパレル: 25 up to GBP 250, 28 up
to 599, 40 from 600).

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
check duty by hand. **Collard Manson and LAB STORE WORLD are exempt**
(`LEATHER_SHOES_DUTY_CHECK_EXEMPT_SHOPS` in `src/pricing.js`): client-confirmed
that no duty markup is needed, so their leather shoes/boots are priced like any
other product. The exemption only skips the stop; it does not set a duty rate
(`customsDutyJpy` stays 0). It is per shop, not per row (LAB STORE WORLD covers
both `labstoreworld.com` and `labstorelondon.com`); every other shop keeps the
check.

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

### Apparel keywords

`shorts` (plural only, so `short strap` / `short sleeve` do not match) is an
apparel keyword. A product whose site category is `Jogger Shorts` used to fall
through to the description text and be classified `バッグ・靴` because of
`pocket bags`, giving the wrong international shipping.

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
- `packagingFeeJpy` is the per-country packaging fee described below. It is folded directly
  into `totalCostJpy` — there is no separate sheet column for it, and J
  (`原価＋ショップ配送料（GBP）`) and K (`国際送料（GBP）`) are unaffected. It only shows
  up indirectly through a higher L (`出品価格`) for the same M (`利益率`) target.

### Packaging Fee

Client-confirmed: a flat packaging fee (`PACKAGING_FEE_JPY`) is added to
`totalCostJpy`, by purchase/shipping country:

```text
イギリス  JPY 2000   (since 2026-09-06)
フランス  JPY 2000   (2026-10-11)
ドイツ    JPY 3000   (2026-10-11)
イタリア  JPY 4000   (2026-10-11)
```

The country comes from `resolvePurchaseCountry(note)` in `src/pricing.js`: the
country found by the non-UK C-column check (see "Non-UK Purchase / Shipping"
above — country next to `買付`/`買い付け`/`仕入`/`発送`), otherwise イギリス.

If the note names two different non-UK countries (e.g. `フランス買付、イタリア発送`)
the row stops with `要確認：C列に買付・発送国が複数あります` rather than picking one.

Until 2026-10-11 non-UK rows (and any note containing a bare `フランス`) had no
packaging fee; that exemption is gone. A bare `フランス` note without a
purchase/shipping word is a UK row (JPY 2000, UK shipping tables).

Do not change the amounts or the note-matching pattern without an explicit
client instruction.

## Listing Price

BUYMA fees are `BUYMA_FEE_RATE` (from the 設定 tab) **plus** a flat per-item fee
by listing price band (`BUYMA_FIXED_FEE_JPY` in `src/pricing.js`,
client-confirmed 2026-10-11):

```text
listing price  ~ 9,999       JPY 55
10,000 ~ 19,999              JPY 110
20,000 ~ 99,999              JPY 165
100,000 ~                    JPY 220
```

Minimum listing price, for the band's fixed fee:

```text
minimumListingPrice = (totalCostJpy + buymaFixedFeeJpy) / (1 - BUYMA_FEE_RATE - brandMarginRate)
```

Because the fixed fee depends on the listing price itself,
`resolveListingPrice()` starts with the lowest band's fee and, if the rounded
price falls in a band with a higher fee, recalculates with that fee until the
band is stable.

Rounding:

- below JPY 100,000: round up to nearest JPY 100
- JPY 100,000 or more: round up to nearest JPY 1,000

Profit:

```text
buymaFeeJpy = listingPriceJpy * BUYMA_FEE_RATE + buymaFixedFeeJpy(listingPriceJpy)
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

