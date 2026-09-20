const { parseLocalizedNumber } = require('../utils');

const COLLARD_MANSON_HOSTS = new Set(['collardmanson.co.uk', 'www.collardmanson.co.uk']);
const COLLARD_MANSON_IMAGE_FAILURE_STATUS = '要確認：商品画像取得失敗';
const IMAGE_MIN_WIDTH = 400;
const IMAGE_MAX_COUNT = 15;
const CURRENCY_SYMBOL_MAP = { '£': 'GBP', '€': 'EUR', '$': 'USD', '¥': 'JPY' };
const SEASON_PATTERN = /\b((?:FW|SS|AW|PF|AH|PE)\d{2})\b/i;
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

function isCollardMansonUrl(url) {
  try {
    const parsed = new URL(url);
    return COLLARD_MANSON_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Page data collection (browser side). Everything that needs a DOM or the
// page's own origin (the Shopify product JSON fetch) lives here; all parsing
// and decision-making is done in plain Node.js below so it can be verified
// without a browser.
// ---------------------------------------------------------------------------

// Shopify exposes the full product as `/products/{handle}.js` on the same
// origin. It is the most stable source on this site: images (original
// resolution, no size suffix), variants with per-size availability, SKU,
// vendor, and product type. The DOM is still read for what the JSON does not
// carry reliably (currency, the full description block) and as a fallback
// when the JSON cannot be fetched.
async function collectCollardMansonPageData(page, pageUrl) {
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

    const descriptionElement = document.querySelector('.product_section [itemprop="description"], [itemprop="description"]');
    const priceElement = document.querySelector('.product_section [itemprop="price"], [itemprop="price"]');
    const priceCurrencyElement = document.querySelector('[itemprop="priceCurrency"]');

    // The page also renders quick-add forms for related products (each with
    // its own size selector), so size options are read only from THIS
    // product's form: the one matching the product JSON id when available,
    // otherwise the first cart form after the product description.
    const productScope = (descriptionElement && descriptionElement.closest('.product_section')) || document;
    const mainForm = (productJson && document.getElementById(`product-form-${productJson.id}`))
      || productScope.querySelector('form[action*="/cart/add"]');
    const sizeOptions = Array.from(mainForm ? mainForm.querySelectorAll('select.single-option-selector') : [])
      .filter((select) => {
        const group = select.closest('.select') || select.parentElement;
        const label = group ? group.querySelector('label') : null;
        return label && /size|サイズ/i.test(label.textContent || '');
      })
      .flatMap((select) => Array.from(select.options).map((option) => ({
        value: clean(option.value),
        text: clean(option.textContent),
        disabled: option.disabled
      })));

    const galleryImages = Array.from(document.querySelectorAll('.product_image_col [data-zoom], .product_image_col img'))
      .map((element) => element.getAttribute('data-zoom')
        || element.getAttribute('data-src')
        || element.currentSrc
        || element.getAttribute('src')
        || '')
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
        title: text('h1[itemprop="name"]'),
        ogTitle: attr('meta[property="og:title"]', 'content'),
        ogDescription: attr('meta[property="og:description"]', 'content'),
        canonicalUrl: attr('meta[property="og:url"]', 'content') || attr('link[rel="canonical"]', 'href'),
        brand: text('[itemprop="brand"]'),
        currencyItemprop: attr('meta[itemprop="currency"]', 'content'),
        currencyPriceCurrency: priceCurrencyElement
          ? clean(priceCurrencyElement.getAttribute('content')) || clean(priceCurrencyElement.textContent)
          : '',
        currencyMeta: attr('meta[property="og:price:currency"], meta[property="product:price:currency"]', 'content'),
        currencyShopify: (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || '',
        priceContent: priceElement ? clean(priceElement.getAttribute('content')) : '',
        priceText: priceElement ? clean(priceElement.textContent) : '',
        wasPriceFound: Boolean(document.querySelector('.product_section .was_price')),
        wasPriceText: text('.product_section .was_price'),
        availabilityMeta: attr('meta[itemprop="availability"]', 'content'),
        descriptionHtml: descriptionElement ? descriptionElement.innerHTML : '',
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

// Converts a description's HTML into one text line per block/`<br>` segment,
// preserving the order the page shows them in.
function htmlToLines(html) {
  const text = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|tr|table|section)(?:\s[^>]*)?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(text)
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);
}

// The description's own heading (`<h1 class="tw-font-sans-m">LACELESS VINTAGE
// SNEAKS</h1>`) is the product's model name, distinct from the full page title
// that also carries the brand and style code.
function extractDescriptionHeading(html) {
  const match = String(html || '').match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  return match ? htmlToLines(match[1]).join(' ') : '';
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

// ---------------------------------------------------------------------------
// Description parsing
// ---------------------------------------------------------------------------

// Drops a line when the same text is already contained in an earlier line
// (the page repeats its material list once as "MATERIAL:..." and again as a
// bullet list), so the description is complete without duplicated blocks.
function dedupeLines(lines) {
  const kept = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (kept.some((existing) => existing.toLowerCase().includes(lower))) continue;
    kept.push(line);
  }
  return kept;
}

function extractComposition(lines) {
  const startIndex = lines.findIndex((line) => /^materials?\s*[:：]/i.test(line));
  const found = [];
  if (startIndex >= 0) {
    const first = lines[startIndex].replace(/^materials?\s*[:：]\s*/i, '');
    if (first) found.push(first);
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      if (!/\d+\s*%/.test(lines[index])) break;
      found.push(lines[index]);
    }
  } else {
    // No explicit MATERIAL heading: only short, non-sentence lines that carry a
    // percentage (e.g. bullet list rows), never prose that merely mentions one.
    lines
      .filter((line) => /\d+\s*%/.test(line) && line.length <= 80 && !/[.!?]$/.test(line))
      .forEach((line) => found.push(line));
  }
  return Array.from(new Set(found.map(cleanText).filter(Boolean)));
}

function extractSeason(lines, modelName) {
  for (const line of lines) {
    const match = line.match(SEASON_PATTERN);
    if (!match) continue;
    const code = match[1].toUpperCase();
    const before = cleanText(line.slice(0, match.index));
    const afterFull = cleanText(line.slice(match.index + match[0].length));
    // The collection name (e.g. TOWER) sits between the season code and the
    // model name; without the model name there is no reliable end boundary,
    // so it is left out rather than guessed.
    let collection = '';
    if (modelName) {
      const nameIndex = afterFull.toLowerCase().indexOf(modelName.toLowerCase());
      if (nameIndex > 0) collection = cleanText(afterFull.slice(0, nameIndex));
    }
    const lead = before && before.split(/\s+/).length <= 3 ? `${before} ${code}` : code;
    return {
      season: collection ? `${lead} / ${collection}` : lead,
      seasonCode: code
    };
  }
  return { season: '', seasonCode: '' };
}

function parseDescription(html, fallbackText, { sku, modelName: knownModelName } = {}) {
  const lines = htmlToLines(html);
  const usable = lines.length > 0 ? lines : htmlToLines(fallbackText);
  const modelName = extractDescriptionHeading(html) || knownModelName || '';
  const lowerModel = modelName.toLowerCase();

  const colorMatch = usable.map((line) => line.match(/^colou?rs?\s*[:：]\s*(.+)$/i)).find(Boolean);
  let color = colorMatch ? cleanText(colorMatch[1]) : '';
  let colorSource = color ? 'description-color-line' : '';
  if (!color && lowerModel) {
    // Fixed page layout: SKU / model heading / colour / season sentence. Only
    // trusted when the line right after the heading is short and digit-free.
    const headingIndex = usable.findIndex((line) => line.toLowerCase() === lowerModel);
    const candidate = headingIndex >= 0 ? usable[headingIndex + 1] : '';
    if (candidate && candidate.length <= 60 && !/\d/.test(candidate)) {
      color = candidate;
      colorSource = 'description-after-heading';
    }
  }

  const composition = extractComposition(usable);
  const compositionSet = new Set(composition.map((line) => line.toLowerCase()));

  const madeIn = usable.map((line) => line.match(/^made in\s+(.+)$/i)).find(Boolean);
  const countryOfOrigin = madeIn ? titleCase(madeIn[1]) : '';

  const { season, seasonCode } = extractSeason(usable, modelName);

  const isMetadataLine = (line) => {
    const lower = line.toLowerCase();
    return (sku && lower === sku.toLowerCase())
      || (lowerModel && lower === lowerModel)
      || (color && lower === color.toLowerCase())
      || /^colou?rs?\s*[:：]/i.test(line)
      || /^materials?\s*[:：]/i.test(line)
      || compositionSet.has(lower)
      || /^made in\s+/i.test(line)
      || /^style\s+\S+$/i.test(line)
      || /^[A-Z.]{2,8}\s*-\s*\d{6,}$/.test(line)
      // Shipping/duty boilerplate the shop prints inside the description
      // (e.g. "All EU and USA orders are sent DDP - Delivered Duty Paid.",
      // "Customs code: 64039116"). Kept in `description`, not a product feature.
      || /^customs code\s*[:：]/i.test(line)
      || /\b(?:delivered duty paid|orders? (?:are )?sent|free (?:shipping|delivery)|shipping|delivery)\b/i.test(line);
  };

  return {
    lines: usable,
    description: dedupeLines(usable).join('\n'),
    features: dedupeLines(usable.filter((line) => !isMetadataLine(line))),
    modelName,
    color,
    colorSource,
    composition,
    countryOfOrigin,
    season,
    seasonCode
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
        // Several variants share a size when another option (e.g. colour) exists.
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
      const size = cleanText(option.value || option.text);
      if (!size || bySize.has(size)) continue;
      bySize.set(size, {
        size,
        available: !option.disabled && !/sold out|out of stock/i.test(option.text || ''),
        sku: '',
        quantity: null
      });
    }
  }
  return Array.from(bySize.values());
}

function resolveAvailability(sizeVariants, productJson, availabilityMeta) {
  if (sizeVariants.length > 0) {
    const availableCount = sizeVariants.filter((variant) => variant.available).length;
    if (availableCount === 0) return 'out_of_stock';
    return availableCount === sizeVariants.length ? 'in_stock' : 'partially_in_stock';
  }
  if (productJson && typeof productJson.available === 'boolean') {
    return productJson.available ? 'in_stock' : 'out_of_stock';
  }
  const meta = cleanText(availabilityMeta).toLowerCase();
  if (/in_?stock/.test(meta)) return 'in_stock';
  if (/out_?of_?stock|sold_?out/.test(meta)) return 'out_of_stock';
  return '';
}

// ---------------------------------------------------------------------------
// Price / currency
// ---------------------------------------------------------------------------

function jsonLdOfferCurrency(jsonLdNodes) {
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
  for (const offer of offers) {
    const spec = offer.priceSpecification && typeof offer.priceSpecification === 'object' ? offer.priceSpecification : {};
    const code = normalizeCurrencyCode(offer.priceCurrency || spec.priceCurrency);
    if (code) return code;
  }
  return '';
}

// Currency priority: the page's own `itemprop="currency"` meta (what this
// site actually renders), then `itemprop="priceCurrency"`, JSON-LD offers,
// og/product price meta, Shopify's active presentment currency, and finally
// the symbol on the displayed price text.
function resolveCurrency(raw) {
  const dom = raw.dom || {};
  const candidates = [
    ['itemprop-currency', normalizeCurrencyCode(dom.currencyItemprop)],
    ['itemprop-priceCurrency', normalizeCurrencyCode(dom.currencyPriceCurrency)],
    ['json-ld', jsonLdOfferCurrency(raw.jsonLdNodes)],
    ['meta', normalizeCurrencyCode(dom.currencyMeta)],
    ['shopify-currency', normalizeCurrencyCode(dom.currencyShopify)],
    ['price-text-symbol', normalizeCurrencyCode(cleanText(dom.priceText).replace(/[^£€$¥]/g, '')[0] || '')]
  ];
  const found = candidates.find(([, code]) => code);
  return found ? { currency: found[1], source: found[0] } : { currency: '', source: '' };
}

function resolvePrice(raw) {
  const dom = raw.dom || {};
  const productJson = raw.productJson;
  // Shopify's `.js` prices are integer minor units (45900 = 459.00).
  const jsonPrice = productJson && Number.isFinite(productJson.price) && productJson.price > 0
    ? productJson.price / 100
    : null;
  const domAttrPrice = parsePositiveAmount(dom.priceContent);
  const domTextPrice = parsePositiveAmount(dom.priceText);

  let price = null;
  let source = '';
  if (domAttrPrice !== null) {
    price = domAttrPrice;
    source = 'itemprop-price';
  } else if (jsonPrice !== null) {
    price = jsonPrice;
    source = 'product-json';
  } else if (domTextPrice !== null) {
    price = domTextPrice;
    source = 'dom-text';
  }

  const warnings = [];
  if (price !== null && jsonPrice !== null && Math.abs(price - jsonPrice) > 0.005) {
    warnings.push(`Collard Manson price mismatch: page ${price} vs product JSON ${jsonPrice}`);
  }
  return { price, source, warnings };
}

// Sale detection: Shopify's compare-at price (product JSON) or the
// strike-through `.was_price` shown next to the price, in either case higher
// than the current price. `onSale` is null (unknown) only when neither source
// could be read, so callers can tell "not on sale" from "could not check".
function resolveSaleState(raw, price) {
  const dom = raw.dom || {};
  const productJson = raw.productJson;

  const compareValues = [];
  if (productJson) {
    if (Number.isFinite(productJson.compare_at_price)) compareValues.push(productJson.compare_at_price);
    (productJson.variants || []).forEach((variant) => {
      if (Number.isFinite(variant.compare_at_price)) compareValues.push(variant.compare_at_price);
    });
  }
  const compareAtPrice = compareValues.length > 0 ? Math.max(...compareValues) / 100 : null;
  const wasPrice = parsePositiveAmount(dom.wasPriceText);

  if (price !== null) {
    if (compareAtPrice !== null && compareAtPrice > price) {
      return { onSale: true, source: 'product-json-compare-at-price', originalPrice: compareAtPrice };
    }
    if (wasPrice !== null && wasPrice > price) {
      return { onSale: true, source: 'was-price', originalPrice: wasPrice };
    }
  }
  if (productJson || dom.wasPriceFound) return { onSale: false, source: productJson ? 'product-json' : 'was-price-empty', originalPrice: '' };
  return { onSale: null, source: '', originalPrice: '' };
}

// ---------------------------------------------------------------------------
// Product details
// ---------------------------------------------------------------------------

function buildCollardMansonProductDetails(raw, pageUrl) {
  const dom = raw.dom || {};
  const productJson = raw.productJson || null;

  const name = cleanText(dom.title) || cleanText(productJson && productJson.title) || cleanText(dom.ogTitle);
  const brand = cleanText(dom.brand) || cleanText(productJson && productJson.vendor);
  const category = cleanText(productJson && productJson.type);

  const jsonSkus = Array.from(new Set(((productJson && productJson.variants) || [])
    .map((variant) => cleanText(variant.sku))
    .filter(Boolean)));
  // A style code that also opens the description is the product-level code;
  // per-size SKUs (e.g. "ABC123-S") would otherwise make the first variant's
  // SKU misleading.
  const descriptionCode = htmlToLines(dom.descriptionHtml || (productJson && productJson.description))[0] || '';
  let sku = '';
  if (jsonSkus.length === 1) {
    sku = jsonSkus[0];
  } else if (jsonSkus.length > 1) {
    sku = /^[A-Z0-9-]{6,}$/i.test(descriptionCode) && jsonSkus.some((value) => value.toLowerCase().startsWith(descriptionCode.toLowerCase()))
      ? descriptionCode
      : jsonSkus[0];
  } else if (/^[A-Z0-9-]{6,}$/i.test(descriptionCode) && /\d/.test(descriptionCode)) {
    sku = descriptionCode;
  }

  const parsed = parseDescription(
    dom.descriptionHtml || (productJson && productJson.description),
    dom.ogDescription,
    { sku }
  );

  // Colour: the page's COLOR line is authoritative; a single-valued Colour
  // variant option is only a fallback.
  let color = parsed.color;
  let colorSource = parsed.colorSource;
  if (!color && productJson && Array.isArray(productJson.options)) {
    const colorOption = productJson.options.find((option) => /colou?r/i.test(optionName(option)));
    const values = colorOption && Array.isArray(colorOption.values) ? colorOption.values : [];
    if (values.length === 1) {
      color = cleanText(values[0]);
      colorSource = 'variant-option';
    }
  }

  const sizeVariants = buildSizeVariants(productJson, dom.sizeOptions);
  const availability = resolveAvailability(sizeVariants, productJson, dom.availabilityMeta);
  const { price, source: priceSource, warnings: priceWarnings } = resolvePrice(raw);
  const { currency, source: currencySource } = resolveCurrency(raw);
  const sale = resolveSaleState(raw, price);
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
    mpn: '',
    countryOfOrigin: parsed.countryOfOrigin,
    category,
    modelName: parsed.modelName,
    season: parsed.season,
    seasonCode: parsed.seasonCode,
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
    detailSource: 'collard-manson',
    extractionLog: {
      color: { value: color, source: colorSource },
      currency: { value: currency, source: currencySource },
      price: { value: price === null ? '' : price, source: priceSource },
      sale: { value: sale.onSale, source: sale.source }
    },
    warnings: [...priceWarnings]
  };

  if (currency && currency !== 'GBP') {
    result.warnings.push(`Collard Manson page currency is not GBP: ${currency}`);
  }
  if (!productJson) {
    result.warnings.push('Collard Manson product JSON could not be fetched; DOM fallback used');
  }

  for (const field of DETAIL_FIELDS) {
    if (!(field in result)) result[field] = '';
  }
  result.rawBlocks = { description: parsed.lines };
  return result;
}

async function extractCollardMansonProductDetails(page, pageUrl) {
  const raw = await collectCollardMansonPageData(page, pageUrl);
  return buildCollardMansonProductDetails(raw, pageUrl);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

// Shopify serves the same upload at many sizes by appending a suffix to the
// file name (`_medium`, `_1024x1024`, `_110x110@2x`, `_large`, `_grande`,
// `_original`, ...) or, on newer themes, a `width`/`height` query. Removing
// it yields the original upload, i.e. the highest-resolution version.
const SHOPIFY_SIZE_SUFFIX = /_(?:pico|icon|thumb|small|compact|medium|large|grande|original|master|\d+x\d*|\d*x\d+)(?:@\d+x)?(?:_crop_\w+)?(?=\.[a-z0-9]+$)/i;

function toCollardMansonOriginalUrl(imageUrl, baseUrl = 'https://www.collardmanson.co.uk/') {
  try {
    const parsed = new URL(imageUrl, baseUrl);
    parsed.pathname = parsed.pathname.replace(SHOPIFY_SIZE_SUFFIX, '');
    ['width', 'height', 'crop', 'scale'].forEach((param) => parsed.searchParams.delete(param));
    return parsed.href;
  } catch (_) {
    return String(imageUrl || '');
  }
}

// Host- and revision-independent key: `cdn.shopify.com/s/files/1/0209/1992/files/X.jpg`
// and `www.collardmanson.co.uk/cdn/shop/files/X_1024x1024.jpg?v=1` are the same photo.
function canonicalCollardMansonImageKey(imageUrl) {
  try {
    const parsed = new URL(toCollardMansonOriginalUrl(imageUrl));
    // Greedy prefix so the LAST `/files/` wins (the JSON host's path also
    // contains an earlier `/s/files/1/0209/1992/` segment).
    const match = parsed.pathname.match(/^.*\/(files|products)\/([^/]+)$/);
    return match ? `${match[1]}/${match[2]}` : parsed.pathname;
  } catch (_) {
    return String(imageUrl || '').split('?')[0];
  }
}

function isCollardMansonProductImageUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (/\.svg$/i.test(parsed.pathname)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'cdn.shopify.com') return true;
    return COLLARD_MANSON_HOSTS.has(host) && parsed.pathname.startsWith('/cdn/shop/');
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
  return (fromImages.length > 0 ? fromImages : fromMedia)
    .concat(fromImages.length === 0 && fromMedia.length === 0 && productJson.featured_image ? [productJson.featured_image] : [])
    .filter(Boolean);
}

// Product JSON is the primary gallery (exact Shopify order, original files).
// The product-image column of the DOM is used only when the JSON is missing.
// The DOM's displayed URL (e.g. `_1024x1024`) is kept as `sourceUrl` so
// images.js can fall back to it if the original ever fails to download.
function buildCollardMansonImageSources(raw, baseUrl) {
  const domUrls = ((raw.dom && raw.dom.galleryImages) || [])
    .map((url) => new URL(url, baseUrl || 'https://www.collardmanson.co.uk/').href)
    .filter(isCollardMansonProductImageUrl);
  const displayedByKey = new Map();
  domUrls.forEach((url) => {
    const key = canonicalCollardMansonImageKey(url);
    if (!displayedByKey.has(key)) displayedByKey.set(key, url);
  });

  const jsonUrls = productJsonImageUrls(raw.productJson)
    .map((url) => new URL(url, baseUrl || 'https://www.collardmanson.co.uk/').href)
    .filter(isCollardMansonProductImageUrl);
  const ordered = jsonUrls.length > 0 ? jsonUrls : domUrls;

  const seen = new Set();
  const sources = [];
  for (const url of ordered) {
    const canonicalKey = canonicalCollardMansonImageKey(url);
    if (seen.has(canonicalKey)) continue;
    seen.add(canonicalKey);
    const originalUrl = toCollardMansonOriginalUrl(url, baseUrl);
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

async function extractCollardMansonImages(page) {
  const raw = await collectCollardMansonPageData(page, page.url());
  return buildCollardMansonImageSources(raw, page.url());
}

module.exports = {
  COLLARD_MANSON_IMAGE_FAILURE_STATUS,
  isCollardMansonUrl,
  extractCollardMansonProductDetails,
  extractCollardMansonImages,
  // Exported for unit verification without a browser:
  buildCollardMansonProductDetails,
  buildCollardMansonImageSources,
  toCollardMansonOriginalUrl,
  canonicalCollardMansonImageKey,
  htmlToLines,
  parseDescription
};
