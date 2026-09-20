const { parseLocalizedNumber } = require('../utils');

const LAB_STORE_WORLD_HOSTS = new Set(['labstoreworld.com', 'www.labstoreworld.com']);
const LAB_STORE_WORLD_IMAGE_FAILURE_STATUS = '要確認：商品画像取得失敗';
const IMAGE_MIN_WIDTH = 400;
const IMAGE_MAX_COUNT = 15;
const CURRENCY_SYMBOL_MAP = { '£': 'GBP', '€': 'EUR', '$': 'USD', '¥': 'JPY' };
const SEASON_TAG_PATTERN = /^(?:AW|FW|SS|PF|AH|PE)\d{2}$/i;
const SEASON_TEXT_PATTERN = /\b((?:AW|FW|SS|PF|AH|PE)\d{2})\b/i;
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

function isLabStoreWorldUrl(url) {
  try {
    const parsed = new URL(url);
    return LAB_STORE_WORLD_HOSTS.has(parsed.hostname.toLowerCase());
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
// resolution), variants with per-size availability, SKU, vendor, type, tags,
// compare-at price, and the description HTML. JSON-LD (ProductGroup) and the
// DOM are the fallbacks and supply currency.
// ---------------------------------------------------------------------------

async function collectLabStoreWorldPageData(page, pageUrl) {
  return page.evaluate(async (fallbackUrl) => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const attr = (selector, name) => {
      const element = document.querySelector(selector);
      return element ? clean(element.getAttribute(name)) : '';
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

    const jsonLdNodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((script) => {
        try {
          return JSON.parse(script.textContent);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .flatMap((item) => Array.isArray(item) ? item : (Array.isArray(item['@graph']) ? item['@graph'] : [item]))
      .filter((item) => {
        const type = item && item['@type'];
        const types = Array.isArray(type) ? type : [type];
        return types.includes('Product') || types.includes('ProductGroup');
      });

    // Size options come from this product's own variant picker (the page has one
    // picker; related-product cards do not render size radios).
    const sizeOptions = Array.from(document.querySelectorAll('variant-picker input[type="radio"][name^="Size"]'))
      .map((input) => ({
        value: clean(input.getAttribute('value')),
        available: input.getAttribute('data-option-available') !== 'false' && !input.disabled
      }));

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
    // Only the main product's gallery; related products live outside it.
    const galleryImages = Array.from(document.querySelectorAll('media-gallery img'))
      .map((img) => largestFromSrcset(img.getAttribute('srcset')) || img.currentSrc || img.getAttribute('src') || '')
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
      jsonLdNodes,
      dom: {
        title: clean((document.querySelector('h1') || {}).textContent),
        ogTitle: attr('meta[property="og:title"]', 'content'),
        ogDescription: attr('meta[property="og:description"]', 'content'),
        canonicalUrl: attr('meta[property="og:url"]', 'content') || attr('link[rel="canonical"]', 'href'),
        ogPriceAmount: attr('meta[property="og:price:amount"], meta[property="product:price:amount"]', 'content'),
        ogPriceCurrency: attr('meta[property="og:price:currency"], meta[property="product:price:currency"]', 'content'),
        currencyShopify: (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || '',
        sizeOptions,
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

// One text line per block / `<br>` segment / newline, in page order. Plain text
// (JSON-LD's description, which uses "\n") passes through the same function.
function htmlToLines(html) {
  const text = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br(?:\s[^>]*)?\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|tr|table|section)(?:\s[^>]*)?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(text)
    .split(/\n+/)
    .map(cleanText)
    // Some descriptions are written as "* color: pearl" bullet lines.
    .map((line) => line.replace(/^[*•・]\s*/, ''))
    .filter(Boolean);
}

function titleCase(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase());
}

function normalizeCurrencyCode(value) {
  const text = cleanText(value);
  if (!text) return '';
  if (/^[A-Za-z]{3}$/.test(text)) return text.toUpperCase();
  if (CURRENCY_SYMBOL_MAP[text[0]]) return CURRENCY_SYMBOL_MAP[text[0]];
  return '';
}

function parsePositiveAmount(value) {
  const numeric = String(value === undefined || value === null ? '' : value).replace(/[^0-9.,]/g, '');
  const amount = parseLocalizedNumber(numeric);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function optionName(option) {
  return cleanText(typeof option === 'string' ? option : option && option.name);
}

// ---------------------------------------------------------------------------
// Description parsing
// ---------------------------------------------------------------------------

// The page writes the composition on one line with " - " separators and no space
// after the percent sign:
//   Composition: Upper 100%Calf Leather- Lining 100%Calf Leather- ... Sole 100%E.V.A-
// A hyphen only separates parts when it is followed by whitespace + a letter (or
// ends the line), so hyphens inside a word ("Ultra-Light") are kept.
function splitComposition(text) {
  return String(text || '')
    .split(/\s*-\s+(?=[A-Za-z])|\s*-\s*$/)
    .map((part) => cleanText(part).replace(/(\d)\s*%\s*(?=\S)/g, '$1% '))
    .filter(Boolean);
}

// Returns the composition parts and the description lines they came from (those
// lines are metadata, not product features).
function extractComposition(lines) {
  const labelled = lines.map((line) => line.match(/^compositions?\s*[:：]\s*(.*)$/i)).find(Boolean);
  if (labelled && cleanText(labelled[1])) {
    return { parts: splitComposition(labelled[1]), sourceLines: [labelled[0]] };
  }
  // No "Composition:" label: only short, non-sentence lines that carry a percentage
  // (e.g. "material: upper 100% cow real fur", "lining: 100% cow leather"). A leading
  // "material:" is dropped and "label: N%" becomes "Label N%".
  const sourceLines = lines.filter((line) => /\d+\s*%/.test(line) && line.length <= 80 && !/[.!?]$/.test(line));
  const parts = sourceLines
    .map((line) => line.replace(/^materials?\s*[:：]\s*/i, '').replace(/^([A-Za-z][A-Za-z ]*?)\s*[:：]\s*(?=\d)/, '$1 '))
    .flatMap(splitComposition)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return { parts, sourceLines };
}

function labelledValue(lines, labelPattern) {
  const match = lines.map((line) => line.match(new RegExp(`^${labelPattern}\\s*[:：]\\s*(.+)$`, 'i'))).find(Boolean);
  return match ? cleanText(match[1]) : '';
}

function findSeason(tags, lines) {
  const tag = (Array.isArray(tags) ? tags : [])
    .map(cleanText)
    .find((value) => SEASON_TAG_PATTERN.test(value));
  if (tag) return { season: tag.toUpperCase(), source: 'tag' };
  for (const line of lines) {
    const match = line.match(SEASON_TEXT_PATTERN);
    if (match) return { season: match[1].toUpperCase(), source: 'description' };
  }
  return { season: '', source: '' };
}

function parseDescription(lines, { brand, tags, sku } = {}) {
  const { parts: composition, sourceLines: compositionSourceLines } = extractComposition(lines);
  const compositionSet = new Set([...composition, ...compositionSourceLines].map((line) => line.toLowerCase()));

  const madeIn = lines.map((line) => line.match(/^made in\s+(.+)$/i)).find(Boolean);
  const countryOfOrigin = madeIn ? titleCase(madeIn[1]) : '';
  const designerId = labelledValue(lines, 'designer\\s*id');
  const descriptionSku = labelledValue(lines, 'sku');
  const color = labelledValue(lines, 'colou?rs?');
  const { season, source: seasonSource } = findSeason(tags, lines);

  const lowerBrand = cleanText(brand).toLowerCase();
  const isMetadataLine = (line) => {
    const lower = line.toLowerCase();
    return /^compositions?\s*[:：]/i.test(line)
      || /^made in\s+/i.test(line)
      || /^sku\s*[:：]/i.test(line)
      || /^designer\s*id\s*[:：]/i.test(line)
      || /^colou?rs?\s*[:：]/i.test(line)
      || (sku && lower === sku.toLowerCase())
      || compositionSet.has(lower)
      // Intro sentence that only restates the product and brand ("Naska Bogun from
      // Rick Owens."): not a product feature.
      || (lowerBrand && new RegExp(`^.+\\s+from\\s+${lowerBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.?$`, 'i').test(line))
      // Shipping/duty boilerplate, if a page prints it inside the description.
      || /\b(?:delivered duty paid|orders? (?:are )?sent|free (?:shipping|delivery))\b/i.test(line);
  };

  return {
    description: lines.join('\n'),
    features: lines.filter((line) => !isMetadataLine(line)),
    composition,
    countryOfOrigin,
    madeInText: madeIn ? cleanText(madeIn[0]) : '',
    designerId,
    descriptionSku,
    color,
    season,
    seasonSource
  };
}

// ---------------------------------------------------------------------------
// Sizes / availability / sale
// ---------------------------------------------------------------------------

function buildSizeVariants(productJson, domSizeOptions) {
  const variants = productJson && Array.isArray(productJson.variants) ? productJson.variants : [];
  const options = productJson && Array.isArray(productJson.options) ? productJson.options : [];
  let sizeIndex = options.findIndex((option) => /size|サイズ/i.test(optionName(option)));
  // Some products name their only option "Title" while its values are the sizes
  // ("37 EU", "38 EU", ...). Shopify's placeholder for a single-variant product is
  // "Default Title"; that is not a size.
  if (sizeIndex < 0 && options.length === 1 && /^title$/i.test(optionName(options[0]))) {
    const values = Array.isArray(options[0].values) ? options[0].values.map(cleanText) : [];
    if (values.length > 0 && !values.every((value) => /^default title$/i.test(value))) sizeIndex = 0;
  }

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
        quantity: Number.isFinite(variant.inventory_quantity) ? variant.inventory_quantity : null
      });
    }
  } else if (Array.isArray(domSizeOptions)) {
    for (const option of domSizeOptions) {
      const size = cleanText(option.value);
      if (!size || bySize.has(size)) continue;
      bySize.set(size, { size, available: option.available !== false, sku: '', quantity: null });
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

// `onSale` is null (unknown) unless the product JSON could be read: this site's
// DOM also prints compare-at prices for related products, so it is not used.
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

function jsonLdOffers(jsonLdNodes) {
  const offers = [];
  const addOffers = (value) => {
    (Array.isArray(value) ? value : [value]).forEach((offer) => {
      if (offer && typeof offer === 'object') offers.push(offer);
    });
  };
  (jsonLdNodes || []).forEach((node) => {
    if (!node) return;
    if (node.offers) addOffers(node.offers);
    if (Array.isArray(node.hasVariant)) node.hasVariant.forEach((variant) => variant && variant.offers && addOffers(variant.offers));
  });
  return offers;
}

// Currency: JSON-LD offers, og/product price meta, then Shopify's active
// presentment currency (the product JSON carries no currency).
function resolveCurrency(raw) {
  const dom = raw.dom || {};
  const offerCode = jsonLdOffers(raw.jsonLdNodes)
    .map((offer) => normalizeCurrencyCode(offer.priceCurrency))
    .find(Boolean) || '';
  const candidates = [
    ['json-ld', offerCode],
    ['meta', normalizeCurrencyCode(dom.ogPriceCurrency)],
    ['shopify-currency', normalizeCurrencyCode(dom.currencyShopify)]
  ];
  const found = candidates.find(([, code]) => code);
  return found ? { currency: found[1], source: found[0] } : { currency: '', source: '' };
}

// Price: product JSON (integer minor units, 204000 = 2040.00), then og price
// meta, then JSON-LD offers. A disagreement between sources adds a warning.
function resolvePrice(raw) {
  const dom = raw.dom || {};
  const productJson = raw.productJson;
  const jsonPrice = productJson && Number.isFinite(productJson.price) && productJson.price > 0
    ? productJson.price / 100
    : null;
  const metaPrice = parsePositiveAmount(dom.ogPriceAmount);
  const offerPrice = jsonLdOffers(raw.jsonLdNodes)
    .map((offer) => parsePositiveAmount(offer.price))
    .find((value) => value !== null) ?? null;

  let price = null;
  let source = '';
  if (jsonPrice !== null) {
    price = jsonPrice;
    source = 'product-json';
  } else if (metaPrice !== null) {
    price = metaPrice;
    source = 'meta';
  } else if (offerPrice !== null) {
    price = offerPrice;
    source = 'json-ld';
  }

  const warnings = [];
  const others = [['og meta', metaPrice], ['JSON-LD', offerPrice]]
    .filter(([, value]) => value !== null && price !== null && Math.abs(value - price) > 0.005);
  others.forEach(([label, value]) => warnings.push(`Lab Store World price mismatch: ${source} ${price} vs ${label} ${value}`));
  return { price, source, warnings };
}

// ---------------------------------------------------------------------------
// Product details
// ---------------------------------------------------------------------------

function firstJsonLdProduct(jsonLdNodes) {
  return (jsonLdNodes || []).find((node) => node && node['@type'] && [].concat(node['@type']).some((t) => t === 'ProductGroup' || t === 'Product')) || {};
}

function jsonLdText(value) {
  if (!value) return '';
  if (typeof value === 'string') return cleanText(value);
  return cleanText(value.name);
}

function buildLabStoreWorldProductDetails(raw, pageUrl) {
  const dom = raw.dom || {};
  const productJson = raw.productJson || null;
  const jsonLd = firstJsonLdProduct(raw.jsonLdNodes);

  const name = cleanText(dom.title) || cleanText(productJson && productJson.title) || cleanText(dom.ogTitle);
  const brand = jsonLdText(jsonLd.brand) || cleanText(productJson && productJson.vendor);
  const category = cleanText(jsonLd.category) || cleanText(productJson && productJson.type);
  const tags = productJson && Array.isArray(productJson.tags) ? productJson.tags : [];

  // Description lines, in page order: the product JSON's HTML first, then
  // JSON-LD's plain text (it keeps "\n" between lines), then og:description.
  const descriptionLines = htmlToLines(productJson && productJson.description).length > 0
    ? htmlToLines(productJson.description)
    : (htmlToLines(jsonLd.description).length > 0 ? htmlToLines(jsonLd.description) : htmlToLines(dom.ogDescription));

  const jsonSkus = Array.from(new Set(((productJson && productJson.variants) || [])
    .map((variant) => cleanText(variant.sku))
    .filter(Boolean)));
  const parsed = parseDescription(descriptionLines, { brand, tags });
  const sku = jsonSkus.length === 1 ? jsonSkus[0] : (parsed.descriptionSku || jsonSkus[0] || '');

  // Colour only from an explicit source (a `Color:` description line, or a
  // single-valued Colour variant option). The product name is never used.
  let color = parsed.color;
  let colorSource = color ? 'description-color-line' : '';
  if (!color && productJson && Array.isArray(productJson.options)) {
    const colorOption = productJson.options.find((option) => /colou?r/i.test(optionName(option)));
    const values = colorOption && Array.isArray(colorOption.values) ? colorOption.values : [];
    if (values.length === 1) {
      color = cleanText(values[0]);
      colorSource = 'variant-option';
    }
  }

  const sizeVariants = buildSizeVariants(productJson, dom.sizeOptions);
  const availability = resolveAvailability(sizeVariants, productJson);
  const { price, source: priceSource, warnings: priceWarnings } = resolvePrice(raw);
  const { currency, source: currencySource } = resolveCurrency(raw);
  const sale = resolveSaleState(productJson, price);
  const compositionText = parsed.composition.join('\n');

  const result = {
    name,
    brand,
    price: price === null ? '' : price,
    currency,
    color,
    description: parsed.description || cleanText(dom.ogDescription),
    features: parsed.features,
    composition: compositionText,
    material: compositionText,
    dimensions: '',
    weight: '',
    productCode: sku,
    sku,
    mpn: parsed.designerId,
    designerId: parsed.designerId,
    countryOfOrigin: parsed.countryOfOrigin,
    madeIn: parsed.madeInText,
    category,
    season: parsed.season,
    seasonCode: parsed.season,
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
    detailSource: 'lab-store-world',
    extractionLog: {
      color: { value: color, source: colorSource },
      currency: { value: currency, source: currencySource },
      price: { value: price === null ? '' : price, source: priceSource },
      season: { value: parsed.season, source: parsed.seasonSource },
      sale: { value: sale.onSale, source: sale.source }
    },
    warnings: [...priceWarnings]
  };

  if (currency && currency !== 'GBP') {
    result.warnings.push(`Lab Store World page currency is not GBP: ${currency}`);
  }
  if (!productJson) {
    result.warnings.push('Lab Store World product JSON could not be fetched; DOM/JSON-LD fallback used');
  }

  for (const field of DETAIL_FIELDS) {
    if (!(field in result)) result[field] = '';
  }
  result.rawBlocks = { description: descriptionLines, tags };
  return result;
}

async function extractLabStoreWorldProductDetails(page, pageUrl) {
  const raw = await collectLabStoreWorldPageData(page, pageUrl);
  return buildLabStoreWorldProductDetails(raw, pageUrl);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

// Shopify serves one upload at many sizes: a `_WxH`/`_medium`/... file-name
// suffix on older themes, a `width`/`height` query on newer ones (this site, e.g.
// `?v=1&width=1920`). Removing them yields the original upload. The same photo
// also appears as http:// and https:// and on two hosts, so identity is decided
// by the canonical key below, not by the URL string.
const SHOPIFY_SIZE_SUFFIX = /_(?:pico|icon|thumb|small|compact|medium|large|grande|original|master|\d+x\d*|\d*x\d+)(?:@\d+x)?(?:_crop_\w+)?(?=\.[a-z0-9]+$)/i;

function toLabStoreWorldOriginalUrl(imageUrl, baseUrl = 'https://labstoreworld.com/') {
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
function canonicalLabStoreWorldImageKey(imageUrl) {
  try {
    const parsed = new URL(toLabStoreWorldOriginalUrl(imageUrl));
    const match = parsed.pathname.match(/^.*\/(files|products)\/([^/]+)$/);
    return match ? `${match[1]}/${match[2]}` : parsed.pathname;
  } catch (_) {
    return String(imageUrl || '').split('?')[0];
  }
}

function isLabStoreWorldProductImageUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (/\.svg$/i.test(parsed.pathname)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'cdn.shopify.com') return true;
    return LAB_STORE_WORLD_HOSTS.has(host) && parsed.pathname.startsWith('/cdn/shop/');
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
// files). The `media-gallery` element is used only when the JSON is missing, and
// its displayed URL is kept as `sourceUrl` so images.js can fall back to it if an
// original ever fails to download. There is no `document.images` fallback.
function buildLabStoreWorldImageSources(raw, baseUrl) {
  const base = baseUrl || 'https://labstoreworld.com/';
  const domUrls = ((raw.dom && raw.dom.galleryImages) || [])
    .map((url) => new URL(url, base).href)
    .filter(isLabStoreWorldProductImageUrl);
  const displayedByKey = new Map();
  domUrls.forEach((url) => {
    const key = canonicalLabStoreWorldImageKey(url);
    if (!displayedByKey.has(key)) displayedByKey.set(key, url);
  });

  const jsonUrls = productJsonImageUrls(raw.productJson)
    .map((url) => new URL(url, base).href)
    .filter(isLabStoreWorldProductImageUrl);
  const ordered = jsonUrls.length > 0 ? jsonUrls : domUrls;

  const seen = new Set();
  const sources = [];
  for (const url of ordered) {
    const canonicalKey = canonicalLabStoreWorldImageKey(url);
    if (seen.has(canonicalKey)) continue;
    seen.add(canonicalKey);
    const originalUrl = toLabStoreWorldOriginalUrl(url, base);
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

async function extractLabStoreWorldImages(page) {
  const raw = await collectLabStoreWorldPageData(page, page.url());
  return buildLabStoreWorldImageSources(raw, page.url());
}

module.exports = {
  LAB_STORE_WORLD_IMAGE_FAILURE_STATUS,
  isLabStoreWorldUrl,
  extractLabStoreWorldProductDetails,
  extractLabStoreWorldImages,
  // Exported for unit verification without a browser:
  buildLabStoreWorldProductDetails,
  buildLabStoreWorldImageSources,
  toLabStoreWorldOriginalUrl,
  canonicalLabStoreWorldImageKey,
  htmlToLines,
  splitComposition,
  parseDescription
};
