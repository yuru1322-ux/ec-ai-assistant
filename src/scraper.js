const { chromium } = require('playwright');
const config = require('./config');
const { uniq } = require('./utils');
const {
  isVivienneWestwoodUrl,
  extractVivienneWestwoodImages,
  extractVivienneWestwoodProductDetails
} = require('./shops/vivienneWestwood');
const {
  isHobbsLondonUrl,
  extractHobbsLondonImages,
  extractHobbsLondonProductDetails
} = require('./shops/hobbsLondon');
const {
  isZalandoUrl,
  inspectZalandoPage,
  extractZalandoProductDetails,
  extractZalandoImages,
  ZALANDO_IMAGE_FAILURE_STATUS
} = require('./shops/zalando');
const {
  isHarveyNicholsUrl,
  extractHarveyNicholsImages,
  extractHarveyNicholsProductDetails,
  HARVEY_NICHOLS_IMAGE_FAILURE_STATUS
} = require('./shops/harveyNichols');
const {
  isSelfPortraitUrl,
  extractSelfPortraitImages,
  extractSelfPortraitProductDetails,
  extractSelfPortraitSizeGuide,
  SELF_PORTRAIT_IMAGE_FAILURE_STATUS
} = require('./shops/selfPortrait');
const {
  isPhaseEightUrl,
  extractPhaseEightImages,
  extractPhaseEightProductDetails,
  PHASE_EIGHT_IMAGE_FAILURE_STATUS
} = require('./shops/phaseEight');
const {
  isSelfridgesUrl,
  inspectSelfridgesPage
} = require('./shops/selfridges');
const {
  isTessabitUrl,
  extractTessabitImages
} = require('./shops/tessabit');
const {
  isFlannelsUrl,
  gotoFlannelsViaCurl,
  extractFlannelsProductDetails
} = require('./shops/flannels');

const GENERIC_ACCESS_FAILURE_STATUS = '要確認：A列の商品情報取得に失敗しました';
// Exact status codes treated as a block. 5xx is handled separately as a
// range by isGenericBlockedStatus() below, not listed here individually.
const GENERIC_BLOCKED_HTTP_STATUSES = new Set([403, 404]);

const GENERIC_IMAGE_EXCLUDE_KEYWORDS = [
  'logo', 'icon', 'sprite', 'banner', 'placeholder', 'cookie', 'consent',
  'onetrust', 'payment', 'badge', 'social', 'flag', 'avatar', 'spinner',
  'loader', 'newsletter', 'swatch'
];
const GENERIC_IMAGE_MIN_WIDTH = 400;
const GENERIC_IMAGE_MAX_COUNT = 15;
// Below this count, JSON-LD/og:image alone are not treated as a complete
// gallery and DOM collection still runs to fill in the rest.
const GENERIC_IMAGE_SUFFICIENT_COUNT = 3;

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
  const isZalando = isZalandoUrl(url);
  if (isZalando) {
    const zalandoState = await inspectZalandoPage(page, url, config.browser.timeoutMs);
    if (zalandoState.shouldStop) return zalandoState;
    const shopProductDetails = await extractZalandoProductDetails(page, url);
    const shopImageSources = await extractZalandoImages(page);
    if (shopProductDetails && shopProductDetails.extractionLog && shopProductDetails.extractionLog.color) {
      const colorLog = shopProductDetails.extractionLog.color;
      console.log(`Zalando色取得: ${colorLog.value || '未取得'} (${colorLog.source || '取得元なし'})`);
    }
    return {
      ...shopProductDetails,
      status: shopImageSources.length > 0 ? '' : ZALANDO_IMAGE_FAILURE_STATUS,
      imageUrls: shopImageSources.map((image) => image.url),
      imageSources: shopImageSources
    };
  } else if (isSelfridgesUrl(url)) {
    return inspectSelfridgesPage(page, url, config.browser.timeoutMs);
  } else {
    const accessState = await inspectGenericAccess(page, url, config.browser.timeoutMs);
    if (accessState.shouldStop) return accessState;
  }
  const isVivienne = isVivienneWestwoodUrl(url);
  const isHobbs = isHobbsLondonUrl(url);
  const isHarveyNichols = isHarveyNicholsUrl(url);
  const isSelfPortrait = isSelfPortraitUrl(url);
  const isPhaseEight = isPhaseEightUrl(url);
  if (isPhaseEight) {
    const shopProductDetails = await extractPhaseEightProductDetails(page, url);
    const shopImageSources = await extractPhaseEightImages(page);
    if (shopProductDetails && shopProductDetails.extractionLog && shopProductDetails.extractionLog.color) {
      const colorLog = shopProductDetails.extractionLog.color;
      console.log(`Phase Eight色取得: ${colorLog.value || '未取得'} (${colorLog.source || '取得元なし'})`);
    }
    return {
      ...shopProductDetails,
      status: shopImageSources.length > 0 ? '' : PHASE_EIGHT_IMAGE_FAILURE_STATUS,
      imageUrls: shopImageSources.map((image) => image.url),
      imageSources: shopImageSources
    };
  }
  if (isSelfPortrait) {
    const shopProductDetails = await extractSelfPortraitProductDetails(page, url);
    const sizeGuide = await extractSelfPortraitSizeGuide(page);
    const shopImageSources = await extractSelfPortraitImages(page);
    if (shopProductDetails && shopProductDetails.extractionLog && shopProductDetails.extractionLog.color) {
      const colorLog = shopProductDetails.extractionLog.color;
      console.log(`Self-Portrait色取得: ${colorLog.value || '未取得'} (${colorLog.source || '取得元なし'})`);
    }
    return {
      ...shopProductDetails,
      dimensions: sizeGuide.formatted || shopProductDetails.dimensions || '',
      garmentMeasurements: sizeGuide.rows || [],
      sizeGuide,
      sizeGuideScreenshotBase64: sizeGuide.screenshotBase64 || '',
      status: shopImageSources.length > 0 ? '' : SELF_PORTRAIT_IMAGE_FAILURE_STATUS,
      imageUrls: shopImageSources.map((image) => image.url),
      imageSources: shopImageSources
    };
  }
  if (isHarveyNichols) {
    const shopProductDetails = await extractHarveyNicholsProductDetails(page, url);
    const shopImageSources = await extractHarveyNicholsImages(page);
    if (shopProductDetails && shopProductDetails.extractionLog && shopProductDetails.extractionLog.color) {
      const colorLog = shopProductDetails.extractionLog.color;
      console.log(`Harvey Nichols色取得: ${colorLog.value || '未取得'} (${colorLog.source || '取得元なし'})`);
    }
    return {
      ...shopProductDetails,
      status: shopImageSources.length > 0 ? '' : HARVEY_NICHOLS_IMAGE_FAILURE_STATUS,
      imageUrls: shopImageSources.map((image) => image.url),
      imageSources: shopImageSources
    };
  }

  const shopImageSources = isVivienne
    ? await extractVivienneWestwoodImages(page)
    : isHobbs
      ? await extractHobbsLondonImages(page)
      : await extractGenericImages(page);
  const shopProductDetails = isVivienne
    ? await extractVivienneWestwoodProductDetails(page, url)
    : isHobbs
      ? await extractHobbsLondonProductDetails(page, url)
      : isFlannelsUrl(url)
        ? await extractFlannelsProductDetails(page)
        : null;
  if (shopProductDetails && shopProductDetails.extractionLog && shopProductDetails.extractionLog.color) {
    const colorLog = shopProductDetails.extractionLog.color;
    const shopName = isHobbs ? 'Hobbs London' : 'Vivienne Westwood';
    console.log(`${shopName}色取得: ${colorLog.value || '未取得'} (${colorLog.source || '取得元なし'})`);
  }

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

    return {
      name: clean(jsonLd.name) || textBySelector(['h1', '[class*="product"][class*="name"]', '[class*="item"][class*="name"]']) || meta(['meta[property="og:title"]', 'meta[name="twitter:title"]']),
      brand: jsonBrand || labeledText(['ブランド', 'Brand', 'brand']) || meta(['meta[property="product:brand"]']),
      description: clean(jsonLd.description) || meta(['meta[name="description"]', 'meta[property="og:description"]']) || textBySelector(['[class*="description"]', '[class*="detail"]']),
      color: labeledText(['カラー', '色', 'Color', 'color']),
      material: labeledText(['素材', 'Material', 'material']),
      category: labeledText(['カテゴリ', 'カテゴリー', 'Category', 'category']) || meta(['meta[property="product:category"]'])
    };
  }).then((data) => {
    const imageUrls = shopImageSources.map((image) => image.url);
    const mergedData = shopProductDetails
      ? mergeScrapedData(data, shopProductDetails)
      : data;

    return {
      ...mergedData,
      imageUrls,
      imageSources: shopImageSources
    };
  });
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function mergeScrapedData(genericData, shopData) {
  const merged = { ...genericData };
  for (const [key, value] of Object.entries(shopData)) {
    if (hasValue(value)) {
      merged[key] = value;
    } else if (!(key in merged)) {
      merged[key] = value;
    }
  }
  return merged;
}

function normalizeUrlForComparison(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const sortedParams = [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    const query = new URLSearchParams(sortedParams).toString();
    return `${parsed.origin}${parsed.pathname}${query ? `?${query}` : ''}`;
  } catch (_) {
    return String(rawUrl || '');
  }
}

async function scrapeImagesFromUrl(page, url) {
  try {
    if (isZalandoUrl(url)) {
      const zalandoState = await inspectZalandoPage(page, url, config.browser.timeoutMs);
      if (zalandoState.shouldStop) return [];
      return await extractZalandoImages(page);
    }
    if (isSelfridgesUrl(url)) {
      await inspectSelfridgesPage(page, url, config.browser.timeoutMs);
      return [];
    }

    if (normalizeUrlForComparison(page.url()) !== normalizeUrlForComparison(url)) {
      if (isFlannelsUrl(url)) {
        await gotoFlannelsViaCurl(page, url, config.browser.timeoutMs);
      } else {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.browser.timeoutMs });
        await page.waitForLoadState('networkidle', { timeout: config.browser.timeoutMs }).catch(() => {});
      }
    }

    if (isPhaseEightUrl(url)) return await extractPhaseEightImages(page);
    if (isSelfPortraitUrl(url)) return await extractSelfPortraitImages(page);
    if (isHarveyNicholsUrl(url)) return await extractHarveyNicholsImages(page);
    if (isVivienneWestwoodUrl(url)) return await extractVivienneWestwoodImages(page);
    if (isHobbsLondonUrl(url)) return await extractHobbsLondonImages(page);
    if (isTessabitUrl(url)) return await extractTessabitImages(page);

    return await extractGenericImages(page);
  } catch (_) {
    return [];
  }
}

async function inspectGenericAccess(page, url, timeoutMs) {
  let status;
  if (isFlannelsUrl(url)) {
    status = (await gotoFlannelsViaCurl(page, url, timeoutMs)).status;
  } else {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    status = response ? response.status() : 0;
  }
  if (isGenericBlockedStatus(status)) {
    return {
      shouldStop: true,
      status: GENERIC_ACCESS_FAILURE_STATUS,
      reason: `HTTP ${status}`
    };
  }
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
  return { shouldStop: false };
}

function isGenericBlockedStatus(status) {
  if (GENERIC_BLOCKED_HTTP_STATUSES.has(status)) return true;
  return status >= 500 && status < 600;
}

// Shared generic-fallback image extraction, used by both scrapeProductPage()
// (A-column) and scrapeImagesFromUrl() (N-column) for any shop without a
// dedicated scraper. Priority: JSON-LD Product.image, then og:image, then a
// filtered/capped scan of document.images. See docs/scraper-guide.md.
async function extractGenericImages(page) {
  const collected = await page.evaluate((keywords) => {
    const absoluteUrl = (value) => {
      if (!value) return '';
      try {
        return new URL(value, location.href).href;
      } catch (_) {
        return '';
      }
    };
    const isUsableUrl = (url) => {
      if (!url) return false;
      if (url.startsWith('data:')) return false;
      if (/\.svg(\?|#|$)/i.test(url)) return false;
      return /^https?:\/\//.test(url);
    };
    const isExcludedByKeyword = (url) => {
      const lower = url.toLowerCase();
      return keywords.some((keyword) => lower.includes(keyword));
    };
    const bestFromSrcset = (value) => {
      if (!value) return '';
      const candidates = value.split(',')
        .map((part) => {
          const trimmed = part.trim();
          const spaceIndex = trimmed.search(/\s/);
          const candidateUrl = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
          const descriptor = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim();
          const width = /w$/i.test(descriptor) ? Number(descriptor.replace(/w$/i, '')) : 0;
          const density = /x$/i.test(descriptor) ? Number(descriptor.replace(/x$/i, '')) : 0;
          return { candidateUrl, score: width || density };
        })
        .filter((candidate) => candidate.candidateUrl)
        .sort((a, b) => b.score - a.score);
      return candidates.length ? candidates[0].candidateUrl : '';
    };

    const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((script) => {
        try {
          return JSON.parse(script.textContent || '{}');
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .flatMap((item) => Array.isArray(item) ? item : (Array.isArray(item['@graph']) ? item['@graph'] : [item]))
      .find((item) => item && (item['@type'] === 'Product' || (Array.isArray(item['@type']) && item['@type'].includes('Product')))) || {};

    const jsonLdRaw = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
    const jsonLdImages = jsonLdRaw
      .map((entry) => {
        if (!entry) return '';
        if (typeof entry === 'string') return entry;
        if (typeof entry === 'object') return entry.url || entry['@id'] || '';
        return '';
      })
      .map(absoluteUrl)
      .filter(isUsableUrl);

    const ogImages = Array.from(document.querySelectorAll('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="og:image"]'))
      .map((metaEl) => absoluteUrl(metaEl.getAttribute('content')))
      .filter(isUsableUrl);

    const domImages = Array.from(document.images)
      .flatMap((img) => [
        bestFromSrcset(img.getAttribute('srcset')),
        bestFromSrcset(img.getAttribute('data-srcset')),
        img.currentSrc,
        img.getAttribute('src'),
        img.getAttribute('data-src'),
        img.getAttribute('data-original'),
        img.getAttribute('data-zoom-image')
      ])
      .filter(Boolean)
      .map(absoluteUrl)
      .filter(isUsableUrl)
      .filter((imageUrl) => !isExcludedByKeyword(imageUrl));

    return { jsonLdImages, ogImages, domImages };
  }, GENERIC_IMAGE_EXCLUDE_KEYWORDS);

  let priorityUrls = uniq(collected.jsonLdImages);
  if (priorityUrls.length < GENERIC_IMAGE_SUFFICIENT_COUNT) {
    priorityUrls = uniq([...priorityUrls, ...uniq(collected.ogImages)]);
  }

  let finalUrls = priorityUrls;
  if (priorityUrls.length < GENERIC_IMAGE_SUFFICIENT_COUNT) {
    let domUrls = uniq(collected.domImages);
    const identifierSourceUrl = collected.jsonLdImages[0] || collected.ogImages[0] || '';
    const productIdentifier = extractProductIdentifier(identifierSourceUrl);
    if (productIdentifier) {
      const matched = domUrls.filter((imageUrl) => imageUrl.includes(productIdentifier));
      if (matched.length > 0) {
        console.log(`汎用画像抽出: 商品コード絞り込み適用 identifier=${productIdentifier} (${domUrls.length}枚 -> ${matched.length}枚)`);
        domUrls = matched;
      } else {
        console.log(`汎用画像抽出: 商品コード抽出(identifier=${productIdentifier})に一致するDOM画像が0枚のため、既存フィルタにフォールバック`);
        domUrls = limitToMostFrequentHost(domUrls);
      }
    } else {
      domUrls = limitToMostFrequentHost(domUrls);
    }
    finalUrls = uniq([...priorityUrls, ...domUrls]);
  }

  if (finalUrls.length > GENERIC_IMAGE_MAX_COUNT) {
    console.log(`汎用画像抽出: ${page.url()} で検出${finalUrls.length}枚のうち上限${GENERIC_IMAGE_MAX_COUNT}枚に切り詰めました`);
  }

  return finalUrls.slice(0, GENERIC_IMAGE_MAX_COUNT).map((imageUrl, index) => ({
    url: imageUrl,
    sourceUrl: imageUrl,
    role: index === 0 ? 'main' : 'sub',
    excludeBelowWidth: GENERIC_IMAGE_MIN_WIDTH
  }));
}

function limitToMostFrequentHost(urls) {
  if (urls.length === 0) return urls;
  const hostCounts = new Map();
  for (const imageUrl of urls) {
    const host = safeHostname(imageUrl);
    if (!host) continue;
    hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
  }
  let topHost = '';
  let topCount = 0;
  for (const [host, count] of hostCounts) {
    if (count > topCount) {
      topHost = host;
      topCount = count;
    }
  }
  if (!topHost) return urls;
  return urls.filter((imageUrl) => safeHostname(imageUrl) === topHost);
}

// Pulls a likely product-code token out of a trusted image URL (JSON-LD
// Product.image or og:image) so DOM candidates can be restricted to the
// same product instead of relying only on keyword/host heuristics. Looks at
// the pathname only (not the hostname), splits on non-alphanumeric
// characters, and keeps tokens of 8+ characters that are either purely
// numeric or a mix of letters and digits (a bare word like "download"
// does not count). The longest candidate is assumed to be the product code
// rather than a coincidental shorter run (e.g. a date or size token).
function extractProductIdentifier(imageUrl) {
  if (!imageUrl) return '';
  try {
    const parsed = new URL(imageUrl);
    const pathname = decodeURIComponent(parsed.pathname);
    const tokens = pathname.split(/[^0-9a-zA-Z]+/).filter(Boolean);
    const candidates = tokens.filter((token) => {
      if (token.length < 8) return false;
      const isPureNumeric = /^[0-9]+$/.test(token);
      const hasDigit = /[0-9]/.test(token);
      const hasLetter = /[a-zA-Z]/.test(token);
      return isPureNumeric || (hasDigit && hasLetter);
    });
    if (!candidates.length) return '';
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0];
  } catch (_) {
    return '';
  }
}

function safeHostname(imageUrl) {
  try {
    return new URL(imageUrl).hostname;
  } catch (_) {
    return '';
  }
}

module.exports = {
  scrapeProducts,
  scrapeProductPage,
  scrapeImagesFromUrl
};
