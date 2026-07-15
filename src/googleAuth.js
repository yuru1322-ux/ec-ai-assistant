const fs = require('fs');
const http = require('http');
const { google } = require('googleapis');
const config = require('./config');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function main() {
  if (!fs.existsSync(config.google.oauthClientPath)) {
    throw new Error(`OAuthクライアントJSONが見つかりません: ${config.google.oauthClientPath}`);
  }

  const credentials = JSON.parse(fs.readFileSync(config.google.oauthClientPath, 'utf8'));
  const clientConfig = credentials.installed || credentials.web;
  if (!clientConfig) {
    throw new Error('OAuthクライアントJSONの形式が不正です。');
  }

  const auth = new google.auth.OAuth2(
    clientConfig.client_id,
    clientConfig.client_secret,
    (clientConfig.redirect_uris || ['http://localhost'])[0]
  );

  const codePromise = waitForCode();
  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });

  console.log('\n以下のURLをブラウザで開き、Googleアカウントで許可してください:\n');
  console.log(authUrl);
  console.log('');

  const code = await codePromise;
  const { tokens } = await auth.getToken(code);
  fs.writeFileSync(config.google.oauthTokenPath, JSON.stringify(tokens, null, 2), 'utf8');
  console.log(`Google OAuthトークンを保存しました: ${config.google.oauthTokenPath}`);
}

function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1:53682');
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.end('Google authorization failed. You can close this tab.');
          server.close();
          reject(new Error(error));
          return;
        }

        if (!code) {
          res.end('Authorization code was not found. You can close this tab.');
          return;
        }

        res.end('Google authorization completed. You can close this tab and return to Codex.');
        server.close();
        resolve(code);
      } catch (error) {
        server.close();
        reject(error);
      }
    });

    server.listen(53682, '127.0.0.1', () => {});
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
