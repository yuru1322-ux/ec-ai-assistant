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
            productDetails: { type: 'string' },
            imagePrompt: { type: 'string' }
          },
          required: ['title', 'titleCandidates', 'description', 'productDetails', 'imagePrompt']
        },
        strict: true
      }
    }
  });

  const outputText = response.output_text;
  if (!outputText) {
    throw new Error('OpenAIから有効な出力を取得できませんでした。');
  }

  return JSON.parse(outputText);
}

module.exports = { generateBuymaContent };
