const SELFRIDGES_HOST_PATTERN = /(^|\.)selfridges\.com$/i;
const SELFRIDGES_PAGE_FAILURE_STATUS = '要確認：Selfridgesページ取得不可';

function isSelfridgesUrl(url) {
  try {
    const parsed = new URL(url);
    return SELFRIDGES_HOST_PATTERN.test(parsed.hostname);
  } catch (_) {
    return false;
  }
}

async function inspectSelfridgesPage(page, url, timeoutMs) {
  let response = null;
  let reason = 'Selfridges is excluded from automatic scraping';
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
  } catch (error) {
    reason = String(error.message || '').includes('Timeout') ? 'page.goto timeout' : error.message;
    return selfridgesStopResult(url, reason);
  }

  const status = response && response.status();
  if (status === 403 || status === 503) {
    reason = `HTTP ${status}`;
  } else {
    const pageState = await page.evaluate(() => {
      const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
      const bodyText = clean(document.body && document.body.innerText);
      return {
        title: clean(document.title),
        hasCloudflareBlock: /attention required|cloudflare|sorry, you have been blocked/i.test(bodyText),
        hasProductSignal: Boolean(document.querySelector('main, [data-testid*="product" i], [class*="product" i]'))
          && /add to bag|colour|color|size|delivery|returns|£/i.test(bodyText)
      };
    });

    reason = pageState.hasCloudflareBlock
      ? 'Cloudflare block'
      : pageState.hasProductSignal
        ? 'Selfridges automatic scraping disabled'
        : 'product page not available';
  }

  return selfridgesStopResult(url, reason);
}

function selfridgesStopResult(url, reason) {
  return {
    shouldStop: true,
    status: SELFRIDGES_PAGE_FAILURE_STATUS,
    reason,
    sourceProductId: extractSelfridgesProductId(url),
    name: '',
    brand: '',
    price: '',
    currency: '',
    color: '',
    description: '',
    features: [],
    composition: '',
    material: '',
    dimensions: '',
    productCode: '',
    sku: '',
    mpn: '',
    category: '',
    imageUrls: [],
    imageSources: [],
    detailSource: 'selfridges-protection'
  };
}

function extractSelfridgesProductId(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/_([A-Z]\d+)(?:\/|$)/i);
    return match ? match[1].toUpperCase() : '';
  } catch (_) {
    return '';
  }
}

module.exports = {
  SELFRIDGES_PAGE_FAILURE_STATUS,
  isSelfridgesUrl,
  inspectSelfridgesPage,
  extractSelfridgesProductId
};
