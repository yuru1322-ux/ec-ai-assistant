const path = require('path');
require('dotenv').config();

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

const rootDir = path.resolve(__dirname, '..');

module.exports = {
  rootDir,
  imagesDir: path.join(rootDir, 'images'),
  logsDir: path.join(rootDir, 'logs'),
  promptPath: path.join(rootDir, 'prompts', 'buyma-generation.md'),
  google: {
    sheetId: env('GOOGLE_SHEET_ID', '1q6DIJiJZ8iusEOiI7bJMW1MaQ83x-T_ntrTrsmPlRI4'),
    sheetName: env('GOOGLE_SHEET_NAME', 'シート1'),
    credentialsPath: path.resolve(rootDir, env('GOOGLE_APPLICATION_CREDENTIALS', './google-service-account.json')),
    oauthClientPath: path.resolve(rootDir, env('GOOGLE_OAUTH_CLIENT_SECRET', './google-oauth-client.json')),
    oauthTokenPath: path.resolve(rootDir, env('GOOGLE_OAUTH_TOKEN', './google-oauth-token.json')),
    startRow: Number(env('START_ROW', '2')),
    endRow: env('END_ROW') ? Number(env('END_ROW')) : null
  },
  openai: {
    apiKey: env('OPENAI_API_KEY'),
    model: env('OPENAI_MODEL', 'gpt-4.1-mini')
  },
  browser: {
    headless: env('HEADLESS', 'true').toLowerCase() !== 'false',
    timeoutMs: Number(env('REQUEST_TIMEOUT_MS', '30000'))
  }
};
