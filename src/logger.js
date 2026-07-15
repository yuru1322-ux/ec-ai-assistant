const fs = require('fs/promises');
const path = require('path');
const { logsDir } = require('./config');
const { ensureDir } = require('./utils');

async function writeErrorLog(rowNumber, url, error) {
  await ensureDir(logsDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(logsDir, `error-row-${rowNumber}-${timestamp}.log`);
  const body = [
    `time: ${new Date().toISOString()}`,
    `row: ${rowNumber}`,
    `url: ${url || ''}`,
    `message: ${error && error.message ? error.message : String(error)}`,
    '',
    error && error.stack ? error.stack : ''
  ].join('\n');
  await fs.writeFile(filePath, body, 'utf8');
  return filePath;
}

module.exports = { writeErrorLog };
