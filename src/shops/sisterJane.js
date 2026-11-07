const SISTER_JANE_HOSTS = new Set(['sisterjane.com', 'www.sisterjane.com']);
const SISTER_JANE_IMAGE_FAILURE_STATUS = '要確認：商品画像取得失敗';
const IMAGE_MIN_WIDTH = 400;
const IMAGE_MAX_COUNT = 15;
// The Shopify `vendor` is the collection line shown above the product name
// (`The Art Of Living`), not the brand, so the brand is fixed.
const SISTER_JANE_BRAND = 'SISTER JANE';
// Cost is the UK GBP price. The product JSON is requested with this explicit
// market so the price stays GBP whatever currency the session cookie selects.
const PRICE_MARKET = { country: 'GB', currency: 'GBP' };
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

function isSisterJaneUrl(url) {
  try {
    const parsed = new URL(url);
    return SISTER_JANE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Page data collection (browser side). Shopify's `/products/{handle}.js` is the
// source of name, price, variants and images; the "Details & Fit" collapsible
// (`.product-single__custom-field-title` / `-text` pairs) is the only place the
// product details, model size, composition and care are given.
// ---------------------------------------------------------------------------

async function collectSisterJanePageData(page, pageUrl) {
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

    // A-column URLs may be `/collections/{collection}/products/{handle}`.
    const handleFrom = (value) => {
      try {
        const match = new URL(value, location.href).pathname.match(/\/products\/([^/?#]+)/i);
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

    // Each title is followed by one or more text blocks (Size & Fit has the
    // model sentence plus a `.size-fit-scale` widget, which is skipped).
    const fields = [];
    let current = null;
    document.querySelectorAll('.product-single__custom-field-title, .product-single__custom-field-text').forEach((element) => {
      if (element.classList.contains('product-single__custom-field-title')) {
        current = { title: clean(element.textContent), texts: [] };
        fields.push(current);
        return;
      }
      if (!current || element.querySelector('.size-fit-scale')) return;
      const value = clean(element.textContent);
      if (value) current.texts.push(value);
    });

    // Sizes the page actually offers. The product JSON also carries a hidden
    // `Z` placeholder variant that is never shown as a size option.
    const shownSizes = Array.from(document.querySelectorAll('input[type="radio"][name="Size"]'))
      .map((input) => clean(input.value))
      .filter(Boolean);

    return {
      productJson,
      fields: fields.filter((field) => field.title && field.texts.length > 0),
      shownSizes,
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
    .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|tr|table|section|span)(?:\s[^>]*)?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(textValue)
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);
}

function fieldText(fields, pattern) {
  const field = (fields || []).find((item) => pattern.test(item.title));
  return field ? field.texts.map(cleanText).filter(Boolean).join('\n') : '';
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

function optionIndex(productJson, pattern) {
  const options = productJson && Array.isArray(productJson.options) ? productJson.options : [];
  return options.findIndex((option) => pattern.test(cleanText(typeof option === 'string' ? option : option && option.name)));
}

function variantOption(variant, index) {
  if (index < 0) return '';
  return cleanText(Array.isArray(variant.options) ? variant.options[index] : variant[`option${index + 1}`]);
}

function buildSizeVariants(productJson, shownSizes) {
  const variants = productJson && Array.isArray(productJson.variants) ? productJson.variants : [];
  const sizeIndex = optionIndex(productJson, /size|サイズ/i);
  if (sizeIndex < 0) return [];
  const shown = new Set((shownSizes || []).map(cleanText));

  const bySize = new Map();
  for (const variant of variants) {
    const size = variantOption(variant, sizeIndex);
    if (!size) continue;
    if (shown.size > 0 && !shown.has(size)) continue;
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

// Each product handle is one colour, so the Color option has a single value;
// it is used only when every variant agrees.
function resolveColor(productJson) {
  const variants = productJson && Array.isArray(productJson.variants) ? productJson.variants : [];
  const colorIndex = optionIndex(productJson, /colou?r|カラー/i);
  const colors = new Set(variants.map((variant) => variantOption(variant, colorIndex)).filter(Boolean));
  return colors.size === 1 ? Array.from(colors)[0] : '';
}

// Variant SKUs are `{style code}-{size}` (`DR2626IVO-XS`, `DR2626IVO-MP`); the
// style code is used only when every SKU shares it.
function resolveProductCode(productJson) {
  const variants = productJson && Array.isArray(productJson.variants) ? productJson.variants : [];
  const codes = new Set(variants
    .map((variant) => cleanText(variant.sku))
    .filter(Boolean)
    .map((sku) => (sku.includes('-') ? sku.slice(0, sku.lastIndexOf('-')) : '')));
  if (codes.size !== 1) return '';
  return Array.from(codes)[0];
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

// Only a compare-at price strictly higher than the price means a sale.
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
// Product details
// ---------------------------------------------------------------------------

function buildSisterJaneProductDetails(raw, pageUrl) {
  const dom = raw.dom || {};
  const productJson = raw.productJson || null;
  const warnings = [];

  const name = cleanText(productJson && productJson.title) || cleanText(dom.title) || cleanText(dom.ogTitle);
  const line = cleanText(productJson && productJson.vendor);
  const tags = productJson && Array.isArray(productJson.tags) ? productJson.tags.map(cleanText) : [];
  const category = cleanText(productJson && productJson.type);

  const descriptionLines = productJson && htmlToLines(productJson.description).length > 0
    ? htmlToLines(productJson.description)
    : htmlToLines(dom.ogDescription);

  // "Product Details" holds the garment description, including length
  // sentences such as "The length of the dress is 83-88 cm depending on the
  // size." It is kept as a feature, not as `dimensions`: a per-size range is not
  // a measurement table, and `dimensions` would suppress the 販売サイズ line.
  const productDetailsText = fieldText(raw.fields, /product details/i);
  const features = productDetailsText ? productDetailsText.split('\n') : [];
  const composition = cleanText(fieldText(raw.fields, /composition/i));
  const careInstructions = cleanText(fieldText(raw.fields, /care/i));

  const sizeVariants = buildSizeVariants(productJson, raw.shownSizes);
  const availability = resolveAvailability(sizeVariants, productJson);
  const color = resolveColor(productJson);
  const productCode = resolveProductCode(productJson);
  // The theme prints the same "Size & Fit" model sentence on one-size products
  // such as bags, so it is kept only when the product has a size choice.
  const modelInfo = sizeVariants.length > 1 ? cleanText(fieldText(raw.fields, /size\s*&\s*fit/i)) : '';

  const price = productJson && Number.isFinite(productJson.price) && productJson.price > 0
    ? productJson.price / 100
    : null;
  const currency = price === null ? '' : PRICE_MARKET.currency;
  const priceSource = price === null ? '' : `product-json-${PRICE_MARKET.country}`;
  const sale = resolveSaleState(productJson, price);

  const result = {
    name,
    brand: SISTER_JANE_BRAND,
    price: price === null ? '' : price,
    currency,
    color,
    description: descriptionLines.join('\n'),
    features: features.length > 0 ? features : descriptionLines,
    composition,
    material: composition,
    care: careInstructions,
    careInstructions,
    modelInfo,
    dimensions: '',
    weight: '',
    productCode,
    sku: '',
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
    detailSource: 'sister-jane',
    extractionLog: {
      color: { value: color, source: color ? 'product-json-option' : '' },
      composition: { value: composition, source: composition ? 'details-fit-composition' : '' },
      productCode: { value: productCode, source: productCode ? 'product-json-variant-sku' : '' },
      currency: { value: currency, source: priceSource },
      price: { value: price === null ? '' : price, source: priceSource },
      sale: { value: sale.onSale, source: sale.source }
    },
    warnings
  };

  if (!productJson) {
    warnings.push('Sister Jane product JSON could not be fetched; price left empty');
  }

  for (const field of DETAIL_FIELDS) {
    if (!(field in result)) result[field] = '';
  }
  result.rawBlocks = { description: descriptionLines, tags, line };
  return result;
}

async function extractSisterJaneProductDetails(page, pageUrl) {
  const raw = await collectSisterJanePageData(page, pageUrl);
  return buildSisterJaneProductDetails(raw, pageUrl);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

// Only the product JSON's `images` array is used: it is exactly this product's
// gallery in Shopify order. The og/JSON-LD images are 1200x630 social crops of
// only three photos, and the page renders other products' images ("You may
// also like"), so there is no DOM fallback.
const SHOPIFY_SIZE_SUFFIX = /_(?:pico|icon|thumb|small|compact|medium|large|grande|original|master|\d+x\d*|\d*x\d+)(?:@\d+x)?(?:_crop_\w+)?(?=\.[a-z0-9]+$)/i;
// The gallery ends with a low-resolution line-sheet image whose file name
// carries the price (`SISTERJANE_DR2626IVO_..._95.0_LowRes.jpg`).
const EXCLUDED_IMAGE_PATTERN = /lowres/i;

function toSisterJaneOriginalUrl(imageUrl, baseUrl = 'https://sisterjane.com/') {
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

function canonicalSisterJaneImageKey(imageUrl) {
  try {
    const parsed = new URL(toSisterJaneOriginalUrl(imageUrl));
    const match = parsed.pathname.match(/^.*\/(files|products)\/([^/]+)$/);
    return match ? `${match[1]}/${match[2]}` : parsed.pathname;
  } catch (_) {
    return String(imageUrl || '').split('?')[0];
  }
}

function isSisterJaneProductImageUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (/\.svg$/i.test(parsed.pathname)) return false;
    if (EXCLUDED_IMAGE_PATTERN.test(parsed.pathname)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'cdn.shopify.com') return true;
    return SISTER_JANE_HOSTS.has(host) && parsed.pathname.startsWith('/cdn/shop/');
  } catch (_) {
    return false;
  }
}

function buildSisterJaneImageSources(raw, baseUrl) {
  const base = baseUrl || 'https://sisterjane.com/';
  const productJson = raw.productJson;
  const list = productJson && Array.isArray(productJson.images) && productJson.images.length > 0
    ? productJson.images
    : [productJson && productJson.featured_image].filter(Boolean);

  const seen = new Set();
  const sources = [];
  for (const value of list) {
    const url = toSisterJaneOriginalUrl(value, base);
    if (!isSisterJaneProductImageUrl(url)) continue;
    const canonicalKey = canonicalSisterJaneImageKey(url);
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

async function extractSisterJaneImages(page) {
  const raw = await collectSisterJanePageData(page, page.url());
  return buildSisterJaneImageSources(raw, page.url());
}

module.exports = {
  SISTER_JANE_IMAGE_FAILURE_STATUS,
  isSisterJaneUrl,
  extractSisterJaneProductDetails,
  extractSisterJaneImages,
  // Exported for unit verification without a browser:
  buildSisterJaneProductDetails,
  buildSisterJaneImageSources,
  toSisterJaneOriginalUrl,
  htmlToLines
};
