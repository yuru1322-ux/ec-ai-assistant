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
3. `サイズ：`
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
- removes `サイズ：` block when `scraped.dimensions` is not usable
- removes empty headings

This is a safety layer only. The prompt should still instruct the model to avoid unavailable fields.

