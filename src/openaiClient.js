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
  if (!hasUsableDimensions(productInfo && productInfo.scraped)) {
    sanitized.productDetails = removeLabeledBlock(sanitized.productDetails, 'サイズ');
  }
  sanitized.productDetails = removeEmptyHeadings(sanitized.productDetails);
  return sanitized;
}

function removeUnavailableText(value) {
  return String(value)
    .split('\n')
    .filter((line) => !/記載なし|不明/.test(line))
    .join('\n')
    .trim();
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
    if (skipping && /^[^：\n]+：\s*$/.test(line.trim())) {
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
      return Boolean(next && !/^[^：\n]+：\s*$/.test(next.trim()));
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
