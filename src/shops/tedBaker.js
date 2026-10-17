const TED_BAKER_HOSTS = new Set(['tedbaker.com', 'www.tedbaker.com']);
const TED_BAKER_IMAGE_FAILURE_STATUS = '要確認：商品画像取得失敗';
const IMAGE_MIN_WIDTH = 400;
const IMAGE_MAX_COUNT = 15;
// The Shopify `vendor` is the operating company ("New Lobster Limited"), not
// the brand, so the brand is fixed.
const TED_BAKER_BRAND = 'TED BAKER';
// Cost is the UK GBP price. The product JSON is always requested with this
// explicit market: once the page has fully loaded, a site script sets a
// `cart_currency=USD` cookie and the plain `{locale}/products/{handle}.js`
// request then returns 404, while the explicit GB/GBP request keeps working.
// It also keeps the price GBP whatever locale/market the A-column URL selects.
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

function isTedBakerUrl(url) {
  try {
    const parsed = new URL(url);
    return TED_BAKER_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Page data collection (browser side). Shopify's `{locale}/products/{handle}.js`
// is the source of name, price, variants and images; the "Fabric & Care"
// collapsible tab is the only place the composition is given.
// ---------------------------------------------------------------------------

async function collectTedBakerPageData(page, pageUrl) {
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

    const productPathFrom = (value) => {
      try {
        const match = new URL(value, location.href).pathname.match(/^((?:\/[a-z]{2}(?:-[a-z]{2})?)?)\/products\/([^/?#]+)/i);
        return match ? { prefix: match[1], handle: decodeURIComponent(match[2]) } : null;
      } catch (_) {
        return null;
      }
    };
    const productPath = productPathFrom(location.href) || productPathFrom(fallbackUrl);

    let productJson = null;
    if (productPath) {
      try {
        const query = new URLSearchParams(market).toString();
        const response = await fetch(`${productPath.prefix}/products/${encodeURIComponent(productPath.handle)}.js?${query}`, { credentials: 'same-origin' });
        if (response.ok) productJson = await response.json();
      } catch (_) {
        productJson = null;
      }
    }

    const tabs = Array.from(document.querySelectorAll('collapsible-section, .wt-collapse')).map((section) => {
      const title = section.querySelector('.wt-collapse__trigger__title');
      const content = section.querySelector('.wt-collapse__target__content');
      return {
        title: title ? clean(title.textContent) : '',
        html: content ? content.innerHTML : ''
      };
    }).filter((tab) => tab.title && tab.html);

    return {
      productJson,
      tabs,
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

function listItems(html) {
  const items = [];
  const pattern = /<li(?:\s[^>]*)?>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = pattern.exec(String(html || ''))) !== null) {
    const value = cleanText(decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ' ')));
    if (value) items.push(value);
  }
  return items;
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

function buildSizeVariants(productJson) {
  const variants = productJson && Array.isArray(productJson.variants) ? productJson.variants : [];
  const sizeIndex = optionIndex(productJson, /size|サイズ/i);
  if (sizeIndex < 0) return [];

  const bySize = new Map();
  for (const variant of variants) {
    const size = variantOption(variant, sizeIndex);
    if (!size) continue;
    const available = variant.available === true;
    const existing = bySize.get(size);
    if (existing) {
      existing.available = existing.available || available;
      continue;
    }
    // Variant SKUs on this shop are EAN barcodes, kept per size only.
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

// Each product handle is one colour (`viviin-black`), so the COLOR option has a
// single value; it is used only when every variant agrees.
function resolveColor(productJson) {
  const variants = productJson && Array.isArray(productJson.variants) ? productJson.variants : [];
  const colorIndex = optionIndex(productJson, /colou?r|カラー/i);
  const colors = new Set(variants.map((variant) => variantOption(variant, colorIndex)).filter(Boolean));
  return colors.size === 1 ? Array.from(colors)[0] : '';
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

// Full-price products carry `compare_at_price` equal to `price`, so only a
// strictly higher compare-at price means a sale.
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

// "Fabric & Care" content is `Shell: 100% Polyurethane; Shell Lining: 100%
// Polyester<br><br><span>no wash no iron no dry clean</span>`: the first line is
// the composition, the rest is care text.
function resolveComposition(tabs) {
  const tab = (tabs || []).find((item) => /fabric|composition|material/i.test(item.title));
  if (!tab) return { composition: '', care: [] };
  const lines = htmlToLines(tab.html);
  const compositionIndex = lines.findIndex((line) => /\d+\s*%/.test(line));
  if (compositionIndex < 0) return { composition: '', care: lines };
  return {
    composition: lines[compositionIndex],
    care: lines.filter((_, index) => index !== compositionIndex)
  };
}

function resolveDimensions(lines) {
  const line = lines.find((item) => /^dimensions?\s*:/i.test(item));
  return line ? cleanText(line.replace(/^dimensions?\s*:/i, '')) : '';
}

// ---------------------------------------------------------------------------
// Product details
// ---------------------------------------------------------------------------

function buildTedBakerProductDetails(raw, pageUrl) {
  const dom = raw.dom || {};
  const productJson = raw.productJson || null;
  const warnings = [];

  const name = cleanText(productJson && productJson.title) || cleanText(dom.title) || cleanText(dom.ogTitle);
  const tags = productJson && Array.isArray(productJson.tags) ? productJson.tags.map(cleanText) : [];
  const category = cleanText(productJson && productJson.type);

  const descriptionHtml = productJson ? productJson.description : '';
  const descriptionLines = htmlToLines(descriptionHtml).length > 0
    ? htmlToLines(descriptionHtml)
    : htmlToLines(dom.ogDescription);
  const features = listItems(descriptionHtml);
  const dimensions = resolveDimensions(features.length > 0 ? features : descriptionLines);
  const { composition, care } = resolveComposition(raw.tabs);

  const sizeVariants = buildSizeVariants(productJson);
  const availability = resolveAvailability(sizeVariants, productJson);
  const color = resolveColor(productJson);

  const price = productJson && Number.isFinite(productJson.price) && productJson.price > 0
    ? productJson.price / 100
    : null;
  const currency = price === null ? '' : PRICE_MARKET.currency;
  const priceSource = price === null ? '' : `product-json-${PRICE_MARKET.country}`;
  const sale = resolveSaleState(productJson, price);

  // The page shows no style/product code; variant SKUs are EAN barcodes, so the
  // product code is left empty rather than filled with a barcode.
  const result = {
    name,
    brand: TED_BAKER_BRAND,
    price: price === null ? '' : price,
    currency,
    color,
    description: descriptionLines.join('\n'),
    features: features.length > 0 ? features : descriptionLines,
    composition,
    material: composition,
    care: care.join('\n'),
    dimensions,
    weight: '',
    productCode: '',
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
    detailSource: 'ted-baker',
    extractionLog: {
      color: { value: color, source: color ? 'product-json-option' : '' },
      composition: { value: composition, source: composition ? 'fabric-care-tab' : '' },
      currency: { value: currency, source: priceSource },
      price: { value: price === null ? '' : price, source: priceSource },
      sale: { value: sale.onSale, source: sale.source }
    },
    warnings
  };

  if (!productJson) {
    warnings.push('Ted Baker product JSON could not be fetched; price left empty');
  }

  for (const field of DETAIL_FIELDS) {
    if (!(field in result)) result[field] = '';
  }
  result.rawBlocks = { description: descriptionLines, tags };
  return result;
}

async function extractTedBakerProductDetails(page, pageUrl) {
  const raw = await collectTedBakerPageData(page, pageUrl);
  return buildTedBakerProductDetails(raw, pageUrl);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

// Only the product JSON's `images` array is used: it is exactly this product's
// gallery in Shopify order. The page's JSON-LD/og image lists only the first
// photo (in several URL variants), and the page renders other products'
// images, so there is no DOM fallback.
const SHOPIFY_SIZE_SUFFIX = /_(?:pico|icon|thumb|small|compact|medium|large|grande|original|master|\d+x\d*|\d*x\d+)(?:@\d+x)?(?:_crop_\w+)?(?=\.[a-z0-9]+$)/i;

function toTedBakerOriginalUrl(imageUrl, baseUrl = 'https://www.tedbaker.com/') {
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

function canonicalTedBakerImageKey(imageUrl) {
  try {
    const parsed = new URL(toTedBakerOriginalUrl(imageUrl));
    const match = parsed.pathname.match(/^.*\/(files|products)\/([^/]+)$/);
    return match ? `${match[1]}/${match[2]}` : parsed.pathname;
  } catch (_) {
    return String(imageUrl || '').split('?')[0];
  }
}

function isTedBakerProductImageUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (/\.svg$/i.test(parsed.pathname)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'cdn.shopify.com') return true;
    return TED_BAKER_HOSTS.has(host) && parsed.pathname.startsWith('/cdn/shop/');
  } catch (_) {
    return false;
  }
}

function buildTedBakerImageSources(raw, baseUrl) {
  const base = baseUrl || 'https://www.tedbaker.com/';
  const productJson = raw.productJson;
  const list = productJson && Array.isArray(productJson.images) && productJson.images.length > 0
    ? productJson.images
    : [productJson && productJson.featured_image].filter(Boolean);

  const seen = new Set();
  const sources = [];
  for (const value of list) {
    const url = toTedBakerOriginalUrl(value, base);
    if (!isTedBakerProductImageUrl(url)) continue;
    const canonicalKey = canonicalTedBakerImageKey(url);
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

async function extractTedBakerImages(page) {
  const raw = await collectTedBakerPageData(page, page.url());
  return buildTedBakerImageSources(raw, page.url());
}

module.exports = {
  TED_BAKER_IMAGE_FAILURE_STATUS,
  isTedBakerUrl,
  extractTedBakerProductDetails,
  extractTedBakerImages,
  // Exported for unit verification without a browser:
  buildTedBakerProductDetails,
  buildTedBakerImageSources,
  toTedBakerOriginalUrl,
  htmlToLines
};
