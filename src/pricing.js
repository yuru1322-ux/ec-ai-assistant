const DEFAULT_MARGIN_RATE = 0.20;

const BRAND_MARGIN_ZONES = [
  {
    marginRate: 0.20,
    brands: [
      'BOTTEGA VENETA',
      'MAX MARA',
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
      'MONCLER',
      'ALAIA'
    ]
  },
  {
    marginRate: 0.18,
    brands: [
      'VIVIENNE WESTWOOD',
      'SELF-PORTRAIT',
      'SELF PORTRAIT',
      'HOBBS LONDON',
      'GUCCI'
    ]
  },
  {
    marginRate: 0.15,
    brands: [
      'SISTER JANE',
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

function calculatePricing({ sourceUrl, brandName, costGbp, category, productData = {}, settings = {} }) {
  const warnings = [];
  const blockingWarnings = [];
  const errors = [];
  const normalizedCost = toNumber(costGbp);
  const pricingSettings = normalizePricingSettings(settings);

  errors.push(...pricingSettings.errors);
  if (!Number.isFinite(normalizedCost)) {
    blockingWarnings.push('要確認：価格取得失敗');
  }

  const brandResult = resolveBrandMargin(brandName);
  warnings.push(...brandResult.warnings);

  const shopResult = resolveShop(sourceUrl);
  blockingWarnings.push(...shopResult.warnings);

  const categoryResult = resolveShippingCategory({ category, productData });
  blockingWarnings.push(...categoryResult.warnings);

  if (categoryResult.possibleLeatherShoes) {
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

  const internationalShippingGbp = calculateInternationalShipping(normalizedCost, categoryResult.category);
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

  const costWithShopShippingGbp = normalizedCost + shopShippingGbp;
  const customsDutyJpy = Math.ceil((normalizedCost + internationalShippingGbp) * pricingSettings.gbpJpyRate * pricingSettings.consumptionTaxRate);
  const consumptionTaxJpy = Math.ceil((normalizedCost * pricingSettings.gbpJpyRate + customsDutyJpy) * pricingSettings.consumptionTaxRate);
  const totalCostJpy = Math.ceil(
    costWithShopShippingGbp * pricingSettings.gbpJpyRate
    + internationalShippingGbp * pricingSettings.gbpJpyRate
    + customsDutyJpy
    + consumptionTaxJpy
  );
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
    customsDutyJpy,
    consumptionTaxJpy,
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

function resolveShippingCategory({ category, productData = {} }) {
  const text = [
    category,
    productData.category,
    productData.name,
    productData.description,
    Array.isArray(productData.features) ? productData.features.join(' ') : productData.features,
    productData.material,
    productData.composition
  ].filter(Boolean).join(' ').toLowerCase();

  const possibleLeatherShoes = /(shoe|shoes|boot|boots|loafer|loafers|sandal|sandals|trainer|trainers|sneaker|sneakers|靴|ブーツ|ローファー|サンダル)/i.test(text)
    && /(leather|calf|cow|suede|革|レザー|カーフ|スエード)/i.test(text);

  if (/wallet|purse|card holder|cardholder|coin|keyring|small leather goods|財布|ウォレット|カードケース|コインケース|革小物/.test(text)) {
    return { category: '革小物', possibleLeatherShoes, warnings: [] };
  }
  if (/jewellery|jewelry|earring|earrings|necklace|bracelet|ring|accessor|ジュエリー|ピアス|イヤリング|ネックレス|ブレスレット|リング|アクセサリー/.test(text)) {
    return { category: 'アクセサリー', possibleLeatherShoes, warnings: [] };
  }
  if (/bag|handbag|shoulder|tote|backpack|shoe|shoes|boot|boots|sneaker|sneakers|バッグ|鞄|ショルダー|トート|靴|ブーツ|スニーカー/.test(text)) {
    return { category: 'バッグ・靴', possibleLeatherShoes, warnings: [] };
  }
  if (/clothing|coat|jacket|dress|shirt|trouser|skirt|knit|top|アパレル|服|コート|ジャケット|ワンピース|シャツ|パンツ|スカート|ニット/.test(text)) {
    return { category: 'アパレル', possibleLeatherShoes, warnings: [] };
  }
  if (/large|luggage|suitcase|furniture|大型|ラゲージ|スーツケース/.test(text)) {
    return { category: '大型', possibleLeatherShoes, warnings: [] };
  }
  return { category: '', possibleLeatherShoes, warnings: ['要確認：カテゴリー判定'] };
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
  INTERNATIONAL_SHIPPING_GBP,
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
