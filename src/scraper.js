const { chromium } = require('playwright');
const config = require('./config');
const { uniq, parseLocalizedNumber } = require('./utils');
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
const {
  isCollardMansonUrl,
  extractCollardMansonProductDetails,
  extractCollardMansonImages,
  COLLARD_MANSON_IMAGE_FAILURE_STATUS
} = require('./shops/collardManson');
const {
  isLabStoreWorldUrl,
  extractLabStoreWorldProductDetails,
  extractLabStoreWorldImages,
  LAB_STORE_WORLD_IMAGE_FAILURE_STATUS
} = require('./shops/labStoreWorld');

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
  if (isCollardMansonUrl(url)) {
    const shopProductDetails = await extractCollardMansonProductDetails(page, url);
    const shopImageSources = await extractCollardMansonImages(page);
    if (shopProductDetails && shopProductDetails.extractionLog && shopProductDetails.extractionLog.color) {
      const colorLog = shopProductDetails.extractionLog.color;
      console.log(`Collard Manson色取得: ${colorLog.value || '未取得'} (${colorLog.source || '取得元なし'})`);
    }
    return {
      ...shopProductDetails,
      status: shopImageSources.length > 0 ? '' : COLLARD_MANSON_IMAGE_FAILURE_STATUS,
      imageUrls: shopImageSources.map((image) => image.url),
      imageSources: shopImageSources
    };
  }
  if (isLabStoreWorldUrl(url)) {
    const shopProductDetails = await extractLabStoreWorldProductDetails(page, url);
    const shopImageSources = await extractLabStoreWorldImages(page);
    if (shopProductDetails && shopProductDetails.extractionLog && shopProductDetails.extractionLog.color) {
      const colorLog = shopProductDetails.extractionLog.color;
      console.log(`Lab Store World色取得: ${colorLog.value || '未取得'} (${colorLog.source || '取得元なし'})`);
    }
    return {
      ...shopProductDetails,
      status: shopImageSources.length > 0 ? '' : LAB_STORE_WORLD_IMAGE_FAILURE_STATUS,
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
    const metaAttr = (selectors, attr) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const value = clean(element && element.getAttribute(attr));
        if (value) return value;
      }
      return '';
    };
    const itemPropText = (prop) => {
      const element = document.querySelector(`[itemprop="${prop}"]`);
      if (!element) return '';
      const content = clean(element.getAttribute('content'));
      if (content) return content;
      return clean(element.textContent);
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
    // Priority-ordered: the most specific/reliable container first
    // (.product-price-container is a Shopify pattern seen on minoxboutique.co.uk),
    // generic price classes last. Only the FIRST selector with any match is used,
    // so a specific match is never overruled by a generic one lower in the list.
    // Scans every matching element for that selector (not just the first) so an
    // empty/placeholder node doesn't block a later one with the same class.
    const PRICE_TEXT_PATTERN = /[£€$¥]\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:GBP|EUR|USD|JPY)\b/i;
    const priceLikeText = (selectors) => {
      for (const selector of selectors) {
        for (const element of Array.from(document.querySelectorAll(selector))) {
          const text = clean(element && element.textContent);
          const match = text.match(PRICE_TEXT_PATTERN);
          if (match) return match[0];
        }
      }
      return '';
    };

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
        if (!item) return false;
        const type = item['@type'];
        const types = Array.isArray(type) ? type : [type];
        return types.includes('Product') || types.includes('ProductGroup');
      });

    return {
      jsonLdNodes,
      nameFallback: textBySelector(['h1', '[class*="product"][class*="name"]', '[class*="item"][class*="name"]']) || meta(['meta[property="og:title"]', 'meta[name="twitter:title"]']),
      ogDescription: meta(['meta[property="og:description"]']),
      metaDescription: meta(['meta[name="description"]']),
      domDescriptionFallback: textBySelector(['[class*="description"]', '[class*="detail"]']),
      labeledBrand: labeledText(['ブランド', 'Brand', 'brand']),
      metaBrand: meta(['meta[property="product:brand"]']),
      labeledColor: labeledText(['カラー', '色', 'Color', 'color']),
      labeledMaterial: labeledText(['素材', 'Material', 'material']),
      labeledCategory: labeledText(['カテゴリ', 'カテゴリー', 'Category', 'category']),
      metaCategory: meta(['meta[property="product:category"]']),
      priceMeta: {
        metaAmount: metaAttr(['meta[property="og:price:amount"]', 'meta[property="product:price:amount"]'], 'content'),
        metaCurrency: metaAttr(['meta[property="og:price:currency"]', 'meta[property="product:price:currency"]'], 'content'),
        itemPropAmount: itemPropText('price'),
        itemPropCurrency: itemPropText('priceCurrency')
      },
      priceDomText: priceLikeText([
        '.product-price-container',
        '[itemprop="price"]',
        '.product-price',
        '.price__current',
        '.current-price',
        '.product-detail__price',
        '.price'
      ])
    };
  }).then((data) => {
    const resolved = resolveGenericProductFields(data);
    const imageUrls = shopImageSources.map((image) => image.url);
    const mergedData = shopProductDetails
      ? mergeScrapedData(resolved, shopProductDetails)
      : resolved;

    return {
      ...mergedData,
      imageUrls,
      imageSources: shopImageSources
    };
  });
}

// Below this amount, a parsed price is almost certainly a misread (a decimal
// point mistaken for a thousands separator, a "from £X" teaser figure, etc.)
// rather than a genuine product cost — same reasoning and threshold as
// MANUAL_COST_MIN_PLAUSIBLE_AMOUNT in src/index.js's parseManualCost().
const GENERIC_PRICE_MIN_PLAUSIBLE_AMOUNT = 5;
const GENERIC_DOM_PRICE_WARNING = '要確認：価格をページ表示から取得しました。金額を確認してください';
const CURRENCY_SYMBOL_MAP = { '£': 'GBP', '€': 'EUR', '$': 'USD', '¥': 'JPY' };

function cleanText(value) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
}

function normalizeTypes(type) {
  if (!type) return [];
  return Array.isArray(type) ? type : [type];
}

// Reads a JSON-LD value that may be a plain string/number, an array of
// either, or a Thing-like object ({ name: "..." }) — e.g. Product.brand is
// commonly { "@type": "Brand", "name": "Moncler" } rather than a bare string.
function jsonLdString(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return cleanText(value);
  if (Array.isArray(value)) return value.map(jsonLdString).find(Boolean) || '';
  if (typeof value === 'object') return cleanText(value.name || value['@id'] || '');
  return '';
}

// Builds one candidate per Product-like JSON-LD node: a standalone Product
// (or a ProductGroup with no variants, e.g. before hasVariant is checked) is
// its own candidate with no group; a ProductGroup with hasVariant (Shopify's
// multi-colour/size pattern) additionally contributes one candidate per
// variant, paired with its parent group so shared fields (description,
// brand, category) can fall back to the group when the variant lacks them.
function buildJsonLdCandidates(jsonLdNodes) {
  const candidates = [];
  (jsonLdNodes || []).forEach((node, nodeIndex) => {
    if (!node) return;
    const types = normalizeTypes(node['@type']);
    if (types.includes('ProductGroup')) {
      candidates.push({ node, groupNode: null, nodeIndex });
      if (Array.isArray(node.hasVariant)) {
        node.hasVariant.forEach((variant, variantIndex) => {
          if (!variant || !normalizeTypes(variant['@type']).includes('Product')) return;
          candidates.push({ node: variant, groupNode: node, nodeIndex: nodeIndex + (variantIndex + 1) / 1000 });
        });
      }
    } else if (types.includes('Product')) {
      candidates.push({ node, groupNode: null, nodeIndex });
    }
  });
  return candidates;
}

// Richness score used to pick the best candidate when a page has several
// Product-like JSON-LD nodes (a ProductGroup's own entry plus each of its
// variants, or unrelated Product blocks such as a recommendations widget).
// Mirrors the spirit of scoreProductNode() in src/shops/phaseEight.js, but
// scores on information density (images/offers/description/identifiers)
// rather than a name/sku match against the current page.
function scoreJsonLdCandidate(node, groupNode) {
  let score = 0;
  const images = node.image || (groupNode && groupNode.image);
  score += Array.isArray(images) ? images.length : (images ? 1 : 0);
  if (node.offers || (groupNode && groupNode.offers)) score += 20;
  const description = String((groupNode && groupNode.description) || node.description || '');
  score += Math.min(description.length, 500) / 50;
  if (node.sku || node.mpn) score += 5;
  if (node.name || (groupNode && groupNode.name)) score += 2;
  return score;
}

function selectBestJsonLdCandidate(jsonLdNodes) {
  const candidates = buildJsonLdCandidates(jsonLdNodes);
  if (candidates.length === 0) return { node: {}, groupNode: null };
  return candidates
    .map((candidate) => ({ ...candidate, score: scoreJsonLdCandidate(candidate.node, candidate.groupNode) }))
    .sort((a, b) => b.score - a.score || a.nodeIndex - b.nodeIndex)[0];
}

// Fields shared across colour/size variants of the same product (name,
// description, brand, category, material): prefer the ProductGroup's own
// value, falling back to the selected variant's.
function groupPreferredField(node, groupNode, field) {
  return jsonLdString(groupNode && groupNode[field]) || jsonLdString(node && node[field]);
}

// Fields that legitimately differ per variant (colour, sku, mpn): prefer the
// selected variant's own value, falling back to the group's.
function variantPreferredField(node, groupNode, field) {
  return jsonLdString(node && node[field]) || jsonLdString(groupNode && groupNode[field]);
}

// Every Offer found anywhere in the page's Product-like JSON-LD, in document
// order: a standalone Product's own offers, a ProductGroup's offers when
// present directly on the group, and every hasVariant[].offers — client
// instruction: offers can live in either place depending on the site, so
// both must be checked rather than assuming one location.
function collectRawOffers(jsonLdNodes) {
  const offers = [];
  const addOffers = (value) => {
    if (!value) return;
    (Array.isArray(value) ? value : [value]).forEach((offer) => {
      if (offer && typeof offer === 'object') offers.push(offer);
    });
  };
  (jsonLdNodes || []).forEach((node) => {
    if (!node) return;
    addOffers(node.offers);
    if (normalizeTypes(node['@type']).includes('ProductGroup') && Array.isArray(node.hasVariant)) {
      node.hasVariant.forEach((variant) => addOffers(variant && variant.offers));
    }
  });
  return offers;
}

function offerPriceCurrency(offer) {
  const priceSpec = offer.priceSpecification && typeof offer.priceSpecification === 'object' ? offer.priceSpecification : {};
  const priceRaw = offer.price ?? priceSpec.price;
  const currencyRaw = offer.priceCurrency ?? priceSpec.priceCurrency;
  if (priceRaw === undefined || priceRaw === null || String(priceRaw).trim() === '') return null;
  return { priceRaw: String(priceRaw), currencyRaw: currencyRaw ? String(currencyRaw) : '' };
}

// Parses a raw amount that may already be a plain machine-formatted number
// ("1725.00", from JSON-LD/meta) or a display string with a currency symbol
// and thousands separators ("£1,725.00", from DOM text) — both go through
// the same locale-aware parser used for the D-column manual cost input.
function parsePriceAmount(rawText) {
  const normalized = String(rawText === undefined || rawText === null ? '' : rawText).normalize('NFKC').trim();
  if (!normalized) return null;
  const numericText = normalized.replace(/[^0-9.,]/g, '');
  return parseLocalizedNumber(numericText);
}

// Currency symbols/codes only — GBP and EUR are the only ones this project's
// pricing pipeline converts automatically; anything else (or nothing
// detected) is left for src/index.js's existing
// `要確認：通貨換算が必要（XXX→GBP）` handling to catch.
function normalizeCurrencyText(primaryRaw, fallbackText) {
  const primary = String(primaryRaw || '').trim();
  if (primary) {
    const upper = primary.toUpperCase();
    if (/^[A-Z]{3}$/.test(upper)) return upper;
    if (CURRENCY_SYMBOL_MAP[primary[0]]) return CURRENCY_SYMBOL_MAP[primary[0]];
  }
  const combined = `${primary} ${fallbackText || ''}`;
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOL_MAP)) {
    if (combined.includes(symbol)) return code;
  }
  const codeMatch = combined.toUpperCase().match(/\b(GBP|EUR|USD|JPY)\b/);
  return codeMatch ? codeMatch[1] : '';
}

// Price/currency resolution in trust order: (1) JSON-LD offers — structured
// data, taken as-is; (2) meta tags — structured data, taken as-is; (3) DOM
// price text — last resort, flagged with GENERIC_DOM_PRICE_WARNING because a
// page's raw text can just as easily be a sale/related-product/"from £X"
// price as the real one. Each level independently drops candidates below
// GENERIC_PRICE_MIN_PLAUSIBLE_AMOUNT (a likely decimal/thousands misread)
// before falling through to the next level.
function resolvePriceAndCurrency(data) {
  const rawOffers = collectRawOffers(data.jsonLdNodes).map(offerPriceCurrency).filter(Boolean);
  const parsedOffers = rawOffers
    .map((offer) => ({
      amount: parsePriceAmount(offer.priceRaw),
      currency: normalizeCurrencyText(offer.currencyRaw, offer.priceRaw)
    }))
    .filter((offer) => Number.isFinite(offer.amount) && offer.amount >= GENERIC_PRICE_MIN_PLAUSIBLE_AMOUNT);

  if (parsedOffers.length > 0) {
    const [chosen, ...rest] = parsedOffers;
    if (rest.length > 0) {
      console.log(`汎用価格抽出: JSON-LD offersに${parsedOffers.length}件の候補、最初の有効な価格(${chosen.amount} ${chosen.currency || '通貨不明'})を採用（残り${rest.length}件は不採用: ${rest.map((o) => `${o.amount} ${o.currency || '通貨不明'}`).join(', ')}）`);
    }
    return { price: chosen.amount, currency: chosen.currency, source: 'json-ld-offers', warnings: [] };
  }

  const metaAmountRaw = data.priceMeta.metaAmount || data.priceMeta.itemPropAmount;
  const metaAmount = parsePriceAmount(metaAmountRaw);
  if (Number.isFinite(metaAmount) && metaAmount >= GENERIC_PRICE_MIN_PLAUSIBLE_AMOUNT) {
    const currency = normalizeCurrencyText(data.priceMeta.metaCurrency || data.priceMeta.itemPropCurrency, metaAmountRaw);
    return { price: metaAmount, currency, source: 'meta', warnings: [] };
  }

  const domAmount = parsePriceAmount(data.priceDomText);
  if (Number.isFinite(domAmount) && domAmount >= GENERIC_PRICE_MIN_PLAUSIBLE_AMOUNT) {
    const currency = normalizeCurrencyText('', data.priceDomText);
    console.log(`汎用価格抽出: 構造化データから価格が見つからず、DOMテキスト "${data.priceDomText}" から採用（要確認扱い）`);
    return { price: domAmount, currency, source: 'dom-text', warnings: [GENERIC_DOM_PRICE_WARNING] };
  }

  return { price: null, currency: '', source: '', warnings: [] };
}

// Assembles the generic-fallback product-detail result from the raw data
// collected by scrapeProductPage()'s page.evaluate() above. Kept outside
// page.evaluate() (plain Node.js) so the JSON-LD node selection, offer
// collection, and price parsing are unit-testable and reuse
// parseLocalizedNumber from src/utils.js — page.evaluate() callbacks run in
// the browser and cannot call back into Node.js code.
function resolveGenericProductFields(data) {
  const { node, groupNode } = selectBestJsonLdCandidate(data.jsonLdNodes);
  const priceResult = resolvePriceAndCurrency(data);
  const sku = variantPreferredField(node, groupNode, 'sku');
  const mpn = variantPreferredField(node, groupNode, 'mpn');
  const productID = variantPreferredField(node, groupNode, 'productID')
    || jsonLdString(groupNode && groupNode.productGroupID);

  return {
    name: groupPreferredField(node, groupNode, 'name') || data.nameFallback,
    brand: groupPreferredField(node, groupNode, 'brand') || data.labeledBrand || data.metaBrand,
    description: groupPreferredField(node, groupNode, 'description')
      || data.ogDescription
      || data.metaDescription
      || data.domDescriptionFallback,
    color: variantPreferredField(node, groupNode, 'color') || data.labeledColor,
    material: groupPreferredField(node, groupNode, 'material') || data.labeledMaterial,
    category: groupPreferredField(node, groupNode, 'category') || data.labeledCategory || data.metaCategory,
    sku,
    mpn,
    productCode: sku || mpn || productID,
    price: priceResult.price || '',
    currency: priceResult.currency || '',
    priceSource: priceResult.source,
    warnings: priceResult.warnings
  };
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function mergeScrapedData(genericData, shopData) {
  const merged = { ...genericData };
  for (const [key, value] of Object.entries(shopData)) {
    // Warnings are additive rather than "shop wins": a shop-specific
    // extractor's warning (e.g. a currency-mismatch check) and the generic
    // fallback's own (e.g. GENERIC_DOM_PRICE_WARNING) can both be relevant
    // for the same page, and neither should silently drop the other.
    if (key === 'warnings') {
      merged.warnings = uniq([...(genericData.warnings || []), ...(value || [])]);
      continue;
    }
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
    if (isCollardMansonUrl(url)) return await extractCollardMansonImages(page);
    if (isLabStoreWorldUrl(url)) return await extractLabStoreWorldImages(page);

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

    const normalizeJsonLdTypes = (type) => (!type ? [] : (Array.isArray(type) ? type : [type]));

    const jsonLdNodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((script) => {
        try {
          return JSON.parse(script.textContent || '{}');
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean)
      .flatMap((item) => Array.isArray(item) ? item : (Array.isArray(item['@graph']) ? item['@graph'] : [item]))
      .filter((item) => {
        const types = normalizeJsonLdTypes(item && item['@type']);
        return types.includes('Product') || types.includes('ProductGroup');
      });

    // Same candidate set as scrapeProductPage()'s product-detail extraction
    // (a ProductGroup, e.g. Shopify's multi-variant pattern, plus one
    // candidate per hasVariant Product): a ProductGroup's own `image` is
    // often absent even when every variant carries the real gallery (e.g.
    // wakakuu.com), so the variant must be checked too. Scored by richness
    // rather than matching the current page, same as scoreProductNode() in
    // src/shops/phaseEight.js, so an unrelated Product block elsewhere on
    // the page (a recommendations widget) doesn't win over the real one.
    const jsonLdCandidates = [];
    jsonLdNodes.forEach((node, nodeIndex) => {
      const types = normalizeJsonLdTypes(node['@type']);
      if (types.includes('ProductGroup')) {
        jsonLdCandidates.push({ node, groupNode: null, nodeIndex });
        if (Array.isArray(node.hasVariant)) {
          node.hasVariant.forEach((variant, variantIndex) => {
            if (variant && normalizeJsonLdTypes(variant['@type']).includes('Product')) {
              jsonLdCandidates.push({ node: variant, groupNode: node, nodeIndex: nodeIndex + (variantIndex + 1) / 1000 });
            }
          });
        }
      } else if (types.includes('Product')) {
        jsonLdCandidates.push({ node, groupNode: null, nodeIndex });
      }
    });

    const scoreJsonLdCandidate = ({ node, groupNode }) => {
      const images = node.image || (groupNode && groupNode.image);
      let score = Array.isArray(images) ? images.length : (images ? 1 : 0);
      if (node.offers || (groupNode && groupNode.offers)) score += 20;
      const description = String((groupNode && groupNode.description) || node.description || '');
      score += Math.min(description.length, 500) / 50;
      if (node.sku || node.mpn) score += 5;
      return score;
    };

    const bestJsonLdCandidate = jsonLdCandidates
      .map((candidate) => ({ ...candidate, score: scoreJsonLdCandidate(candidate) }))
      .sort((a, b) => b.score - a.score || a.nodeIndex - b.nodeIndex)[0] || { node: {}, groupNode: null };

    const jsonLd = { image: bestJsonLdCandidate.node.image || (bestJsonLdCandidate.groupNode && bestJsonLdCandidate.groupNode.image) };

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
  scrapeImagesFromUrl,
  // Exported for unit verification of the generic-fallback price/currency
  // extraction (not used elsewhere) — mirrors pricing.js's convention of
  // exporting internal helpers for testability.
  resolveGenericProductFields,
  resolvePriceAndCurrency,
  normalizeCurrencyText,
  parsePriceAmount,
  selectBestJsonLdCandidate,
  buildJsonLdCandidates
};
