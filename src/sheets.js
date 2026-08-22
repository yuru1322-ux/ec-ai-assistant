const fs = require('fs');
const { google } = require('googleapis');
const config = require('./config');
const { columnToLetter } = require('./utils');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const OUTPUT_COLUMNS = {
  cost: 4,
  title: 5,
  description: 6,
  imageFileNames: 7,
  status: 8,
  category: 9,
  costWithShopShipping: 10,
  internationalShipping: 11,
  listingPrice: 12,
  profitRate: 13
};

function cellValue(value) {
  return value === undefined || value === null ? '' : value;
}

async function getSheetsClient() {
  let auth;

  if (fs.existsSync(config.google.credentialsPath)) {
    auth = new google.auth.GoogleAuth({
      keyFile: config.google.credentialsPath,
      scopes: SCOPES
    });
  } else {
    auth = getOAuthClient();
  }

  return google.sheets({ version: 'v4', auth });
}

function getOAuthClient() {
  if (!fs.existsSync(config.google.oauthClientPath)) {
    throw new Error(`Google OAuthクライアントJSONが見つかりません: ${config.google.oauthClientPath}`);
  }
  if (!fs.existsSync(config.google.oauthTokenPath)) {
    throw new Error(`Google OAuthトークンが見つかりません。先に npm run auth:google を実行してください: ${config.google.oauthTokenPath}`);
  }

  const credentials = JSON.parse(fs.readFileSync(config.google.oauthClientPath, 'utf8'));
  const clientConfig = credentials.installed || credentials.web;
  if (!clientConfig) {
    throw new Error('Google OAuthクライアントJSONの形式が不正です。');
  }

  const auth = new google.auth.OAuth2(
    clientConfig.client_id,
    clientConfig.client_secret,
    (clientConfig.redirect_uris || ['http://localhost'])[0]
  );
  auth.setCredentials(JSON.parse(fs.readFileSync(config.google.oauthTokenPath, 'utf8')));
  return auth;
}

async function readProducts(sheets) {
  const endRow = config.google.endRow || '';
  const range = `${config.google.sheetName}!A${config.google.startRow}:N${endRow}`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range
  });

  return (response.data.values || [])
    .map((row, index) => ({
      rowNumber: config.google.startRow + index,
      url: row[0] || '',
      brand: row[1] || '',
      note: row[2] || '',
      manualCost: row[3] || '',
      status: row[7] || '',
      infoSourceUrl: row[13] || ''
    }))
    .filter((product) => product.url && !product.status.startsWith('完了'));
}

async function readSettings(sheets) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range: '設定!A:B'
  });

  return (response.data.values || []).reduce((settings, row) => {
    const key = String(row[0] || '').trim();
    if (key === '設定名') return settings;
    if (!key) return settings;
    settings[key] = row[1] === undefined ? '' : row[1];
    return settings;
  }, {});
}

async function updateStatus(sheets, rowNumber, status) {
  const column = columnToLetter(OUTPUT_COLUMNS.status);
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.sheetId,
    range: `${config.google.sheetName}!${column}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[status]] }
  });
}

async function writeResult(sheets, rowNumber, result) {
  const updates = [
    {
      range: `${config.google.sheetName}!${columnToLetter(OUTPUT_COLUMNS.cost)}${rowNumber}`,
      values: [[cellValue(result.cost)]]
    },
    {
      range: `${config.google.sheetName}!${columnToLetter(OUTPUT_COLUMNS.title)}${rowNumber}`,
      values: [[result.title || '']]
    },
    {
      range: `${config.google.sheetName}!${columnToLetter(OUTPUT_COLUMNS.description)}${rowNumber}`,
      values: [[result.description || '']]
    },
    {
      range: `${config.google.sheetName}!${columnToLetter(OUTPUT_COLUMNS.imageFileNames)}${rowNumber}`,
      values: [[(result.imageFileNames || []).join('\n')]]
    },
    {
      range: `${config.google.sheetName}!${columnToLetter(OUTPUT_COLUMNS.status)}${rowNumber}`,
      values: [[result.status || '']]
    },
    {
      range: `${config.google.sheetName}!${columnToLetter(OUTPUT_COLUMNS.category)}${rowNumber}`,
      values: [[result.category || '']]
    },
    {
      range: `${config.google.sheetName}!${columnToLetter(OUTPUT_COLUMNS.costWithShopShipping)}${rowNumber}`,
      values: [[cellValue(result.costWithShopShipping)]]
    },
    {
      range: `${config.google.sheetName}!${columnToLetter(OUTPUT_COLUMNS.internationalShipping)}${rowNumber}`,
      values: [[cellValue(result.internationalShipping)]]
    },
    {
      range: `${config.google.sheetName}!${columnToLetter(OUTPUT_COLUMNS.listingPrice)}${rowNumber}`,
      values: [[cellValue(result.listingPrice)]]
    },
    {
      range: `${config.google.sheetName}!${columnToLetter(OUTPUT_COLUMNS.profitRate)}${rowNumber}`,
      values: [[cellValue(result.profitRate)]]
    }
  ];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.google.sheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: updates
    }
  });
}

module.exports = {
  getSheetsClient,
  readProducts,
  readSettings,
  updateStatus,
  writeResult
};
