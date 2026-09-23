const { parseLocalizedNumber } = require('../utils');

const ALLOTMENT_STORE_HOSTS = new Set(['allotmentstore.com', 'www.allotmentstore.com']);
const ALLOTMENT_STORE_IMAGE_FAILURE_STATUS = '要確認：商品画像取得失敗';
const IMAGE_MIN_WIDTH = 400;
const IMAGE_MAX_COUNT = 15;
const CURRENCY_SYMBOL_MAP = { '£': 'GBP', '€': 'EUR', '$': 'USD', '¥': 'JPY' };
const SEASON_TAG_PATTERN = /^(?:AW|FW|SS|PF|AH|PE)\d{2}$/i;
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

function isAllotmentStoreUrl(url) {
  try {
    const parsed = new URL(url);
    return ALLOTMENT_STORE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Page data collection (browser side). Only what needs a DOM or the page's own
// origin lives here; all parsing/decisions are plain Node.js below so they can
// be verified without a browser.
//
// Shopify's `/products/{handle}.js` is the primary source: images (original
// resolution, no size suffix), variants with per-size availability, vendor,
// type/tags, price, and the description HTML (which is where this shop puts
// COLOUR:/MATERIAL:/PRODUCT CODE:/MADE IN lines — see parseDescription()
// below). The DOM (schema.org `itemprop` microdata) is the fallback and
// supplies currency, since the product JSON carries none. There is no
// Product-type JSON-LD on this site (only an Organization block), so it is
// not read here.
// ---------------------------------------------------------------------------

async function collectAllotmentStorePageData(page, pageUrl) {
  return page.evaluate(async (fallbackUrl) => {
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
        const response = await fetch(`/products/${encodeURIComponent(handle)}.js`, { credentials: 'same-origin' });
        if (response.ok) productJson = await response.json();
      } catch (_) {
        productJson = null;
      }
    }

    const priceCurrencyElement = document.querySelector('[itemprop="priceCurrency"]');

    const largestFromSrcset = (value) => {
      const candidates = String(value || '').split(',')
        .map((part) => {
          const trimmed = part.trim();
          const spaceIndex = trimmed.search(/\s/);
          const url = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
          const width = spaceIndex === -1 ? 0 : Number(trimmed.slice(spaceIndex + 1).replace(/[^\d.]/g, '')) || 0;
          return { url, width };
        })
        .filter((candidate) => candidate.url)
        .sort((a, b) => b.width - a.width);
      return candidates.length ? candidates[0].url : '';
    };
    const galleryImages = Array.from(document.querySelectorAll('.product-single__photos img'))
      .map((img) => largestFromSrcset(img.getAttribute('data-srcset')) || img.getAttribute('data-src') || img.currentSrc || img.getAttribute('src') || '')
      .filter(Boolean)
      .map((value) => {
        try {
          return new URL(value, location.href).href;
        } catch (_) {
          return '';
        }
      })
      .filter(Boolean);

    return {
      productJson,
      dom: {
        title: text('h1.product-single__title'),
        ogTitle: attr('meta[property="og:title"]', 'content'),
        ogDescription: attr('meta[property="og:description"]', 'content'),
        canonicalUrl: attr('meta[property="og:url"]', 'content') || attr('link[rel="canonical"]', 'href'),
        brand: text('[itemprop="brand"]'),
        priceContent: attr('[itemprop="price"]', 'content'),
        currencyPriceCurrency: priceCurrencyElement
          ? clean(priceCurrencyElement.getAttribute('content')) || clean(priceCurrencyElement.textContent)
          : '',
        currencyMeta: attr('meta[property="og:price:currency"], meta[property="product:price:currency"]', 'content'),
        currencyShopify: (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || '',
        ogPriceAmount: attr('meta[property="og:price:amount"], meta[property="product:price:amount"]', 'content'),
        sizeOptions: Array.from(document.querySelectorAll('.single-option-selector option')).map((option) => ({
          value: clean(option.value),
          text: clean(option.textContent),
          disabled: option.disabled
        })),
        galleryImages
      }
    };
  }, pageUrl || '');
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

// One text line per block/`<br>` segment, in page order. This shop's
// description is a single `<ul>` with one fact per `<li>` (see
// parseDescription() below), but plain text falls through unchanged too.
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

function titleCase(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase());
}

function normalizeCurrencyCode(value) {
  const textValue = cleanText(value);
  if (!textValue) return '';
  if (/^[A-Za-z]{3}$/.test(textValue)) return textValue.toUpperCase();
  if (CURRENCY_SYMBOL_MAP[textValue[0]]) return CURRENCY_SYMBOL_MAP[textValue[0]];
  return '';
}

function parsePositiveAmount(value) {
  const numeric = String(value === undefined || value === null ? '' : value).replace(/[^0-9.,]/g, '');
  const amount = parseLocalizedNumber(numeric);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// ---------------------------------------------------------------------------
// Description parsing
// ---------------------------------------------------------------------------

function labelledValue(lines, labelPattern) {
  const match = lines.map((line) => line.match(new RegExp(`^${labelPattern}\\s*[:：]\\s*(.+)$`, 'i'))).find(Boolean);
  return match ? cleanText(match[1]) : '';
}

// This shop writes a single "MATERIAL: X% Y, Z% W" line (no per-part
// breakdown across multiple lines, unlike collardManson.js/labStoreWorld.js),
// so composition is just that line split on its separators.
function splitMaterial(value) {
  return String(value || '')
    .split(/\s*[,/]\s*|\s+and\s+/i)
    .map(cleanText)
    .filter(Boolean);
}

function findSeason(tags) {
  const tag = (Array.isArray(tags) ? tags : [])
    .map(cleanText)
    .find((value) => SEASON_TAG_PATTERN.test(value));
  return tag ? tag.toUpperCase() : '';
}

function parseDescription(lines) {
  const color = labelledValue(lines, 'colou?rs?');
  const materialLine = labelledValue(lines, 'materials?');
  const productCode = labelledValue(lines, 'product\\s*code');
  const madeIn = lines.map((line) => line.match(/^made in\s+(.+)$/i)).find(Boolean);
  const countryOfOrigin = madeIn ? titleCase(madeIn[1]) : '';

  const isMetadataLine = (line) => /^colou?rs?\s*[:：]/i.test(line)
    || /^materials?\s*[:：]/i.test(line)
    || /^product\s*code\s*[:：]/i.test(line)
    || /^made in\s+/i.test(line);

  return {
    description: lines.join('\n'),
    features: lines.filter((line) => !isMetadataLine(line)),
    color,
    material: materialLine,
    composition: splitMaterial(materialLine).join('\n'),
    productCode,
    countryOfOrigin
  };
}

// ---------------------------------------------------------------------------
// Sizes / availability
// ---------------------------------------------------------------------------

function optionName(option) {
  return cleanText(typeof option === 'string' ? option : option && option.name);
}

function buildSizeVariants(productJson, domSizeOptions) {
  const variants = productJson && Array.isArray(productJson.variants) ? productJson.variants : [];
  const options = productJson && Array.isArray(productJson.options) ? productJson.options : [];
  const sizeIndex = options.findIndex((option) => /size|サイズ/i.test(optionName(option)));

  const bySize = new Map();
  if (variants.length > 0 && sizeIndex >= 0) {
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
        quantity: Number.isFinite(variant.inventory_quantity) ? variant.inventory_quantity : null
      });
    }
  } else if (Array.isArray(domSizeOptions)) {
    for (const option of domSizeOptions) {
      const size = cleanText(option.value || option.text);
      if (!size || bySize.has(size)) continue;
      bySize.set(size, {
        size,
        available: !option.disabled && !/sold out|out of stock/i.test(option.text || ''),
        sku: '',
        barcode: '',
        quantity: null
      });
    }
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

// ---------------------------------------------------------------------------
// Price / currency
// ---------------------------------------------------------------------------

// Currency: this site's own `itemprop="priceCurrency"` meta first, then
// og/product price meta, then Shopify's active presentment currency (the
// product JSON itself carries no currency field).
function resolveCurrency(raw) {
  const dom = raw.dom || {};
  const candidates = [
    ['itemprop-priceCurrency', normalizeCurrencyCode(dom.currencyPriceCurrency)],
    ['meta', normalizeCurrencyCode(dom.currencyMeta)],
    ['shopify-currency', normalizeCurrencyCode(dom.currencyShopify)]
  ];
  const found = candidates.find(([, code]) => code);
  return found ? { currency: found[1], source: found[0] } : { currency: '', source: '' };
}

// Price: product JSON (integer minor units, 72000 = 720.00) first since it is
// this specific variant/selection-independent (all sizes share one price on
// this shop), then the page's own `itemprop="price"` content, then og price
// meta. A disagreement between sources adds a warning.
function resolvePrice(raw) {
  const dom = raw.dom || {};
  const productJson = raw.productJson;
  const jsonPrice = productJson && Number.isFinite(productJson.price) && productJson.price > 0
    ? productJson.price / 100
    : null;
  const domAttrPrice = parsePositiveAmount(dom.priceContent);
  const metaPrice = parsePositiveAmount(dom.ogPriceAmount);

  let price = null;
  let source = '';
  if (jsonPrice !== null) {
    price = jsonPrice;
    source = 'product-json';
  } else if (domAttrPrice !== null) {
    price = domAttrPrice;
    source = 'itemprop-price';
  } else if (metaPrice !== null) {
    price = metaPrice;
    source = 'meta';
  }

  const warnings = [];
  const others = [['itemprop', domAttrPrice], ['og meta', metaPrice]]
    .filter(([, value]) => value !== null && price !== null && Math.abs(value - price) > 0.005);
  others.forEach(([label, value]) => warnings.push(`Allotment Store price mismatch: ${source} ${price} vs ${label} ${value}`));
  return { price, source, warnings };
}

// ---------------------------------------------------------------------------
// Product details
// ---------------------------------------------------------------------------

function buildAllotmentStoreProductDetails(raw, pageUrl) {
  const dom = raw.dom || {};
  const productJson = raw.productJson || null;

  const name = cleanText(productJson && productJson.title) || cleanText(dom.title) || cleanText(dom.ogTitle);
  const brand = cleanText(dom.brand) || cleanText(productJson && productJson.vendor);
  const category = cleanText(productJson && productJson.type);
  const tags = productJson && Array.isArray(productJson.tags) ? productJson.tags : [];

  const descriptionLines = htmlToLines(productJson && productJson.description).length > 0
    ? htmlToLines(productJson.description)
    : htmlToLines(dom.ogDescription);
  const parsed = parseDescription(descriptionLines);

  // Product code: the description's own PRODUCT CODE line is authoritative;
  // a variant's barcode (this shop puts the product code there, not sku) is
  // only a fallback, and only when every variant shares the same one.
  const variantBarcodes = Array.from(new Set(((productJson && productJson.variants) || [])
    .map((variant) => cleanText(variant.barcode))
    .filter(Boolean)));
  const productCode = parsed.productCode || (variantBarcodes.length === 1 ? variantBarcodes[0] : '');

  const sizeVariants = buildSizeVariants(productJson, dom.sizeOptions);
  const availability = resolveAvailability(sizeVariants, productJson);
  const { price, source: priceSource, warnings: priceWarnings } = resolvePrice(raw);
  const { currency, source: currencySource } = resolveCurrency(raw);
  const sale = resolveSaleState(productJson, price);
  const season = findSeason(tags);

  const result = {
    name,
    brand,
    price: price === null ? '' : price,
    currency,
    color: parsed.color,
    description: parsed.description || cleanText(dom.ogDescription),
    features: parsed.features,
    composition: parsed.composition,
    material: parsed.material,
    dimensions: '',
    weight: '',
    productCode,
    sku: productCode,
    mpn: '',
    countryOfOrigin: parsed.countryOfOrigin,
    category,
    season,
    seasonCode: season,
    sizes: sizeVariants.map((variant) => variant.size),
    availableSizes: sizeVariants.filter((variant) => variant.available).map((variant) => variant.size),
    sizeVariants,
    availability,
    onSale: sale.onSale,
    originalPrice: sale.originalPrice,
    productUrl: cleanText(pageUrl),
    canonicalUrl: cleanText(dom.canonicalUrl),
    priceSource,
    currencySource,
    detailSource: 'allotment-store',
    extractionLog: {
      color: { value: parsed.color, source: parsed.color ? 'description-colour-line' : '' },
      currency: { value: currency, source: currencySource },
      price: { value: price === null ? '' : price, source: priceSource },
      productCode: { value: productCode, source: parsed.productCode ? 'description-product-code-line' : (productCode ? 'variant-barcode' : '') },
      sale: { value: sale.onSale, source: sale.source }
    },
    warnings: [...priceWarnings]
  };

  if (currency && currency !== 'GBP') {
    result.warnings.push(`Allotment Store page currency is not GBP: ${currency}`);
  }
  if (!productJson) {
    result.warnings.push('Allotment Store product JSON could not be fetched; DOM fallback used');
  }

  for (const field of DETAIL_FIELDS) {
    if (!(field in result)) result[field] = '';
  }
  result.rawBlocks = { description: descriptionLines, tags };
  return result;
}

async function extractAllotmentStoreProductDetails(page, pageUrl) {
  const raw = await collectAllotmentStorePageData(page, pageUrl);
  return buildAllotmentStoreProductDetails(raw, pageUrl);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

// Shopify serves the same upload at many sizes by appending a `_WxH`/`_medium`/
// ... suffix to the file name, or (newer themes) a `width`/`height` query.
// Product JSON's `images` array is already the original file with neither, but
// the DOM fallback gallery is not, so this normalization is still needed there.
const SHOPIFY_SIZE_SUFFIX = /_(?:pico|icon|thumb|small|compact|medium|large|grande|original|master|\d+x\d*|\d*x\d+)(?:@\d+x)?(?:_crop_\w+)?(?=\.[a-z0-9]+$)/i;

function toAllotmentStoreOriginalUrl(imageUrl, baseUrl = 'https://www.allotmentstore.com/') {
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

// Host-, protocol-, size- and revision-independent: the last `/files/` (or
// `/products/`) segment plus the file name.
function canonicalAllotmentStoreImageKey(imageUrl) {
  try {
    const parsed = new URL(toAllotmentStoreOriginalUrl(imageUrl));
    const match = parsed.pathname.match(/^.*\/(files|products)\/([^/]+)$/);
    return match ? `${match[1]}/${match[2]}` : parsed.pathname;
  } catch (_) {
    return String(imageUrl || '').split('?')[0];
  }
}

function isAllotmentStoreProductImageUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (/\.svg$/i.test(parsed.pathname)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'cdn.shopify.com') return true;
    return ALLOTMENT_STORE_HOSTS.has(host) && parsed.pathname.startsWith('/cdn/shop/');
  } catch (_) {
    return false;
  }
}

function productJsonImageUrls(productJson) {
  if (!productJson) return [];
  const fromImages = Array.isArray(productJson.images) ? productJson.images : [];
  const fromMedia = Array.isArray(productJson.media)
    ? productJson.media.filter((item) => item && item.media_type === 'image').map((item) => item.src)
    : [];
  const list = fromImages.length > 0 ? fromImages : fromMedia;
  return (list.length > 0 ? list : [productJson.featured_image]).filter(Boolean);
}

// Product JSON `images` is the primary gallery (exact Shopify order, original
// files). The `.product-single__photos` DOM gallery is used only when the
// JSON is missing; its displayed URL is kept as `sourceUrl` so images.js can
// fall back to it if an original ever fails to download.
function buildAllotmentStoreImageSources(raw, baseUrl) {
  const base = baseUrl || 'https://www.allotmentstore.com/';
  const domUrls = ((raw.dom && raw.dom.galleryImages) || [])
    .map((url) => new URL(url, base).href)
    .filter(isAllotmentStoreProductImageUrl);
  const displayedByKey = new Map();
  domUrls.forEach((url) => {
    const key = canonicalAllotmentStoreImageKey(url);
    if (!displayedByKey.has(key)) displayedByKey.set(key, url);
  });

  const jsonUrls = productJsonImageUrls(raw.productJson)
    .map((url) => new URL(url, base).href)
    .filter(isAllotmentStoreProductImageUrl);
  const ordered = jsonUrls.length > 0 ? jsonUrls : domUrls;

  const seen = new Set();
  const sources = [];
  for (const url of ordered) {
    const canonicalKey = canonicalAllotmentStoreImageKey(url);
    if (seen.has(canonicalKey)) continue;
    seen.add(canonicalKey);
    const originalUrl = toAllotmentStoreOriginalUrl(url, base);
    sources.push({
      url: originalUrl,
      sourceUrl: displayedByKey.get(canonicalKey) || originalUrl,
      canonicalKey,
      role: sources.length === 0 ? 'main' : 'sub',
      excludeBelowWidth: IMAGE_MIN_WIDTH
    });
  }
  return sources.slice(0, IMAGE_MAX_COUNT);
}

async function extractAllotmentStoreImages(page) {
  const raw = await collectAllotmentStorePageData(page, page.url());
  return buildAllotmentStoreImageSources(raw, page.url());
}

module.exports = {
  ALLOTMENT_STORE_IMAGE_FAILURE_STATUS,
  isAllotmentStoreUrl,
  extractAllotmentStoreProductDetails,
  extractAllotmentStoreImages,
  // Exported for unit verification without a browser:
  buildAllotmentStoreProductDetails,
  buildAllotmentStoreImageSources,
  toAllotmentStoreOriginalUrl,
  canonicalAllotmentStoreImageKey,
  htmlToLines,
  parseDescription
};
