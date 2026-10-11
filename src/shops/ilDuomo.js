const IL_DUOMO_HOSTS = new Set(['ilduomo.it', 'www.ilduomo.it']);
const IL_DUOMO_IMAGE_FAILURE_STATUS = '要確認：商品画像取得失敗';
const IMAGE_MIN_WIDTH = 400;
const IMAGE_MAX_COUNT = 15;
// Client-confirmed (2026-10-11): cost is the Italian VAT-inclusive price.
// Shopify Markets prices this shop per destination country — EU countries
// (IT/FR/...) get the VAT-inclusive price (e.g. EUR 1730.00), non-EU countries
// (GB/JP) the VAT-free one (EUR 1418.03 = 1730 / 1.22) — and the A-column URL
// may carry any `country=` parameter (Google Shopping links use `country=GB`).
// The product JSON is therefore always requested with this explicit market,
// independent of the URL and of the VPN location.
const PRICE_MARKET = { country: 'IT', currency: 'EUR' };
// Shopify tags on this shop mix category words (`clothing`, `coat/outerwear`,
// `puffer`) with internal flags (`MAN`, `POSITION_SET`, `PRIMO_20`), numeric
// ids and the style code. Only the all-lowercase word tags are category text.
const CATEGORY_TAG_PATTERN = /^[a-z][a-z /&-]*$/;
const DETAIL_FIELDS = [
  'name',
  'brand',
  'price',
  'currency',
  'color',
  'description',
  'features',
  'composition',
  'material',
  'dimensions',
  'weight',
  'productCode',
  'sku',
  'mpn',
  'countryOfOrigin',
  'category'
];

function isIlDuomoUrl(url) {
  try {
    const parsed = new URL(url);
    return IL_DUOMO_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Page data collection (browser side). Shopify's `/products/{handle}.js` is the
// only price source: the DOM/og/JSON-LD price follows whatever market the
// A-column URL selected, so it is never used as a cost fallback (a missing JSON
// leaves the price empty and the row stops with 価格取得失敗).
// ---------------------------------------------------------------------------

async function collectIlDuomoPageData(page, pageUrl) {
  return page.evaluate(async ({ fallbackUrl, market }) => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const attr = (selector, name) => {
      const element = document.querySelector(selector);
      return element ? clean(element.getAttribute(name)) : '';
    };
    const text = (selector) => {
      const element = document.querySelector(selector);
      return element ? clean(element.textContent) : '';
    };

    const handleFrom = (value) => {
      try {
        const match = new URL(value, location.href).pathname.match(/\/products\/([^/?#]+)/);
        return match ? decodeURIComponent(match[1]) : '';
      } catch (_) {
        return '';
      }
    };
    const handle = handleFrom(location.href) || handleFrom(fallbackUrl);

    let productJson = null;
    if (handle) {
      try {
        const query = new URLSearchParams(market).toString();
        const response = await fetch(`/products/${encodeURIComponent(handle)}.js?${query}`, { credentials: 'same-origin' });
        if (response.ok) productJson = await response.json();
      } catch (_) {
        productJson = null;
      }
    }

    return {
      productJson,
      dom: {
        title: text('h1'),
        ogTitle: attr('meta[property="og:title"]', 'content'),
        ogDescription: attr('meta[property="og:description"]', 'content'),
        canonicalUrl: attr('link[rel="canonical"]', 'href') || attr('meta[property="og:url"]', 'content')
      }
    };
  }, { fallbackUrl: pageUrl || '', market: PRICE_MARKET });
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function cleanText(value) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function htmlToLines(html) {
  const textValue = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br(?:\s[^>]*)?\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|tr|table|section)(?:\s[^>]*)?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(textValue)
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Sizes / availability
// ---------------------------------------------------------------------------

function optionName(option) {
  return cleanText(typeof option === 'string' ? option : option && option.name);
}

function buildSizeVariants(productJson) {
  const variants = productJson && Array.isArray(productJson.variants) ? productJson.variants : [];
  const options = productJson && Array.isArray(productJson.options) ? productJson.options : [];
  const sizeIndex = options.findIndex((option) => /size|taglia|サイズ/i.test(optionName(option)));
  if (sizeIndex < 0) return [];

  const bySize = new Map();
  for (const variant of variants) {
    const size = cleanText(Array.isArray(variant.options) ? variant.options[sizeIndex] : variant[`option${sizeIndex + 1}`]);
    if (!size) continue;
    const available = variant.available === true;
    const existing = bySize.get(size);
    if (existing) {
      existing.available = existing.available || available;
      continue;
    }
    bySize.set(size, {
      size,
      available,
      sku: cleanText(variant.sku),
      barcode: cleanText(variant.barcode),
      quantity: null
    });
  }
  return Array.from(bySize.values());
}

function resolveAvailability(sizeVariants, productJson) {
  if (sizeVariants.length > 0) {
    const availableCount = sizeVariants.filter((variant) => variant.available).length;
    if (availableCount === 0) return 'out_of_stock';
    return availableCount === sizeVariants.length ? 'in_stock' : 'partially_in_stock';
  }
  if (productJson && typeof productJson.available === 'boolean') {
    return productJson.available ? 'in_stock' : 'out_of_stock';
  }
  return '';
}

function resolveSaleState(productJson, price) {
  if (!productJson) return { onSale: null, originalPrice: '', source: '' };
  const compareValues = [];
  if (Number.isFinite(productJson.compare_at_price)) compareValues.push(productJson.compare_at_price);
  (productJson.variants || []).forEach((variant) => {
    if (Number.isFinite(variant.compare_at_price)) compareValues.push(variant.compare_at_price);
  });
  const compareAtPrice = compareValues.length > 0 ? Math.max(...compareValues) / 100 : null;
  if (price !== null && compareAtPrice !== null && compareAtPrice > price) {
    return { onSale: true, originalPrice: compareAtPrice, source: 'product-json-compare-at-price' };
  }
  return { onSale: false, originalPrice: '', source: 'product-json' };
}

// Variant SKUs are `{style code}-{size}` (e.g. `L20911A00218.597YW-26C MEDIUM B-3`);
// the product code is the part shared by every variant, taken only when all
// variants agree on it.
function resolveProductCode(productJson, sizeVariants) {
  const codes = new Set(sizeVariants
    .filter((variant) => variant.sku)
    .map((variant) => {
      const suffix = `-${variant.size}`;
      return variant.sku.endsWith(suffix) ? variant.sku.slice(0, -suffix.length) : variant.sku;
    }));
  if (codes.size === 1) return Array.from(codes)[0];
  const singleSku = productJson && Array.isArray(productJson.variants) && productJson.variants.length === 1
    ? cleanText(productJson.variants[0].sku)
    : '';
  return singleSku;
}

// ---------------------------------------------------------------------------
// Product details
// ---------------------------------------------------------------------------

function buildIlDuomoProductDetails(raw, pageUrl) {
  const dom = raw.dom || {};
  const productJson = raw.productJson || null;

  const name = cleanText(productJson && productJson.title) || cleanText(dom.title) || cleanText(dom.ogTitle);
  const brand = cleanText(productJson && productJson.vendor);
  const tags = productJson && Array.isArray(productJson.tags) ? productJson.tags.map(cleanText) : [];
  const category = cleanText(productJson && productJson.type)
    || tags.filter((tag) => CATEGORY_TAG_PATTERN.test(tag)).join(' / ');

  const descriptionLines = productJson && htmlToLines(productJson.description).length > 0
    ? htmlToLines(productJson.description)
    : htmlToLines(dom.ogDescription);

  const sizeVariants = buildSizeVariants(productJson);
  const availability = resolveAvailability(sizeVariants, productJson);
  const price = productJson && Number.isFinite(productJson.price) && productJson.price > 0
    ? productJson.price / 100
    : null;
  const currency = price === null ? '' : PRICE_MARKET.currency;
  const priceSource = price === null ? '' : `product-json-${PRICE_MARKET.country}`;
  const sale = resolveSaleState(productJson, price);
  const productCode = resolveProductCode(productJson, sizeVariants);

  // This shop's description is a single prose paragraph with no labelled
  // colour/material/origin lines, so those fields are left empty rather than
  // guessed from the prose.
  const result = {
    name,
    brand,
    price: price === null ? '' : price,
    currency,
    color: '',
    description: descriptionLines.join('\n'),
    features: descriptionLines,
    composition: '',
    material: '',
    dimensions: '',
    weight: '',
    productCode,
    sku: productCode,
    mpn: '',
    countryOfOrigin: '',
    category,
    season: '',
    seasonCode: '',
    sizes: sizeVariants.map((variant) => variant.size),
    availableSizes: sizeVariants.filter((variant) => variant.available).map((variant) => variant.size),
    sizeVariants,
    availability,
    onSale: sale.onSale,
    originalPrice: sale.originalPrice,
    productUrl: cleanText(pageUrl),
    canonicalUrl: cleanText(dom.canonicalUrl),
    priceSource,
    currencySource: priceSource,
    detailSource: 'il-duomo',
    extractionLog: {
      currency: { value: currency, source: priceSource },
      price: { value: price === null ? '' : price, source: priceSource },
      productCode: { value: productCode, source: productCode ? 'variant-sku' : '' },
      sale: { value: sale.onSale, source: sale.source }
    },
    warnings: []
  };

  if (!productJson) {
    result.warnings.push('Il Duomo product JSON could not be fetched; price left empty');
  }

  for (const field of DETAIL_FIELDS) {
    if (!(field in result)) result[field] = '';
  }
  result.rawBlocks = { description: descriptionLines, tags };
  return result;
}

async function extractIlDuomoProductDetails(page, pageUrl) {
  const raw = await collectIlDuomoPageData(page, pageUrl);
  return buildIlDuomoProductDetails(raw, pageUrl);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

// The page itself renders dozens of other products' images (recommendations,
// menus), so only the product JSON's `images` array is used — it is exactly
// this product's gallery in Shopify order, as original files. There is no DOM
// fallback: when the JSON is missing the row gets the image-failure status.
const SHOPIFY_SIZE_SUFFIX = /_(?:pico|icon|thumb|small|compact|medium|large|grande|original|master|\d+x\d*|\d*x\d+)(?:@\d+x)?(?:_crop_\w+)?(?=\.[a-z0-9]+$)/i;

function toIlDuomoOriginalUrl(imageUrl, baseUrl = 'https://www.ilduomo.it/') {
  try {
    const parsed = new URL(imageUrl, baseUrl);
    parsed.protocol = 'https:';
    parsed.pathname = parsed.pathname.replace(SHOPIFY_SIZE_SUFFIX, '');
    ['width', 'height', 'crop', 'scale'].forEach((param) => parsed.searchParams.delete(param));
    return parsed.href;
  } catch (_) {
    return String(imageUrl || '');
  }
}

function canonicalIlDuomoImageKey(imageUrl) {
  try {
    const parsed = new URL(toIlDuomoOriginalUrl(imageUrl));
    const match = parsed.pathname.match(/^.*\/(files|products)\/([^/]+)$/);
    return match ? `${match[1]}/${match[2]}` : parsed.pathname;
  } catch (_) {
    return String(imageUrl || '').split('?')[0];
  }
}

function isIlDuomoProductImageUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (/\.svg$/i.test(parsed.pathname)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'cdn.shopify.com') return true;
    return IL_DUOMO_HOSTS.has(host) && parsed.pathname.startsWith('/cdn/shop/');
  } catch (_) {
    return false;
  }
}

function buildIlDuomoImageSources(raw, baseUrl) {
  const base = baseUrl || 'https://www.ilduomo.it/';
  const productJson = raw.productJson;
  const list = productJson && Array.isArray(productJson.images) && productJson.images.length > 0
    ? productJson.images
    : [productJson && productJson.featured_image].filter(Boolean);

  const seen = new Set();
  const sources = [];
  for (const value of list) {
    const url = toIlDuomoOriginalUrl(value, base);
    if (!isIlDuomoProductImageUrl(url)) continue;
    const canonicalKey = canonicalIlDuomoImageKey(url);
    if (seen.has(canonicalKey)) continue;
    seen.add(canonicalKey);
    sources.push({
      url,
      sourceUrl: url,
      canonicalKey,
      role: sources.length === 0 ? 'main' : 'sub',
      excludeBelowWidth: IMAGE_MIN_WIDTH
    });
  }
  return sources.slice(0, IMAGE_MAX_COUNT);
}

async function extractIlDuomoImages(page) {
  const raw = await collectIlDuomoPageData(page, page.url());
  return buildIlDuomoImageSources(raw, page.url());
}

module.exports = {
  IL_DUOMO_IMAGE_FAILURE_STATUS,
  isIlDuomoUrl,
  extractIlDuomoProductDetails,
  extractIlDuomoImages,
  // Exported for unit verification without a browser:
  buildIlDuomoProductDetails,
  buildIlDuomoImageSources,
  toIlDuomoOriginalUrl,
  htmlToLines
};
