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

// Shared by src/index.js's parseManualCost() (D-column manual cost input) and
// src/scraper.js's generic price extraction (JSON-LD/meta/DOM candidates).
// Resolves which of "."/"," is the decimal separator vs. thousands separator:
// - both present: whichever occurs last is the decimal separator
//   (handles "1,250.00" and "1.250,00" as 1250.00)
// - only one present, more than once: it's a thousands separator
//   ("1.250.000" -> 1250000)
// - only one present, exactly once: thousands separator when followed by
//   exactly 3 digits to the end ("1.250" -> 1250), otherwise decimal
//   ("1.25" -> 1.25, "1250,00" -> 1250.00)
function parseLocalizedNumber(text) {
  if (!text) return null;
  const hasDot = text.includes('.');
  const hasComma = text.includes(',');

  if (hasDot && hasComma) {
    const decimalChar = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
    const thousandsChar = decimalChar === ',' ? '.' : ',';
    const cleaned = text.split(thousandsChar).join('').replace(decimalChar, '.');
    return finiteOrNull(Number(cleaned));
  }

  if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const parts = text.split(sep);
    const lastPart = parts[parts.length - 1];
    const isThousandsSeparator = parts.length > 2 || lastPart.length === 3;
    const cleaned = isThousandsSeparator ? parts.join('') : text.replace(sep, '.');
    return finiteOrNull(Number(cleaned));
  }

  return finiteOrNull(Number(text));
}

function finiteOrNull(num) {
  return Number.isFinite(num) ? num : null;
}

module.exports = {
  ensureDir,
  sanitizeFilePart,
  columnToLetter,
  toRelativePath,
  uniq,
  parseLocalizedNumber
};
