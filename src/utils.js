const fs = require('fs/promises');
const path = require('path');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function sanitizeFilePart(value) {
  return String(value || 'unknown')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'unknown';
}

function columnToLetter(columnNumber) {
  let value = columnNumber;
  let letter = '';
  while (value > 0) {
    const mod = (value - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    value = Math.floor((value - mod) / 26);
  }
  return letter;
}

function toRelativePath(filePath, rootDir) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

module.exports = {
  ensureDir,
  sanitizeFilePart,
  columnToLetter,
  toRelativePath,
  uniq
};
