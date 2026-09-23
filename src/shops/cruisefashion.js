const { execFile } = require('child_process');

const CRUISE_FASHION_HOST_PATTERN = /(^|\.)cruisefashion\.com$/i;
const CURL_STATUS_MARKER = '__CURL_STATUS__';

function isCruiseFashionUrl(url) {
  try {
    const parsed = new URL(url);
    return CRUISE_FASHION_HOST_PATTERN.test(parsed.hostname);
  } catch (_) {
    return false;
  }
}

// cruisefashion.com cannot be reached by Playwright/Chromium in this
// environment: every page.goto() attempt — including the bare homepage —
// fails with net::ERR_HTTP2_PROTOCOL_ERROR before any HTTP response is
// received. Confirmed to be the exact same Playwright/Chromium-specific
// HTTP/2 negotiation problem documented for flannels.com in
// docs/known-issues.md, not a site block: a plain `curl` GET (no
// User-Agent spoofing, no stealth, no proxy) succeeds with HTTP 200 and
// the full product page (~395KB), containing a complete schema.org
// Product JSON-LD block (name/brand/price/color/description/sku) that the
// existing generic extraction in src/scraper.js reads without any
// cruisefashion-specific field parsing needed. The site's own image CDN
// (cdn.media.amplience.net) is unaffected and loads fine through
// Playwright's page.request.get(), so only the initial cruisefashion.com
// document load needs this workaround.
//
// This fetches the page via curl and serves that response to page.goto()
// through request interception, so Chromium never makes its own network
// request to cruisefashion.com for the document — everything downstream
// (generic field/image extraction via page.evaluate(), image downloads via
// page.request.get()) runs unmodified against the resulting DOM. Mirrors
// src/shops/flannels.js's gotoFlannelsViaCurl() exactly; see that file and
// docs/known-issues.md's "flannels.com" section for the fuller
// investigation writeup.
async function gotoCruiseFashionViaCurl(page, url, timeoutMs) {
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
          reject(new Error(`Cruise Fashionのcurl取得に失敗しました: ${error.message}`));
          return;
        }
        const markerIndex = stdout.lastIndexOf(CURL_STATUS_MARKER);
        if (markerIndex === -1) {
          reject(new Error('Cruise Fashionのcurl取得結果を解析できませんでした'));
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

module.exports = { isCruiseFashionUrl, gotoCruiseFashionViaCurl };
