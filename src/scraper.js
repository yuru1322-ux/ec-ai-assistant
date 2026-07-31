const { chromium } = require('playwright');
const config = require('./config');
const { uniq } = require('./utils');
const { isVivienneWestwoodUrl, extractVivienneWestwoodImages } = require('./shops/vivienneWestwood');

async function scrapeProducts(products) {
  const browser = await chromium.launch({ headless: config.browser.headless });
  try {
    const results = [];
    for (const product of products) {
      const page = await browser.newPage();
      page.setDefaultTimeout(config.browser.timeoutMs);
      try {
        const scraped = await scrapeProductPage(page, product.url);
        results.push({ ...product, scraped });
      } finally {
        await page.close();
      }
    }
    return results;
  } finally {
    await browser.close();
  }
}

async function scrapeProductPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.browser.timeoutMs });
  await page.waitForLoadState('networkidle', { timeout: config.browser.timeoutMs }).catch(() => {});
  const shopImageSources = isVivienneWestwoodUrl(url)
    ? await extractVivienneWestwoodImages(page)
    : null;

  return page.evaluate(() => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const textBySelector = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const value = clean(element && element.textContent);
        if (value) return value;
      }
      return '';
    };
    const meta = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const value = clean(element && element.getAttribute('content'));
        if (value) return value;
      }
      return '';
    };
    const labeledText = (labels) => {
      const candidates = Array.from(document.querySelectorAll('dt, th, strong, b, span, div, p'));
      for (const label of labels) {
        const found = candidates.find((node) => clean(node.textContent).replace(/[:：]/g, '') === label);
        if (!found) continue;
        const next = found.nextElementSibling;
        const parentText = clean(found.parentElement && found.parentElement.textContent);
        if (next && clean(next.textContent)) return clean(next.textContent);
        if (parentText && parentText !== label) return clean(parentText.replace(found.textContent, ''));
      }
      return '';
    };

    const imageUrls = Array.from(document.images)
      .flatMap((img) => [
        img.currentSrc,
        img.src,
        img.getAttribute('data-src'),
        img.getAttribute('data-original'),
        img.getAttribute('data-zoom-image')
      ])
      .filter(Boolean)
      .map((src) => {
        try {
          return new URL(src, location.href).href;
        } catch (_) {
          return '';
        }
      })
      .filter((src) => /^https?:\/\//.test(src));

    const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((script) => {
        try {
          return JSON.parse(script.textContent);
        } catch (_) {
          return null;
        }
      })
      .flatMap((item) => Array.isArray(item) ? item : [item])
      .find((item) => item && (item['@type'] === 'Product' || (Array.isArray(item['@type']) && item['@type'].includes('Product')))) || {};

    const jsonBrand = typeof jsonLd.brand === 'string' ? jsonLd.brand : clean(jsonLd.brand && jsonLd.brand.name);
    const jsonImages = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image].filter(Boolean);

    return {
      name: clean(jsonLd.name) || textBySelector(['h1', '[class*="product"][class*="name"]', '[class*="item"][class*="name"]']) || meta(['meta[property="og:title"]', 'meta[name="twitter:title"]']),
      brand: jsonBrand || labeledText(['ブランド', 'Brand', 'brand']) || meta(['meta[property="product:brand"]']),
      description: clean(jsonLd.description) || meta(['meta[name="description"]', 'meta[property="og:description"]']) || textBySelector(['[class*="description"]', '[class*="detail"]']),
      color: labeledText(['カラー', '色', 'Color', 'color']),
      material: labeledText(['素材', 'Material', 'material']),
      category: labeledText(['カテゴリ', 'カテゴリー', 'Category', 'category']) || meta(['meta[property="product:category"]']),
      imageUrls: Array.from(new Set([...jsonImages, ...imageUrls]))
    };
  }).then((data) => {
    const imageUrls = shopImageSources
      ? shopImageSources.map((image) => image.url)
      : uniq(data.imageUrls);

    return {
      ...data,
      imageUrls,
      imageSources: shopImageSources || imageUrls.map((imageUrl) => ({ url: imageUrl }))
    };
  });
}

module.exports = {
  scrapeProducts,
  scrapeProductPage
};
