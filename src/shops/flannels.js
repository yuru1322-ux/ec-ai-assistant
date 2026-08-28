const { execFile } = require('child_process');

const FLANNELS_HOST_PATTERN = /(^|\.)flannels\.com$/i;
const CURL_STATUS_MARKER = '__CURL_STATUS__';

function isFlannelsUrl(url) {
  try {
    const parsed = new URL(url);
    return FLANNELS_HOST_PATTERN.test(parsed.hostname);
  } catch (_) {
    return false;
  }
}

// flannels.com (Vercel-hosted) cannot be reached by Playwright/Chromium in
// this environment: every page.goto() attempt — including the homepage —
// fails with net::ERR_HTTP2_PROTOCOL_ERROR before any HTTP response is
// received. This was confirmed to be a Playwright/Chromium-specific HTTP/2
// negotiation problem, not a site block or a network-reachability problem:
// a plain `curl` GET (no User-Agent spoofing, no stealth, no proxy) succeeds
// with HTTP 200 and the full product page. The site's own image CDN
// (cdn.media.amplience.net) is unaffected and loads fine through Playwright's
// page.request.get(), so only the initial flannels.com document load needs
// this workaround. See docs/known-issues.md's "flannels.com" section.
//
// This fetches the page via curl and serves that response to page.goto()
// through request interception, so Chromium never makes its own network
// request to flannels.com for the document — everything downstream (generic
// field/image extraction via page.evaluate(), image downloads via
// page.request.get()) runs unmodified against the resulting DOM.
async function gotoFlannelsViaCurl(page, url, timeoutMs) {
  // URL fragments (e.g. #colcode=...) are never sent in the actual network
  // request, so the request Playwright's router sees has the fragment
  // stripped even though page.goto() is called with the original URL.
  // Fetch and match on the fragment-less URL, or the route predicate below
  // never matches and navigation silently falls through to a real (failing)
  // request.
  const urlWithoutFragment = stripFragment(url);
  const { status, body } = await curlGet(urlWithoutFragment, timeoutMs);
  // page.route()'s predicate form receives a URL object, not a string.
  const matchesUrl = (requestUrl) => requestUrl.href === urlWithoutFragment;
  await page.route(matchesUrl, (route) => route.fulfill({
    status,
    contentType: 'text/html; charset=utf-8',
    body
  }));
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    return { status: response ? response.status() : status };
  } finally {
    await page.unroute(matchesUrl);
  }
}

function stripFragment(url) {
  const hashIndex = url.indexOf('#');
  return hashIndex === -1 ? url : url.slice(0, hashIndex);
}

function curlGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    execFile(
      'curl',
      ['-sS', '-L', '--max-time', String(timeoutSeconds), '-w', `${CURL_STATUS_MARKER}%{http_code}`, url],
      { timeout: timeoutMs + 5000, maxBuffer: 1024 * 1024 * 50 },
      (error, stdout) => {
        if (error) {
          reject(new Error(`Flannelsのcurl取得に失敗しました: ${error.message}`));
          return;
        }
        const markerIndex = stdout.lastIndexOf(CURL_STATUS_MARKER);
        if (markerIndex === -1) {
          reject(new Error('Flannelsのcurl取得結果を解析できませんでした'));
          return;
        }
        resolve({
          body: stdout.slice(0, markerIndex),
          status: Number(stdout.slice(markerIndex + CURL_STATUS_MARKER.length))
        });
      }
    );
  });
}

// The generic fallback's page.evaluate() (src/scraper.js) reads JSON-LD for
// name/brand/description only — it does not read price. flannels.com's own
// JSON-LD Product block does carry price/currency/color/sku in its `offers`
// object (verified against the row-34 product page), so this pulls those
// specific fields and lets mergeScrapedData() in scraper.js overlay them
// onto the generic result. This is scoped to flannels.com only; the shared
// generic page.evaluate() extraction other unsupported shops depend on is
// untouched.
async function extractFlannelsProductDetails(page) {
  return page.evaluate(() => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
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

    const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers || {};
    const price = Number(offer.price);
    const sku = clean(jsonLd.sku || offer.sku);

    return {
      price: Number.isFinite(price) && price > 0 ? price : '',
      currency: clean(offer.priceCurrency),
      color: clean(jsonLd.color),
      productCode: sku,
      sku,
      detailSource: 'flannels'
    };
  });
}

module.exports = { isFlannelsUrl, gotoFlannelsViaCurl, extractFlannelsProductDetails };
