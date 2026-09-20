const fs = require('fs/promises');
const OpenAI = require('openai');
const config = require('./config');

async function generateBuymaContent(productInfo) {
  if (!config.openai.apiKey) {
    throw new Error('OPENAI_API_KEYが設定されていません。');
  }

  const prompt = await fs.readFile(config.promptPath, 'utf8');
  const client = new OpenAI({ apiKey: config.openai.apiKey });

  const response = await client.responses.create({
    model: config.openai.model,
    input: [
      {
        role: 'system',
        content: prompt
      },
      {
        role: 'user',
        content: JSON.stringify(productInfo, null, 2)
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'buyma_product_content',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            titleCandidates: {
              type: 'array',
              minItems: 5,
              maxItems: 5,
              items: { type: 'string' }
            },
            description: { type: 'string' },
            productDetails: { type: 'string' }
          },
          required: ['title', 'titleCandidates', 'description', 'productDetails']
        },
        strict: true
      }
    }
  });

  const outputText = response.output_text;
  if (!outputText) {
    throw new Error('OpenAIから有効な出力を取得できませんでした。');
  }

  return sanitizeGeneratedContent(JSON.parse(outputText), productInfo);
}

function sanitizeGeneratedContent(generated, productInfo) {
  const sanitized = {
    title: generated.title || '',
    titleCandidates: Array.isArray(generated.titleCandidates) ? generated.titleCandidates : [],
    description: removeUnavailableText(generated.description || ''),
    productDetails: removeUnavailableText(generated.productDetails || '')
  };
  const scraped = (productInfo && productInfo.scraped) || {};
  if (!hasUsableDimensions(scraped)) {
    sanitized.productDetails = removeLabeledBlock(sanitized.productDetails, 'サイズ');
  }
  // カラー comes only from scraped.color (prompt section 7); a color the model
  // derived from the name/description is dropped.
  if (!String(scraped.color || '').trim()) {
    sanitized.productDetails = removeHeadingBlock(sanitized.productDetails, 'カラー');
  }
  sanitized.productDetails = applySalesSizes(sanitized.productDetails, scraped);
  sanitized.productDetails = removeEmptyHeadings(sanitized.productDetails);
  return sanitized;
}

// Sales sizes are a mechanical copy of scraped.sizes, so the line is built
// here instead of trusting the model to keep it: any model-written
// `販売サイズ：` block is replaced by the exact value (or dropped), and the
// line is inserted in its required slot (after 仕様・特徴, before モデル/カラー/…).
// Only when there are no concrete measurements; `サイズ：` (actual measurements)
// and `販売サイズ：` are never output together.
function normalizeSalesSizes(sizes) {
  const list = Array.isArray(sizes) ? sizes : [];
  return Array.from(new Set(list
    .map((size) => String(size === undefined || size === null ? '' : size).trim())
    .filter((size) => size && !/^(?:記載なし|不明|なし)$/.test(size))));
}

function applySalesSizes(productDetails, scraped) {
  const withoutModelBlock = removeHeadingBlock(productDetails, '販売サイズ');
  if (hasUsableDimensions(scraped)) return withoutModelBlock;
  const sizes = normalizeSalesSizes(scraped.sizes);
  if (sizes.length === 0) return withoutModelBlock;

  const salesSizeLine = `販売サイズ：${sizes.join('、')}`;
  const lines = withoutModelBlock.split('\n');
  const insertAt = lines.findIndex((line) => HEADINGS_AFTER_SALES_SIZES_PATTERN.test(line.trim()));
  if (insertAt === -1) lines.push(salesSizeLine);
  else lines.splice(insertAt, 0, salesSizeLine);
  return lines.join('\n');
}

// Removes a `label：` block whether its value is inline (`カラー：黒`) or on the
// following lines, up to the next heading.
function removeHeadingBlock(text, label) {
  const startPattern = new RegExp(`^${label}：`);
  const output = [];
  let skipping = false;
  for (const line of String(text || '').split('\n')) {
    if (startPattern.test(line.trim())) {
      skipping = true;
      continue;
    }
    if (skipping && isProductDetailHeading(line)) skipping = false;
    if (!skipping) output.push(line);
  }
  return output.join('\n').trim();
}

function removeUnavailableText(value) {
  return String(value)
    .split('\n')
    .filter((line) => !/記載なし|不明/.test(line))
    // A bare placeholder such as `なし` under a heading (e.g. `カラー：` / `なし`) is
    // the same "unavailable" signal; dropping it lets removeEmptyHeadings()
    // remove the now-empty heading.
    .filter((line) => !/^(?:なし|該当なし|情報なし|未記載|N\/A)$/i.test(line.trim()))
    .join('\n')
    .trim();
}

// productDetails headings (prompts/buyma-generation.md, section 7). A block
// removal must stop at any of these, including ones that carry their value on
// the same line (`カラー：ブラック`); otherwise it swallows every later heading
// that is not written alone on its own line.
// `裏地：` is deliberately absent: it is also a sub-label inside `素材：`
// (`表地：…` / `裏地：…`), so treating it as a heading would cut that block.
const PRODUCT_DETAIL_HEADINGS = [
  '素材', '仕様・特徴', 'サイズ', '販売サイズ', 'モデル', 'カラー', '商品コード',
  '開閉方法', '金具', '装飾', 'ポケット', '製造国', '重量', 'ケア'
];
const PRODUCT_DETAIL_HEADING_PATTERN = new RegExp(`^(?:${PRODUCT_DETAIL_HEADINGS.join('|')})：`);
// Headings that come after `販売サイズ：` in the required order.
const HEADINGS_AFTER_SALES_SIZES_PATTERN = /^(?:モデル|カラー|商品コード|開閉方法|金具|装飾|ポケット|製造国|重量|ケア)：/;

function isProductDetailHeading(line) {
  const trimmed = String(line || '').trim();
  return /^[^：\n]+：\s*$/.test(trimmed) || PRODUCT_DETAIL_HEADING_PATTERN.test(trimmed);
}

function removeLabeledBlock(text, label) {
  const lines = String(text || '').split('\n');
  const output = [];
  let skipping = false;
  for (const line of lines) {
    if (new RegExp(`^${label}：\\s*$`).test(line.trim())) {
      skipping = true;
      continue;
    }
    if (skipping && isProductDetailHeading(line)) {
      skipping = false;
    }
    if (!skipping) output.push(line);
  }
  return output.join('\n').trim();
}

function removeEmptyHeadings(text) {
  const lines = String(text || '').split('\n');
  return lines
    .filter((line, index) => {
      if (!/^[^：\n]+：\s*$/.test(line.trim())) return true;
      const next = lines.slice(index + 1).find((candidate) => candidate.trim());
      return Boolean(next && !isProductDetailHeading(next));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasUsableDimensions(scraped = {}) {
  const dimensions = String(scraped.dimensions || '').trim();
  if (!dimensions) return false;
  const category = String(scraped.category || '').toLowerCase();
  if (/^size\s+[a-z0-9]+$/i.test(dimensions) && /clothing|apparel|coats|jackets|dress|shirt|trouser|skirt/.test(category)) {
    return false;
  }
  return /\b(height|width|depth|length|drop|diameter|cm|mm|inch|inches)\b/i.test(dimensions);
}

module.exports = { generateBuymaContent };
