# BUYMA Generation Spec

The active prompt is:

```text
prompts/buyma-generation.md
```

`src/openaiClient.js` sends this prompt as the system message and product data JSON as the user message to the OpenAI Responses API.

## Output JSON

OpenAI must return JSON only, with exactly four keys:

```json
{
  "title": "",
  "titleCandidates": [],
  "description": "",
  "productDetails": ""
}
```

Schema rules:

- `title`: string
- `titleCandidates`: exactly 5 strings
- `description`: string
- `productDetails`: string
- `imagePrompt` is not used

## Input Data

Typical fields:

- `sourceUrl`
- `sheetBrand`
- `scraped.name`
- `scraped.brand`
- `scraped.price`
- `scraped.currency`
- `scraped.description`
- `scraped.features`
- `scraped.composition`
- `scraped.material`
- `scraped.dimensions`
- `scraped.sizes`
- `scraped.color`
- `scraped.productCode`
- `scraped.sku`
- `scraped.mpn`
- `scraped.category`
- optional structured fields such as fastening, decoration, pockets, lining, modelInfo, careInstructions

Only explicit scraped official product data may be used. Missing fields must be omitted, not filled with guesses.

## Sheet Title Behavior

Current implementation in `src/index.js`:

- `generated.titleCandidates` are used first.
- Up to 5 unique candidates are joined with newlines.
- If candidates are unavailable, fallback is `generated.title` or scraped product name.
- The result is written to column E.

The original scraped product name remains in `scraped.name` internally.

## Title Rules

The prompt requires:

- exactly 5 title candidates
- each title starts with `【ブランド名】`
- weighted length within 60
- full-width character = 2
- half-width character = 1
- specific Japanese category name included
- natural Japanese
- no mechanical translation tone
- no unnatural keyword lists
- product name/category/motif prioritized over color
- color used only when there is not enough product name, shape, category, motif, material, or design information
- unsupported words such as 人気, 限定, 新作, 完売, 希少, 日本未入荷, セール, 入手困難 are forbidden unless explicitly in source data

The prompt has additional compact-title rules for long brand names, especially Vivienne Westwood.

## Product Comment Rules

The prompt requires `description` to be a BUYMA product comment:

- 5 to 7 non-empty lines
- one blank line after line 1
- one blank line before the final line
- each non-empty line within weighted length 50
- every non-empty line ends with `。`
- no emoji
- no `です` or `ます`
- natural elegant fashion-magazine tone
- no exaggeration
- no repeated content
- no unsupported usage scenes or coordination claims

The prompt prefers short, complete meaning units rather than splitting one long sentence.

## Product Details Rules

`productDetails` must start with:

```text
★製品詳細
```

Then only available headings are output in this order:

1. `素材：`
2. `仕様・特徴：`
3. `サイズ：` (actual measurements) or `販売サイズ：` (sales sizes) — never both
4. `モデル：`
5. `カラー：`
6. `商品コード：`
7. optional details

Empty headings are forbidden.

`素材：`

- uses `scraped.composition` first
- uses `scraped.material` only if composition is unavailable
- preserves composition ratios

`仕様・特徴：`

- uses `scraped.features` first
- one item per line
- no bullet symbols
- keeps official order as much as possible
- no invented features

`サイズ：`

- uses only explicit measurements in `scraped.dimensions`
- does not treat apparel selected size as actual measurements
- no guessed UK/JP conversion

`販売サイズ：`

- fallback in the same slot as `サイズ：`; used only when `scraped.dimensions` has no concrete measurements (empty, or only a selected size / model wearing size) and `scraped.sizes` has at least one usable size
- when `scraped.dimensions` has concrete measurements, only `サイズ：` is output (actual measurements win) and `販売サイズ：` is never output alongside it
- uses only `scraped.sizes`; `sizeVariants`, `availableSizes`, and `availability` are not used
- one line, labels joined with `、` (e.g. `販売サイズ：41、42、43、44`), kept exactly as in the source and in source order
- no added size system (EU/UK/US), unit, conversion, or stock information
- output only in `productDetails`, not in `description`
- `scraped.sizes` is currently provided by the Collard Manson scraper (see `docs/scraper-guide.md`); it comes from the A-column scrape only and is not overridden by N-column data

Optional labels are used only when corresponding source fields exist:

- `開閉方法：`
- `金具：`
- `装飾：`
- `ポケット：`
- `裏地：`
- `製造国：`
- `重量：`
- `ケア：`

Return notes are not included.

## Sanitizing

`src/openaiClient.js` sanitizes output:

- removes lines containing `記載なし` or `不明`
- removes `サイズ：` block when `scraped.dimensions` is not usable. The block ends at the next known heading (`素材：`, `仕様・特徴：`, `サイズ：`, `販売サイズ：`, `モデル：`, `カラー：`, `商品コード：`, and the optional-detail labels), including headings that carry their value on the same line such as `カラー：黒`. `裏地：` is deliberately not treated as a heading because it is also a sub-label inside `素材：`
- removes bare placeholder lines (`なし`, `該当なし`, `情報なし`, `未記載`, `N/A`) in addition to lines containing `記載なし` / `不明`
- removes `カラー：` when `scraped.color` is empty (the color comes only from `scraped.color`; a color the model derived from the name or description is dropped)
- builds `販売サイズ：` from `scraped.sizes` itself: any model-written `販売サイズ：` block is replaced by the exact one-line value (`、` joined, duplicates and empty/`記載なし` items removed) and placed in its slot, before `モデル：` / `カラー：` / `商品コード：` / the optional details. It is dropped when `scraped.dimensions` has concrete measurements or `scraped.sizes` is empty. This keeps the line present and correct even when the model omits or rewrites it
- removes empty headings, including a heading directly followed by another heading that has an inline value

This is a safety layer only. The prompt should still instruct the model to avoid unavailable fields.

