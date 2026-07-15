const fs = require('fs/promises');
const path = require('path');
const config = require('./config');
const { ensureDir, sanitizeFilePart, toRelativePath } = require('./utils');

async function downloadImages(page, imageUrls, brand, productName) {
  await ensureDir(config.imagesDir);
  const saved = [];
  const safeBrand = sanitizeFilePart(brand);
  const safeName = sanitizeFilePart(productName);

  for (const [index, imageUrl] of imageUrls.entries()) {
    try {
      const response = await page.request.get(imageUrl, { timeout: config.browser.timeoutMs });
      if (!response.ok()) continue;

      const filePath = path.join(config.imagesDir, `${safeBrand}_${safeName}_${index + 1}.jpg`);
      await fs.writeFile(filePath, await response.body());
      saved.push(toRelativePath(filePath, config.rootDir));
    } catch (_) {
      // Individual image failures should not stop the whole product.
    }
  }

  return saved;
}

module.exports = { downloadImages };
