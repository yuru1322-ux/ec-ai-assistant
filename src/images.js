const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const { ensureDir, sanitizeFilePart, toRelativePath } = require('./utils');
const { getImageMetadata } = require('./imageMetadata');

async function downloadImages(page, imageUrls, brand, productName, rowNumber) {
  const result = await downloadImagesWithReport(page, imageUrls, brand, productName, rowNumber);
  return result.saved.map((image) => image.path);
}

async function downloadImagesWithReport(page, imageUrls, brand, productName, rowNumber) {
  await ensureDir(config.imagesDir);
  const outputDir = getProductImageDir(rowNumber);
  await ensureDir(outputDir);
  await clearGeneratedImages(outputDir);
  console.log(`画像保存フォルダ: ${toRelativePath(outputDir, config.rootDir)}`);

  const saved = [];
  const duplicates = [];
  const lowResolution = [];
  const warnings = [];
  const seenKeys = new Map();
  const seenHashes = new Map();

  for (const item of imageUrls) {
    const image = typeof item === 'string' ? { url: item } : item;
    const imageUrl = image.url;
    const canonicalKey = image.canonicalKey || normalizeImageUrl(imageUrl);

    if (seenKeys.has(canonicalKey)) {
      duplicates.push({
        url: imageUrl,
        reason: 'same canonical image URL',
        duplicateOf: seenKeys.get(canonicalKey)
      });
      continue;
    }

    try {
      const download = await fetchImageWithFallback(page, image);
      if (!download) continue;

      let { response, buffer, finalUrl, usedFallback } = download;
      let metadata = getImageMetadata(buffer, response.headers()['content-type'] || '');
      if ((!metadata.width || !metadata.height) && !usedFallback && image.sourceUrl && image.sourceUrl !== imageUrl) {
        const fallback = await fetchImage(page, image.sourceUrl);
        if (fallback) {
          response = fallback.response;
          buffer = fallback.buffer;
          finalUrl = image.sourceUrl;
          usedFallback = true;
          metadata = getImageMetadata(buffer, response.headers()['content-type'] || '');
        }
      }
      if (!metadata.width || !metadata.height) continue;

      const excludeBelowWidth = image.excludeBelowWidth || 0;

      if (metadata.width && excludeBelowWidth && metadata.width < excludeBelowWidth) {
        lowResolution.push({
          url: finalUrl,
          sourceUrl: image.sourceUrl || imageUrl,
          width: metadata.width,
          height: metadata.height,
          minWidth: excludeBelowWidth
        });
        continue;
      }

      if (metadata.width && image.warningWidth && metadata.width < image.warningWidth) {
        warnings.push(`画像が${image.warningWidth}px未満です: ${metadata.width}x${metadata.height} ${finalUrl}`);
      }

      if (seenHashes.has(metadata.hash)) {
        duplicates.push({
          url: finalUrl,
          sourceUrl: image.sourceUrl || imageUrl,
          reason: 'same downloaded image hash',
          duplicateOf: seenHashes.get(metadata.hash)
        });
        continue;
      }

      const fileIndex = saved.length + 1;
      const role = fileIndex === 1 ? 'main' : 'sub';
      const filePath = path.join(outputDir, `${String(fileIndex).padStart(2, '0')}_${role}${metadata.extension}`);
      await fs.writeFile(filePath, buffer);

      const relativePath = toRelativePath(filePath, config.rootDir);
      seenKeys.set(canonicalKey, imageUrl);
      seenHashes.set(metadata.hash, finalUrl);
      saved.push({
        path: relativePath,
        url: finalUrl,
        sourceUrl: image.sourceUrl || imageUrl,
        requestedUrl: imageUrl,
        usedFallback,
        width: metadata.width,
        height: metadata.height,
        bytes: metadata.bytes,
        hash: metadata.hash,
        order: fileIndex
      });
    } catch (_) {
      // Individual image failures should not stop the whole product.
    }
  }

  if (saved.length === 0) {
    warnings.push('取得画像が0枚です。');
  } else if (saved[0].width && saved[0].width < 1200) {
    warnings.push(`メイン画像が低解像度です: ${saved[0].width}x${saved[0].height}`);
  }

  return {
    folderPath: toRelativePath(outputDir, config.rootDir),
    saved,
    duplicates,
    lowResolution,
    warnings
  };
}

function getProductImageDir(rowNumber) {
  const folderName = rowNumber ? sanitizeFilePart(rowNumber) : 'unknown';
  return path.join(config.imagesDir, folderName);
}

async function clearGeneratedImages(outputDir) {
  const entries = await fs.readdir(outputDir, { withFileTypes: true }).catch(() => []);
  const generatedImagePattern = /^(?:01_main|\d+_sub)\.[^.]+$/;

  await Promise.all(entries
    .filter((entry) => entry.isFile() && generatedImagePattern.test(entry.name))
    .map((entry) => fs.unlink(path.join(outputDir, entry.name))));
}

async function fetchImageWithFallback(page, image) {
  const requestedUrl = image.url;
  const sourceUrl = image.sourceUrl || requestedUrl;
  const initial = await fetchImage(page, requestedUrl);
  if (!initial) {
    if (sourceUrl !== requestedUrl) {
      const fallback = await fetchImage(page, sourceUrl);
      return fallback && { ...fallback, finalUrl: sourceUrl, usedFallback: true };
    }
    return null;
  }

  return {
    ...initial,
    finalUrl: requestedUrl,
    usedFallback: false
  };
}

async function fetchImage(page, imageUrl) {
  const response = await page.request.get(imageUrl, { timeout: config.browser.timeoutMs });
  if (!response.ok()) return null;
  return {
    response,
    buffer: await response.body()
  };
}

function normalizeImageUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    parsed.search = '';
    return parsed.href;
  } catch (_) {
    return imageUrl.split('?')[0];
  }
}

module.exports = { downloadImages, downloadImagesWithReport };
