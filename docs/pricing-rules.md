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

All registered brands use a 20% margin zone (raised from the former 18% zone and most of the former 15% zone), except the 15% Zone brands below:

- BOTTEGA VENETA
- MAX MARA
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
- MONCLER
- ALAIA
- VIVIENNE WESTWOOD
- SELF-PORTRAIT
- SELF PORTRAIT
- HOBBS LONDON
- GUCCI
- SISTER JANE

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
- MINOX BOUTIQUE: GBP 0 fixed — **provisional value**. Free delivery over GBP 300 is confirmed from the site's own banner; the below-threshold fee is not yet confirmed

Do not add or change shipping rules without user instruction.

### Provisional Shipping Warning

`PROVISIONAL_SHIPPING_SHOPS` in `src/pricing.js` lists shops whose shipping rule is a
placeholder rather than a confirmed value (currently `MINOX BOUTIQUE` only — `MONCLER`
was removed once the client confirmed its shipping terms). When the resolved shop is
in this set, `calculatePricing()` adds a non-blocking warning:

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
MONCLER: GBP 50 fixed (client-confirmed, applies to all French-sourced Moncler
orders regardless of category or cost)
```

For these shops, a failed category resolution (`要確認：カテゴリー判定`) does **not**
block price calculation — it is dropped instead of added to the blocking warnings.
This exists because Moncler's official site (`moncler.com`) is in French
(`doudoune`, `manteaux`, etc.), which `CATEGORY_PATTERNS` does not recognize, and
category is not needed to determine shipping for these shops anyway. Column I
(category) is populated only when resolution succeeds and is left blank otherwise;
this does not affect J/K/L/M, which calculate identically either way.

#### France Detection Beyond moncler.com

The GBP 50 flat rate above is triggered by `shopResult.shopName === 'MONCLER'`,
which only happens when A-column resolves to `moncler.com` directly. It is also
triggered — independent of resolved shop — whenever **both** of these hold:

- brand (B column, normalized) is `MONCLER`, and
- either:
  - `isFranceSourcedUrl(sourceUrl)` is true: the A-column URL's hostname ends in
    `.fr`, or its first path segment is `fr` or `fr-fr` (matches
    `moncler.com/fr-fr/...`-style locale prefixes on any retailer's URL), or
  - `manualCostCurrency === 'EUR'`: the A-column page could not be scraped for a
    price at all, and the client's D-column manual cost entry was parsed as EUR
    (see `determineCost()` in `src/index.js` — this is the same signal behind
    the `要確認：原価はD列の手入力値（EUR→GBP換算）を使用しました` note).

This covers Moncler product rows sourced through a third-party retailer (e.g.
mytheresa.com) whose own moncler.com listing could not be scraped (bot-blocked,
soft-blocked, etc.): if the client enters a EUR cost manually because the only
price they have is in EUR, that is treated as a France-sourced signal for
Moncler and the flat GBP 50 rate applies automatically instead of falling back
to the category/price-bucket table. A manually-entered **GBP** cost does not
trigger this path — only EUR does. This is scoped to brand=Moncler specifically
(a client-confirmed rule for this brand); it is not a general "any French URL
gets GBP 50" rule for other brands.

`internationalShippingGbp` resolves to `FLAT_INTERNATIONAL_SHIPPING_GBP.get(shopResult.shopName)`
when available, falling back to `FLAT_INTERNATIONAL_SHIPPING_GBP.get('MONCLER')`
when the flat rate was triggered via the brand+France path on a non-MONCLER shop
(e.g. `MYTHERESA`).

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

Category logs are printed:

```text
カテゴリ判定: category=... source=... matched=...
```

## Current Total Cost Formula

Current implemented formula:

```text
costWithShopShippingGbp = productCostGbp + shopShippingGbp
totalCostJpy = ceil((costWithShopShippingGbp + internationalShippingGbp) * GBP_JPY_RATE)
```

Important:

- Do not use the older formula that added customs duty or consumption tax to total cost.
- `customsDutyJpy` and `consumptionTaxJpy` are currently returned as 0.

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
- 15% zone (JADED LONDON, ELIZABETH SCARLETT): warning if over 17%

Warning:

```text
要確認：利益率がブランド別目安上限を超えています
```

