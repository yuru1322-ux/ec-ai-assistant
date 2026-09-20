const DEFAULT_MARGIN_RATE = 0.20;

const BRAND_MARGIN_ZONES = [
  {
    marginRate: 0.20,
    brands: [
      'BOTTEGA VENETA',
      'RICK OWENS',
      'TOD’S',
      "TOD'S",
      'TODS',
      'HUGO BOSS',
      'THE NORTH FACE',
      'TED BAKER',
      'AMIRI',
      'TRUE RELIGION',
      'GHOSPELL',
      'PHASE EIGHT',
      'ALAIA',
      'VIVIENNE WESTWOOD',
      'SELF-PORTRAIT',
      'SELF PORTRAIT',
      'HOBBS LONDON'
    ]
  },
  {
    marginRate: 0.18,
    brands: [
      'HERNO',
      'MAX MARA',
      'CANADA GOOSE',
      'SISTER JANE',
      'GUCCI',
      'TATRAS',
      'MACKAGE',
      'MONCLER'
    ]
  },
  {
    marginRate: 0.15,
    brands: [
      'JADED LONDON',
      'ELIZABETH SCARLETT'
    ]
  }
];

const SHOP_DOMAINS = {
  'allotmentstore.com': 'ALLOTMENT STORE',
  'beaverbrooks.co.uk': 'BEAVERBROOKS',
  'bottegaveneta.com': 'BOTTEGA VENETA',
  'coastfashion.com': 'COAST',
  'coeandcostore.com': 'COE&CO STORE',
  'collardmanson.co.uk': 'COLLARD MANSON',
  'circle-fashion.com': 'CIRCLE FASHION',
  'cruisefashion.com': 'CRUISE FASHION',
  'dvf.com': 'DIANE VON FURSTENBERG',
  'doverstreetmarket.com': 'DOVER STREET MARKET',
  'elizabethscarlett.com': 'ELIZABETH SCARLETT',
  'endclothing.com': 'END.',
  'farfetch.com': 'FARFETCH',
  'fenwick.co.uk': 'FENWICK',
  'flannels.com': 'FLANNELS',
  'frasers.com': 'FRASERS',
  'harrods.com': 'HARRODS',
  'harveynichols.com': 'HARVEY NICHOLS',
  'hobbs.com': 'HOBBS LONDON',
  'hugoboss.com': 'HUGO BOSS UK',
  'hurleys.co.uk': 'HURLEYS',
  'jadedldn.com': 'JADED LONDON',
  'jdsports.co.uk': 'JD SPORTS UK',
  'johnlewis.com': 'JOHN LEWIS',
  'karenmillen.com': 'KAREN MILLEN',
  'kjbeckett.com': 'KJ BECKETT',
  'kronkron.com': 'KRONKRON',
  'labstorelondon.com': 'LAB STORE WORLD',
  'libertylondon.com': 'LIBERTY',
  'ln-cc.com': 'LN-CC',
  'miinto.co.uk': 'MIINTO',
  'miinto.com': 'MIINTO',
  'minoxboutique.co.uk': 'MINOX BOUTIQUE',
  'moncler.com': 'MONCLER',
  'mytheresa.com': 'MYTHERESA',
  'mrporter.com': 'MR PORTER',
  'marksandspencer.com': 'M&S',
  'net-a-porter.com': 'NET-A-PORTER',
  'next.co.uk': 'NEXT',
  'phase-eight.com': 'PHASE EIGHT',
  'rddesignerwear.com': 'RD DESIGNER WEAR',
  'self-portrait.com': 'SELF PORTRAIT',
  'selfridges.com': 'SELFRIDGES',
  'sisterjane.com': 'SISTER JANE',
  'ssense.com': 'SSENSE',
  'tedbaker.com': 'TED BAKER',
  'thebusinessfashion.com': 'THE BUSINESS FASHION',
  'theoutnet.com': 'THE OUTNET',
  'tods.com': 'TOD’S UK',
  'viviennewestwood.com': 'VIVIENNE WESTWOOD UK',
  'vitkac.com': 'VITKAC',
  'wardow.com': 'WARDOW',
  'yoox.com': 'YOOX',
  'zalando.co.uk': 'ZALANDO',
  'zalando.com': 'ZALANDO',
  'zalando.ie': 'ZALANDO',
  'zoofashions.com': 'ZOO FASHIONS',
  'hbx.com': 'HBX',
  'printemps.com': 'PRINTEMPS',
  'parlourx.com': 'PARLOURX',
  'vallgatan12.se': 'VALLGATAN12'
};

const SPECIAL_SHOPS = new Set([
  'HITCHHIKER',
  'HBX',
  'PRINTEMPS',
  'PARLOURX',
  'VALLGATAN12'
]);

const SHOP_SHIPPING_RULES = {
  'ALLOTMENT STORE': { fixed: 10 },
  BEAVERBROOKS: { freeThreshold: 30, below: 4 },
  'BOTTEGA VENETA': { fixed: 0 },
  COAST: { fixed: 4 },
  'COE&CO STORE': { freeThreshold: 75, below: 6 },
  'COLLARD MANSON': { fixed: 0 },
  'CIRCLE FASHION': { freeThreshold: 150, below: 6 },
  'CRUISE FASHION': { fixed: 7 },
  'DIANE VON FURSTENBERG': { fixed: 0 },
  'DOVER STREET MARKET': { freeThreshold: 90, below: 5 },
  'ELIZABETH SCARLETT': { freeThreshold: 50, below: 5 },
  'END.': { freeThreshold: 80, below: 5 },
  FARFETCH: { freeThreshold: 400, below: 10 },
  FENWICK: { freeThreshold: 100, below: 5 },
  FLANNELS: { fixed: 7 },
  FRASERS: { fixed: 5 },
  HARRODS: { freeThreshold: 100, below: 6 },
  'HARVEY NICHOLS': { freeThreshold: 300, below: 8 },
  'HOBBS LONDON': { freeThreshold: 150, below: 4 },
  'HUGO BOSS UK': { freeThreshold: 79, below: 5 },
  HURLEYS: { freeThreshold: 50, below: 5 },
  'JADED LONDON': { freeThreshold: 80, below: 4 },
  'JD SPORTS UK': { freeThreshold: 80, below: 4 },
  'JOHN LEWIS': { freeThreshold: 70, below: 4 },
  'KAREN MILLEN': { freeThreshold: 125, aboveOrEqual: 4, below: 5 },
  'KJ BECKETT': { fixed: 0 },
  KRONKRON: { fixed: 45 },
  'LAB STORE WORLD': { fixed: 10 },
  LIBERTY: { freeThreshold: 100, below: 6 },
  'LN-CC': { fixed: 7 },
  MIINTO: { fixed: 6 },
  'MINOX BOUTIQUE': { freeThreshold: 300, below: 8 },
  // 暫定値。実際の送料条件が判明したら更新すること
  MONCLER: { fixed: 0 },
  MYTHERESA: { freeThreshold: 300, below: 8 },
  'MR PORTER': { freeThreshold: 200, below: 7 },
  'M&S': { freeThreshold: 60, below: 4 },
  'NET-A-PORTER': { freeThreshold: 300, below: 7 },
  NEXT: { fixed: 5 },
  'PHASE EIGHT': { freeThreshold: 150, below: 4 },
  'RD DESIGNER WEAR': { fixed: 6 },
  'SELF PORTRAIT': { fixed: 0 },
  SELFRIDGES: { fixed: 0 },
  'SISTER JANE': { freeThreshold: 60, below: 5 },
  SSENSE: { fixed: 17 },
  STUDIO: { fixed: 5 },
  'TED BAKER': { freeThreshold: 150, below: 4 },
  'THE BUSINESS FASHION': { freeThreshold: 500, below: 6 },
  'THE OUTNET': { freeThreshold: 200, below: 7 },
  'TOD’S UK': { fixed: 0 },
  'VIVIENNE WESTWOOD UK': { freeThreshold: 300, below: 5 },
  VITKAC: { fixed: 25 },
  WARDOW: { fixed: 0 },
  YOOX: { freeThreshold: 200, below: 9 },
  ZALANDO: { freeThreshold: 35, below: 4 },
  'ZOO FASHIONS': { freeThreshold: 350, below: 7 }
};

const INTERNATIONAL_SHIPPING_GBP = {
  low: {
    max: 250,
    prices: {
      アクセサリー: 16,
      革小物: 18,
      アパレル: 25,
      'バッグ・靴': 30,
      大型: 38
    }
  },
  middle: {
    max: 599,
    prices: {
      アクセサリー: 18,
      革小物: 20,
      アパレル: 28,
      'バッグ・靴': 35,
      大型: 40
    }
  },
  high: {
    prices: {
      アクセサリー: 25,
      革小物: 28,
      アパレル: 40,
      'バッグ・靴': 45,
      大型: 50
    }
  }
};

const PROFIT_UPPER_LIMITS = {
  0.20: 0.22,
  0.18: 0.20,
  0.15: 0.17
};

const PROVISIONAL_SHIPPING_SHOPS = new Set([]);

// Flat international shipping (GBP) that replaces the category/price-bucket
// lookup in INTERNATIONAL_SHIPPING_GBP. Client-confirmed for MONCLER and only
// for France-sourced orders (C-column note), see isFranceSourcedNote().
const FLAT_INTERNATIONAL_SHIPPING_GBP = new Map([
  ['MONCLER', 50]
]);

// A retailer (non-moncler.com) row is treated as France-sourced only when the
// client has said so explicitly in the C-column note — client-confirmed
// instruction, not a URL/currency guess. Earlier this also matched on the
// A-column URL's locale (hostname ending `.fr`, or a `/fr/`-style first path
// segment) or on a EUR-denominated manual cost, but both produced false
// positives (e.g. a `/fr/` locale picked for language reasons, unrelated to
// where the item ships from), so detection is note-text-only now.
const FRANCE_NOTE_PATTERN = /フランス/;
const PURCHASE_NOTE_PATTERN = /買付|買い付け|仕入/;

function isFranceSourcedNote(note) {
  const text = String(note || '');
  return FRANCE_NOTE_PATTERN.test(text) && PURCHASE_NOTE_PATTERN.test(text);
}

// Client-confirmed rule: every row is treated as UK-shipped (and gets the flat
// packaging fee below) unless the C-column note explicitly says France
// shipping. Unlike isFranceSourcedNote() above (Moncler-only flat
// international-shipping rate, which also requires a purchase-related
// keyword), this check is brand/shop-agnostic and matches on "フランス" alone.
function isFranceShippingNote(note) {
  return FRANCE_NOTE_PATTERN.test(String(note || ''));
}

// Client-confirmed instruction (2026-09-06): UK-shipped orders add a flat
// JPY 2000 packaging fee to the total purchase cost used for pricing.
const UK_PACKAGING_FEE_JPY = 2000;

// C-column instruction such as "20%オフ適用して価格計算してください（＊セール品を除く）".
// Applied to the SCRAPED cost only (never to a D-column manual cost), and only
// when the note explicitly says to apply it ("適用"): a bare "20%オフ" mention
// is ambiguous (could be a sale description) and is flagged, not applied.
// The pricing formulas in calculatePricing() are unchanged; the discounted
// cost simply becomes the `costGbp` they receive.
const NOTE_DISCOUNT_APPLY_PATTERN = /(\d+(?:\.\d+)?)\s*%\s*(?:オフ|OFF|引き)\s*(?:を)?\s*適用/i;
const NOTE_DISCOUNT_MENTION_PATTERN = /\d+(?:\.\d+)?\s*%\s*(?:オフ|OFF|引き)/i;
const NOTE_SALE_EXCLUSION_PATTERN = /セール(?:品)?\s*(?:は|を)?\s*(?:除|対象外)/;

function parseNoteDiscount(note) {
  // NFKC folds full-width digits and "％" so "２０％オフ" is read like "20%オフ".
  const text = String(note || '').normalize('NFKC');
  const applyMatch = text.match(NOTE_DISCOUNT_APPLY_PATTERN);
  const rate = applyMatch ? Number(applyMatch[1]) : null;
  return {
    mentioned: NOTE_DISCOUNT_MENTION_PATTERN.test(text),
    rate: Number.isFinite(rate) && rate > 0 && rate < 100 ? rate : null,
    excludesSale: NOTE_SALE_EXCLUSION_PATTERN.test(text)
  };
}

// Returns the cost to use plus a status message. `onSale` must be exactly
// true/false; anything else means the scraper could not tell.
function applyNoteDiscount({ costGbp, note, onSale }) {
  const unchanged = (message = '') => ({ cost: costGbp, applied: false, rate: null, message });
  const parsed = parseNoteDiscount(note);
  if (!parsed.mentioned) return unchanged();
  if (parsed.rate === null) {
    return unchanged('要確認：C列の割引指定を自動適用できませんでした。原価を確認してください');
  }
  const numericCost = Number(costGbp);
  if (!Number.isFinite(numericCost)) return unchanged();

  if (parsed.excludesSale) {
    if (onSale === true) return unchanged(`セール品のため${parsed.rate}%オフは適用していません`);
    if (onSale !== false) {
      return unchanged(`要確認：セール品か判定できないため${parsed.rate}%オフを適用していません`);
    }
  }
  const discounted = roundNumber(numericCost * (1 - parsed.rate / 100), 2);
  return {
    cost: discounted,
    applied: true,
    rate: parsed.rate,
    message: `${parsed.rate}%オフを適用（定価${numericCost}→${discounted} GBP）`
  };
}

// Manual (D-column) costs are taken as the user typed them, so a discount
// instruction in the note is reported rather than applied.
function describeNoteDiscountForManualCost(note) {
  const parsed = parseNoteDiscount(note);
  if (!parsed.mentioned) return '';
  return '要確認：D列手入力の原価にはC列の割引指定を適用していません';
}

// Shops for which possible leather shoes do NOT stop the calculation with
// `要確認：革靴の可能性があります。関税を手入力してください`. Client-confirmed for
// Collard Manson: no duty markup is needed, so its leather shoes/boots are
// priced like any other product. Every other shop keeps the check.
const LEATHER_SHOES_DUTY_CHECK_EXEMPT_SHOPS = new Set(['COLLARD MANSON']);

// `marginRateOverride` (optional, e.g. 0.2) replaces the brand's margin rate for
// this one calculation, for a per-row client instruction such as "利益率20パーセントで
// 計算してください" in the C-column note. The C-column note is NOT parsed
// automatically: whether to honour such an instruction is confirmed with the user
// each time, then passed in explicitly. Omitted, behaviour is unchanged.
function calculatePricing({ sourceUrl, brandName, costGbp, category, productData = {}, settings = {}, note = '', marginRateOverride }) {
  const warnings = [];
  const blockingWarnings = [];
  const errors = [];
  const normalizedCost = toNumber(costGbp);
  const pricingSettings = normalizePricingSettings(settings);

  errors.push(...pricingSettings.errors);
  if (!Number.isFinite(normalizedCost)) {
    blockingWarnings.push('要確認：価格取得失敗');
  }

  const resolvedBrand = resolveBrandMargin(brandName);
  const hasMarginOverride = Number.isFinite(marginRateOverride) && marginRateOverride > 0 && marginRateOverride < 1;
  const brandResult = hasMarginOverride ? { ...resolvedBrand, marginRate: marginRateOverride } : resolvedBrand;
  warnings.push(...brandResult.warnings);

  const shopResult = resolveShop(sourceUrl);
  blockingWarnings.push(...shopResult.warnings);
  if (PROVISIONAL_SHIPPING_SHOPS.has(shopResult.shopName)) {
    warnings.push('要確認：ショップ送料が暫定値（0）です');
  }
  // The flat rate is a France-sourcing rule (client-confirmed), NOT a
  // moncler.com-URL rule: a moncler.com row is UK-sourced/UK-shipped unless the
  // C-column note explicitly says the item was bought via a French site, and
  // otherwise follows the normal category/price-bucket table. It applies to
  // Moncler only (brand, or a moncler.com shop) — a client-confirmed rule for
  // Moncler specifically, not a general France-shipping rule — and also covers
  // rows sourced from another retailer (e.g. mytheresa.com) when the note says so.
  const isMonclerFranceSourced = (normalizeBrandName(brandName) === 'MONCLER' || shopResult.shopName === 'MONCLER')
    && isFranceSourcedNote(note);
  const hasFlatInternationalShipping = isMonclerFranceSourced;

  const categoryResult = resolveShippingCategory({ category, productData, sourceUrl });
  if (hasFlatInternationalShipping) {
    // Category is informational (I-column) only for these shops; a failed
    // resolution must not block price calculation, since their source pages are
    // often in a language CATEGORY_PATTERNS does not recognize (e.g. French).
    blockingWarnings.push(...categoryResult.warnings.filter((warning) => warning !== '要確認：カテゴリー判定'));
  } else {
    blockingWarnings.push(...categoryResult.warnings);
  }
  if (categoryResult.category) {
    console.log(`カテゴリ判定: category=${categoryResult.category} source=${categoryResult.source || 'unknown'} matched=${categoryResult.matched || 'unknown'}`);
  }

  if (categoryResult.possibleLeatherShoes && !LEATHER_SHOES_DUTY_CHECK_EXEMPT_SHOPS.has(shopResult.shopName)) {
    blockingWarnings.push('要確認：革靴の可能性があります。関税を手入力してください');
  }

  if (errors.length > 0 || blockingWarnings.length > 0) {
    return {
      category: categoryResult.category || '',
      shopName: shopResult.shopName || '',
      marginRate: brandResult.marginRate,
      warnings: [...warnings, ...blockingWarnings],
      errors,
      canCalculate: false
    };
  }

  const shopShippingGbp = calculateShopShipping(shopResult.shopName, normalizedCost);
  if (!Number.isFinite(shopShippingGbp)) {
    blockingWarnings.push('要確認：ショップ送料未登録');
  }

  const internationalShippingGbp = hasFlatInternationalShipping
    ? FLAT_INTERNATIONAL_SHIPPING_GBP.get('MONCLER')
    : calculateInternationalShipping(normalizedCost, categoryResult.category);
  if (!Number.isFinite(internationalShippingGbp)) {
    blockingWarnings.push('要確認：カテゴリー判定');
  }

  if (blockingWarnings.length > 0) {
    return {
      category: categoryResult.category || '',
      shopName: shopResult.shopName || '',
      marginRate: brandResult.marginRate,
      warnings: [...warnings, ...blockingWarnings],
      errors,
      canCalculate: false
    };
  }

  const packagingFeeJpy = isFranceShippingNote(note) ? 0 : UK_PACKAGING_FEE_JPY;
  const costWithShopShippingGbp = normalizedCost + shopShippingGbp;
  const totalCostJpy = Math.ceil((costWithShopShippingGbp + internationalShippingGbp) * pricingSettings.gbpJpyRate) + packagingFeeJpy;
  const minimumListingPrice = totalCostJpy / (1 - pricingSettings.buymaFeeRate - brandResult.marginRate);
  const listingPriceJpy = roundUpListingPrice(minimumListingPrice);
  const buymaFeeJpy = listingPriceJpy * pricingSettings.buymaFeeRate;
  const profitJpy = listingPriceJpy - buymaFeeJpy - totalCostJpy;
  const profitRate = profitJpy / listingPriceJpy;

  if (profitRate + Number.EPSILON < brandResult.marginRate) {
    errors.push(`エラー：ブランド別最低利益率${Math.round(brandResult.marginRate * 100)}％を下回っています`);
  }

  const upperLimit = PROFIT_UPPER_LIMITS[brandResult.marginRate];
  if (upperLimit && profitRate > upperLimit) {
    warnings.push('要確認：利益率がブランド別目安上限を超えています');
  }

  return {
    category: categoryResult.category,
    shopName: shopResult.shopName,
    marginRate: brandResult.marginRate,
    shopShippingGbp,
    costWithShopShippingGbp,
    internationalShippingGbp,
    customsDutyJpy: 0,
    consumptionTaxJpy: 0,
    totalCostJpy,
    listingPriceJpy,
    profitRate: roundNumber(profitRate, 3),
    settings: {
      gbpJpyRate: pricingSettings.gbpJpyRate,
      buymaFeeRate: pricingSettings.buymaFeeRate,
      consumptionTaxRate: pricingSettings.consumptionTaxRate
    },
    warnings,
    errors,
    canCalculate: errors.length === 0
  };
}

function normalizePricingSettings(settings) {
  const gbpJpyRate = settingNumber(settings, 'GBP_JPY_RATE');
  const buymaFeeRate = settingNumber(settings, 'BUYMA_FEE_RATE');
  const consumptionTaxRate = settingNumber(settings, 'CONSUMPTION_TAX');
  const errors = [];

  if (!Number.isFinite(gbpJpyRate) || gbpJpyRate <= 0) {
    errors.push('エラー：GBP/JPY為替レートを確認してください');
  }
  if (!Number.isFinite(buymaFeeRate) || buymaFeeRate < 0) {
    errors.push('エラー：BUYMA手数料率を確認してください');
  }
  if (!Number.isFinite(consumptionTaxRate) || consumptionTaxRate < 0) {
    errors.push('エラー：消費税率を確認してください');
  }

  return {
    gbpJpyRate,
    buymaFeeRate,
    consumptionTaxRate,
    errors
  };
}

function settingNumber(settings, key) {
  if (!settings || settings[key] === undefined || settings[key] === null || String(settings[key]).trim() === '') {
    return null;
  }
  return toNumber(settings[key]);
}

function resolveBrandMargin(brandName) {
  const normalized = normalizeBrandName(brandName);
  const matches = BRAND_MARGIN_ZONES
    .filter((zone) => zone.brands.some((brand) => normalizeBrandName(brand) === normalized))
    .map((zone) => zone.marginRate);

  if (matches.length === 0) {
    return {
      marginRate: DEFAULT_MARGIN_RATE,
      warnings: ['要確認：ブランド別利益率が未登録のため20％を適用しました']
    };
  }

  return {
    marginRate: Math.max(...matches),
    warnings: []
  };
}

function normalizeBrandName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/公式/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/&/g, ' AND ')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toUpperCase()
    .trim();
}

function resolveShop(sourceUrl) {
  let hostname = '';
  try {
    const parsed = new URL(sourceUrl);
    hostname = normalizeHostname(parsed.hostname);
  } catch (_) {
    return {
      shopName: '',
      warnings: ['要確認：商品URLを確認してください']
    };
  }

  const shopName = SHOP_DOMAINS[hostname];
  if (!shopName) {
    return {
      shopName: '',
      warnings: ['要確認：ショップ送料未登録']
    };
  }
  if (SPECIAL_SHOPS.has(shopName)) {
    return {
      shopName,
      warnings: ['要確認：ショップ送料を手入力してください']
    };
  }
  if (!SHOP_SHIPPING_RULES[shopName]) {
    return {
      shopName,
      warnings: ['要確認：ショップ送料未登録']
    };
  }
  return {
    shopName,
    warnings: []
  };
}

function normalizeHostname(hostname) {
  return String(hostname || '')
    .toLowerCase()
    .replace(/:\\d+$/, '')
    .replace(/^(www|m|mobile)\./, '');
}

function calculateShopShipping(shopName, costGbp) {
  const rule = SHOP_SHIPPING_RULES[shopName];
  if (!rule) return null;
  if (Number.isFinite(rule.fixed)) return rule.fixed;
  if (Number.isFinite(rule.freeThreshold)) {
    if (costGbp >= rule.freeThreshold) {
      return Number.isFinite(rule.aboveOrEqual) ? rule.aboveOrEqual : 0;
    }
    return rule.below;
  }
  return null;
}

function resolveShippingCategory({ category, productData = {}, sourceUrl = '' }) {
  const explicitText = normalizeCategoryText([
    category,
    productData.category,
    productData.breadcrumb,
    productData.breadcrumbs,
    productData.categoryPath,
    categoryTextFromUrl(productData.sourceUrl || productData.url)
  ]);
  const urlText = normalizeCategoryText(categoryTextFromUrl(sourceUrl));
  const nameText = normalizeCategoryText(productData.name);
  const supportText = normalizeCategoryText([
    productData.description,
    Array.isArray(productData.features) ? productData.features.join(' ') : productData.features
  ]);
  const materialText = normalizeCategoryText([productData.material, productData.composition]);
  const allText = normalizeCategoryText([explicitText, urlText, nameText, supportText, materialText]);

  const possibleLeatherShoes = CATEGORY_PATTERNS.shoes.some((pattern) => pattern.test(allText))
    && CATEGORY_PATTERNS.leather.some((pattern) => pattern.test(allText));

  const explicitMatch = firstCategoryMatch(explicitText, [
    '革小物',
    'バッグ・靴',
    'アパレル',
    'アクセサリー',
    '大型'
  ], 'category');
  if (explicitMatch) return { ...explicitMatch, possibleLeatherShoes, warnings: [] };

  const urlMatch = firstCategoryMatch(urlText, [
    '革小物',
    'バッグ・靴',
    'アパレル',
    'アクセサリー',
    '大型'
  ], 'url');
  if (urlMatch) return { ...urlMatch, possibleLeatherShoes, warnings: [] };

  const nameMatch = firstCategoryMatch(nameText, [
    '革小物',
    'アクセサリー',
    'バッグ・靴',
    'アパレル',
    '大型'
  ], 'product name');
  if (nameMatch) return { ...nameMatch, possibleLeatherShoes, warnings: [] };

  const supportMatch = firstCategoryMatch(supportText, [
    '革小物',
    'バッグ・靴',
    'アパレル',
    'アクセサリー',
    '大型'
  ], 'description/features');
  if (supportMatch) return { ...supportMatch, possibleLeatherShoes, warnings: [] };

  return {
    category: '',
    possibleLeatherShoes,
    source: '',
    matched: '',
    warnings: ['要確認：カテゴリー判定']
  };
}

const CATEGORY_PATTERNS = {
  革小物: [
    /\bwallets?\b/i,
    /\bpurses?\b/i,
    /\bcard\s*holders?\b/i,
    /\bcardholders?\b/i,
    /\bcoin\b/i,
    /\bkeyrings?\b/i,
    /\bsmall\s+leather\s+goods\b/i,
    /財布/,
    /ウォレット/,
    /カードケース/,
    /コインケース/,
    /革小物/
  ],
  'バッグ・靴': [
    /\bbags?\b/i,
    /\bhandbags?\b/i,
    /\bshoulder\s+bags?\b/i,
    /\btotes?\b/i,
    /\bbackpacks?\b/i,
    /\bshoes?\b/i,
    /\bboots?\b/i,
    /\bsneakers?\b/i,
    /\bloafers?\b/i,
    /\bsandals?\b/i,
    /\btrainers?\b/i,
    /バッグ/,
    /鞄/,
    /ショルダーバッグ/,
    /トート/,
    /靴/,
    /ブーツ/,
    /スニーカー/,
    /ローファー/,
    /サンダル/
  ],
  アパレル: [
    /\bclothing\b/i,
    /\bcoats?\b/i,
    /\bjackets?\b/i,
    /\bdress(?:es)?\b/i,
    /\bshirts?\b/i,
    /\bblouses?\b/i,
    /\btrousers?\b/i,
    /\bskirts?\b/i,
    /\bknitwear\b/i,
    /\bknits?\b/i,
    /\btops?\b/i,
    /\bjumpers?\b/i,
    /\bsweaters?\b/i,
    /\bcardigans?\b/i,
    /\bjeans?\b/i,
    /\bpants?\b/i,
    /\bt-shirts?\b/i,
    /\btshirts?\b/i,
    /\bpolos?\b/i,
    /\bsweatshirts?\b/i,
    /\bhoodies?\b/i,
    /アパレル/,
    /服/,
    /コート/,
    /ジャケット/,
    /ワンピース/,
    /ドレス/,
    /シャツ/,
    /ブラウス/,
    /パンツ/,
    /スカート/,
    /ニット/,
    /セーター/,
    /カーディガン/,
    /ジーンズ/,
    /ポロ/,
    /スウェット/,
    /パーカー/
  ],
  アクセサリー: [
    /\bjewellery\b/i,
    /\bjewelry\b/i,
    /\bearrings?\b/i,
    /\bnecklaces?\b/i,
    /\bbracelets?\b/i,
    /\brings?\b/i,
    /\baccessories\b/i,
    /\baccessory\b/i,
    /ジュエリー/,
    /ピアス/,
    /イヤリング/,
    /ネックレス/,
    /ブレスレット/,
    /リング/,
    /アクセサリー/
  ],
  大型: [
    /\blarge\b/i,
    /\bluggage\b/i,
    /\bsuitcases?\b/i,
    /\bfurniture\b/i,
    /大型/,
    /ラゲージ/,
    /スーツケース/
  ],
  shoes: [
    /\bshoes?\b/i,
    /\bboots?\b/i,
    /\bloafers?\b/i,
    /\bsandals?\b/i,
    /\btrainers?\b/i,
    /\bsneakers?\b/i,
    /靴/,
    /ブーツ/,
    /ローファー/,
    /サンダル/,
    /スニーカー/
  ],
  leather: [
    /\bleather\b/i,
    /\bcalf\b/i,
    /\bcow\b/i,
    /\bsuede\b/i,
    /革/,
    /レザー/,
    /カーフ/,
    /スエード/
  ]
};

function firstCategoryMatch(text, categoryOrder, source) {
  if (!text) return null;
  for (const categoryName of categoryOrder) {
    const matched = matchedCategoryKeyword(text, CATEGORY_PATTERNS[categoryName]);
    if (matched) {
      return {
        category: categoryName,
        source,
        matched
      };
    }
  }
  return null;
}

function matchedCategoryKeyword(text, patterns) {
  for (const pattern of patterns || []) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return '';
}

function normalizeCategoryText(value) {
  const flattened = Array.isArray(value)
    ? value.flatMap((item) => Array.isArray(item) ? item : [item])
    : [value];
  return flattened
    .filter(Boolean)
    .join(' ')
    .replace(/shopping bag|header|footer/gi, ' ')
    .replace(/[/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Shops whose `/collections/{handle}/` URL segment is a browsing/brand grouping
// (e.g. Collard Manson's `/collections/rick-owens-jackets/` holds every Rick
// Owens product, boots and jeans included), not the product's own category.
// The segment is dropped before category keyword matching so a product opened
// from such a collection is not classified by the collection name.
const COLLECTION_SEGMENT_IGNORED_HOSTS = new Set(['collardmanson.co.uk']);

function categoryTextFromUrl(sourceUrl) {
  if (!sourceUrl) return '';
  try {
    const parsed = new URL(sourceUrl);
    if (COLLECTION_SEGMENT_IGNORED_HOSTS.has(normalizeHostname(parsed.hostname))) {
      return parsed.pathname.replace(/\/collections\/[^/]+/i, '');
    }
    return parsed.pathname;
  } catch (_) {
    return '';
  }
}

function calculateInternationalShipping(costGbp, category) {
  const bucket = costGbp <= 250
    ? INTERNATIONAL_SHIPPING_GBP.low
    : costGbp <= 599
      ? INTERNATIONAL_SHIPPING_GBP.middle
      : INTERNATIONAL_SHIPPING_GBP.high;
  return bucket.prices[category];
}

function roundUpListingPrice(value) {
  const unit = value < 100000 ? 100 : 1000;
  return Math.ceil(value / unit) * unit;
}

function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundNumber(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

module.exports = {
  BRAND_MARGIN_ZONES,
  SHOP_DOMAINS,
  SHOP_SHIPPING_RULES,
  PROVISIONAL_SHIPPING_SHOPS,
  FLAT_INTERNATIONAL_SHIPPING_GBP,
  INTERNATIONAL_SHIPPING_GBP,
  UK_PACKAGING_FEE_JPY,
  isFranceShippingNote,
  parseNoteDiscount,
  applyNoteDiscount,
  describeNoteDiscountForManualCost,
  calculatePricing,
  calculateShopShipping,
  normalizePricingSettings,
  resolveBrandMargin,
  resolveShop,
  resolveShippingCategory,
  normalizeBrandName,
  normalizeHostname,
  roundUpListingPrice
};
