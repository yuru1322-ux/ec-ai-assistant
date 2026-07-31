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
  status: 8
};

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
  const range = `${config.google.sheetName}!A${config.google.startRow}:H${endRow}`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range
  });

  return (response.data.values || [])
    .map((row, index) => ({
      rowNumber: config.google.startRow + index,
      url: row[0] || '',
      brand: row[1] || '',
      status: row[7] || ''
    }))
    .filter((product) => product.url && !product.status.startsWith('完了'));
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
      values: [[result.cost || '']]
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
  updateStatus,
  writeResult
};
