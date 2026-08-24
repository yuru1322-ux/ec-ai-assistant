const path = require('path');
const { chromium } = require('playwright');
const config = require('./config');
const Status = require('./status');
const { ensureDir } = require('./utils');
const { writeErrorLog } = require('./logger');
const { getSheetsClient, readProducts, readSettings, updateStatus, writeResult } = require('./sheets');
const { scrapeProductPage, scrapeImagesFromUrl } = require('./scraper');
const { downloadImages, saveSizeGuideImage } = require('./images');
const { generateBuymaContent } = require('./openaiClient');
const { calculatePricing } = require('./pricing');

const A_COLUMN_ACCESS_FAILURE_STATUS = '要確認：A列の商品情報取得に失敗しました';

async function main() {
  await ensureDir(config.imagesDir);
  await ensureDir(config.logsDir);

  const sheets = await getSheetsClient();
  const settings = await readSettings(sheets);
  const products = await readProducts(sheets);

  if (products.length === 0) {
    console.log('処理対象の商品URLが見つかりませんでした。');
    return;
  }

  const browser = await chromium.launch({ headless: config.browser.headless });

  try {
    for (const product of products) {
      await processProduct({ browser, sheets, settings, product });
    }
  } finally {
    await browser.close();
  }
}

async function processProduct({ browser, sheets, settings, product }) {
  await updateStatus(sheets, product.rowNumber, Status.STARTING);
  const page = await browser.newPage();
  page.setDefaultTimeout(config.browser.timeoutMs);

  try {
    const infoSourceUrlRaw = String(product.infoSourceUrl || '').trim();
    const extraNotes = [];

    let scraped;
    try {
      scraped = await scrapeProductPage(page, product.url);
    } catch (error) {
      if (!infoSourceUrlRaw) throw error;
      await writeErrorLog(product.rowNumber, product.url, error).catch(() => {});
      console.error(`A列取得エラー: ${product.rowNumber}行目 ${product.url}`, error.message);
      extraNotes.push(A_COLUMN_ACCESS_FAILURE_STATUS);
      scraped = {};
    }

    if (scraped.shouldStop) {
      if (!infoSourceUrlRaw) {
        await updateStatus(sheets, product.rowNumber, scraped.status);
        console.log(`要確認: ${product.rowNumber}行目 ${product.url} ${scraped.reason || scraped.status}`);
        return;
      }
      extraNotes.push(scraped.status || scraped.reason || A_COLUMN_ACCESS_FAILURE_STATUS);
      scraped = {};
    }

    let infoSourceUrl = '';
    let infoSourceInvalid = false;
    if (infoSourceUrlRaw) {
      try {
        new URL(infoSourceUrlRaw);
        infoSourceUrl = infoSourceUrlRaw;
      } catch (_) {
        infoSourceInvalid = true;
        extraNotes.push('要確認：情報取得元URL（N列）を確認してください');
      }
    }

    // A single page instance for the N-column URL is reused for both product-data
    // scraping and image extraction below, so the URL is only ever loaded once.
    let nScraped = null;
    let infoPage = null;
    if (infoSourceUrl) {
      infoPage = await browser.newPage();
      infoPage.setDefaultTimeout(config.browser.timeoutMs);
      try {
        const infoScraped = await scrapeProductPage(infoPage, infoSourceUrl);
        if (infoScraped.shouldStop) {
          extraNotes.push(infoScraped.status || infoScraped.reason || '要確認：情報取得元URL（N列）の商品情報取得に失敗しました');
        } else {
          nScraped = infoScraped;
        }
      } catch (error) {
        await writeErrorLog(product.rowNumber, infoSourceUrl, error).catch(() => {});
        console.error(`N列取得エラー: ${product.rowNumber}行目 ${infoSourceUrl}`, error.message);
        extraNotes.push('要確認：情報取得元URL（N列）の取得に失敗しました');
      }
    }

    const merged = mergeSourceData(scraped, nScraped);

    const brand = merged.brand || product.brand;
    const productName = merged.name || '商品名未取得';

    let imageSources;
    let downloadPage = page;
    if (infoSourceUrlRaw) {
      if (infoSourceUrl && infoPage) {
        imageSources = await scrapeImagesFromUrl(infoPage, infoSourceUrl);
        downloadPage = infoPage;
      } else {
        imageSources = [];
      }
    } else {
      imageSources = scraped.imageSources || scraped.imageUrls || [];
    }

    let imagePaths;
    try {
      imagePaths = await downloadImages(downloadPage, imageSources, brand, productName, product.rowNumber);
    } finally {
      if (infoPage) {
        await infoPage.close();
      }
    }
    if (merged.sizeGuideScreenshotBase64) {
      const sizeGuidePath = await saveSizeGuideImage(product.rowNumber, merged.sizeGuideScreenshotBase64);
      if (sizeGuidePath) console.log(`サイズガイド保存: ${sizeGuidePath}`);
    }
    const imageFileNames = getImageFileNames(imagePaths);

    const generated = await generateBuymaContent({
      sourceUrl: product.url,
      sheetBrand: product.brand,
      scraped: {
        ...merged,
        brand,
        name: productName
      },
      downloadedImagePaths: imagePaths
    });

    const costResult = determineCost({ scraped: merged, manualCostRaw: product.manualCost, settings });
    if (costResult.note) extraNotes.push(costResult.note);

    const pricing = costResult.warning
      ? {
        category: merged.category || '',
        warnings: [costResult.warning],
        errors: [],
        canCalculate: false
      }
      : calculatePricing({
        sourceUrl: product.url,
        brandName: product.brand,
        costGbp: costResult.cost,
        category: merged.category,
        productData: merged,
        settings,
        manualCostCurrency: costResult.manualCostCurrency
      });
    const imageStatus = resolveImageStatus(imageFileNames.length, infoSourceUrl, infoSourceInvalid);
    const finalStatus = appendStatusMessages(getCompletionStatus(merged, imageStatus, scraped), [
      ...extraNotes,
      ...pricing.warnings,
      ...pricing.errors
    ]);
    const sheetTitle = formatSheetTitle(generated, productName);
    await writeResult(sheets, product.rowNumber, {
      cost: costResult.warning ? '' : costResult.cost,
      title: sheetTitle,
      description: [generated.description, generated.productDetails].filter(Boolean).join('\n\n'),
      imageFileNames,
      status: finalStatus,
      category: pricing.category,
      costWithShopShipping: pricing.canCalculate ? pricing.costWithShopShippingGbp : '',
      internationalShipping: pricing.canCalculate ? pricing.internationalShippingGbp : '',
      listingPrice: pricing.canCalculate ? pricing.listingPriceJpy : '',
      profitRate: pricing.canCalculate ? pricing.profitRate : ''
    });

    await updateStatus(sheets, product.rowNumber, finalStatus);
    console.log(`完了: ${product.rowNumber}行目 ${product.url}`);
  } catch (error) {
    await updateStatus(sheets, product.rowNumber, Status.ERROR_OCCURRED).catch(() => {});
    const logPath = await writeErrorLog(product.rowNumber, product.url, error);
    await writeResult(sheets, product.rowNumber, {
      cost: '',
      title: '',
      description: '',
      imageFileNames: [],
      status: `${Status.ERROR}: ${logPath}`,
      category: '',
      costWithShopShipping: '',
      internationalShipping: '',
      listingPrice: '',
      profitRate: ''
    });
    await updateStatus(sheets, product.rowNumber, Status.ERROR);
    console.error(`エラー: ${product.rowNumber}行目 ${product.url}`, error.message);
  } finally {
    await page.close();
  }
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

const MERGE_PREFER_N_FIELDS = [
  'name', 'brand', 'description', 'features', 'composition', 'material',
  'color', 'colorSource', 'dimensions', 'productCode', 'sku', 'mpn',
  'category', 'fastening', 'hardware', 'decoration', 'pockets', 'lining',
  'countryOfOrigin', 'weight', 'modelInfo', 'careInstructions'
];

function mergeSourceData(aScraped, nScraped) {
  const merged = { ...(aScraped || {}) };
  if (!nScraped) return merged;
  for (const field of MERGE_PREFER_N_FIELDS) {
    if (hasValue(nScraped[field])) {
      merged[field] = nScraped[field];
    }
  }
  // price/currency and image/size-guide fields are intentionally excluded from
  // MERGE_PREFER_N_FIELDS: the N-column page is a different shop's listing, so its
  // price is a resale price (not our cost) and its images/size-guide screenshot must
  // never be used. These always come from the A-column scrape only.
  merged.price = aScraped ? aScraped.price : undefined;
  merged.currency = aScraped ? aScraped.currency : undefined;
  return merged;
}

function formatCost(scraped) {
  if (!hasValue(scraped.price)) return '';
  const price = Number(scraped.price);
  return Number.isFinite(price) ? price : '';
}

function convertToGbp(price, currency, settings) {
  if (!hasValue(price)) return { cost: '', warning: '' };
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice)) return { cost: '', warning: '' };
  const normalizedCurrency = String(currency || '').trim().toUpperCase();
  if (!normalizedCurrency) return { cost: '', warning: '要確認：通貨判定失敗' };
  if (normalizedCurrency === 'GBP') return { cost: numericPrice, warning: '' };
  if (normalizedCurrency === 'EUR') {
    const eurGbpRate = settingNumber(settings, 'EUR_GBP_RATE');
    if (!Number.isFinite(eurGbpRate) || eurGbpRate <= 0) {
      return { cost: '', warning: '要確認：EUR/GBP為替レートを確認してください' };
    }
    return { cost: roundNumber(numericPrice * eurGbpRate, 2), warning: '' };
  }
  return { cost: '', warning: `要確認：通貨換算が必要（${normalizedCurrency}→GBP）` };
}

function getCostGbp(scraped, settings) {
  const price = formatCost(scraped);
  return convertToGbp(price, scraped.currency, settings);
}

const MANUAL_COST_UNSUPPORTED_CURRENCY_PATTERN = /円|JPY|¥|USD|\$/i;
const MANUAL_COST_EUR_PATTERN = /€|EUR|EURO|ユーロ/i;
const MANUAL_COST_GBP_PATTERN = /£|GBP|ポンド|スターリング/i;

// Below this amount, the parse is almost certainly a decimal/thousands-separator
// misread (e.g. "1.250,00" read as 1.25) rather than a genuine cost: no product
// this project lists has a real GBP/EUR cost under 5. Reject rather than risk
// silently using a near-zero cost.
const MANUAL_COST_MIN_PLAUSIBLE_AMOUNT = 5;

function parseManualCost(value) {
  const raw = String(value === undefined || value === null ? '' : value).trim();
  if (!raw) return null;
  const normalized = raw.normalize('NFKC').trim();
  if (!normalized) return null;

  if (MANUAL_COST_UNSUPPORTED_CURRENCY_PATTERN.test(normalized)) return null;
  // A minus sign would otherwise be silently stripped by the digit/separator
  // extraction below, turning a negative entry into a positive amount.
  if (normalized.includes('-')) return null;

  let currency = 'GBP';
  if (MANUAL_COST_EUR_PATTERN.test(normalized)) {
    currency = 'EUR';
  } else if (MANUAL_COST_GBP_PATTERN.test(normalized)) {
    currency = 'GBP';
  }

  const numericText = normalized.replace(/[^\d.,]/g, '');
  const amount = parseLocalizedNumber(numericText);
  if (amount === null || !Number.isFinite(amount)) return null;
  if (amount < MANUAL_COST_MIN_PLAUSIBLE_AMOUNT) return null;

  return { amount, currency };
}

function parseLocalizedNumber(text) {
  if (!text) return null;
  const hasDot = text.includes('.');
  const hasComma = text.includes(',');

  if (hasDot && hasComma) {
    const decimalChar = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
    const thousandsChar = decimalChar === ',' ? '.' : ',';
    const cleaned = text.split(thousandsChar).join('').replace(decimalChar, '.');
    return finiteOrNull(Number(cleaned));
  }

  if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const parts = text.split(sep);
    const lastPart = parts[parts.length - 1];
    const isThousandsSeparator = parts.length > 2 || lastPart.length === 3;
    const cleaned = isThousandsSeparator ? parts.join('') : text.replace(sep, '.');
    return finiteOrNull(Number(cleaned));
  }

  return finiteOrNull(Number(text));
}

function finiteOrNull(num) {
  return Number.isFinite(num) ? num : null;
}

function determineCost({ scraped, manualCostRaw, settings }) {
  const scrapeResult = getCostGbp(scraped, settings);
  if (hasValue(scrapeResult.cost)) {
    return { cost: scrapeResult.cost, warning: scrapeResult.warning, note: '', manualCostCurrency: '' };
  }

  const manualRawTrimmed = String(manualCostRaw === undefined || manualCostRaw === null ? '' : manualCostRaw).trim();
  const manual = parseManualCost(manualCostRaw);
  if (!manual) {
    if (manualRawTrimmed) {
      return { cost: '', warning: '要確認：D列の原価表記を確認してください', note: '', manualCostCurrency: '' };
    }
    return { cost: '', warning: scrapeResult.warning, note: '', manualCostCurrency: '' };
  }

  if (manual.currency === 'GBP') {
    return { cost: manual.amount, warning: '', note: '要確認：原価はD列の手入力値（GBP）を使用しました', manualCostCurrency: 'GBP' };
  }

  const eurGbpRate = settingNumber(settings, 'EUR_GBP_RATE');
  if (!Number.isFinite(eurGbpRate) || eurGbpRate <= 0) {
    return { cost: '', warning: '要確認：EUR/GBP為替レートを確認してください', note: '', manualCostCurrency: '' };
  }
  return {
    cost: roundNumber(manual.amount * eurGbpRate, 2),
    warning: '',
    note: '要確認：原価はD列の手入力値（EUR→GBP換算）を使用しました',
    manualCostCurrency: 'EUR'
  };
}

function settingNumber(settings, key) {
  if (!settings || settings[key] === undefined || settings[key] === null || String(settings[key]).trim() === '') {
    return null;
  }
  const number = Number(settings[key]);
  return Number.isFinite(number) ? number : null;
}

function roundNumber(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function getImageFileNames(imagePaths) {
  return (imagePaths || [])
    .map((imagePath) => path.basename(imagePath))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

function formatSheetTitle(generated, fallbackTitle) {
  const candidates = Array.isArray(generated.titleCandidates)
    ? generated.titleCandidates.map((title) => String(title || '').trim()).filter(Boolean)
    : [];
  const titles = candidates.length > 0 ? candidates : [generated.title || fallbackTitle];
  return Array.from(new Set(titles)).slice(0, 5).join('\n');
}

function appendStatusMessages(baseStatus, messages) {
  const seenReasons = new Set(extractStatusReasons(baseStatus));
  const uniqueMessages = (messages || [])
    .filter(hasValue)
    .filter((message, index, values) => values.indexOf(message) === index)
    .filter((message) => {
      const reasons = extractStatusReasons(message);
      if (reasons.length === 0) return true;
      const hasDuplicateReason = reasons.some((reason) => seenReasons.has(reason));
      reasons.forEach((reason) => seenReasons.add(reason));
      return !hasDuplicateReason;
    });
  if (uniqueMessages.length === 0) return baseStatus;
  return [baseStatus, ...uniqueMessages].filter(hasValue).join('\n');
}

function extractStatusReasons(message) {
  const text = String(message || '').trim();
  const normalized = text.replace(/^要確認[:：]\s*/, '').replace(/^エラー[:：]\s*/, '');
  return normalized
    .split(/[、,\n]/)
    .map((part) => part.replace(/^要確認[:：]\s*/, '').replace(/^エラー[:：]\s*/, '').trim())
    .filter(Boolean);
}

function resolveImageStatus(imageFileNameCount, infoSourceUrl, infoSourceInvalid) {
  if (imageFileNameCount > 0) return { missingMessage: '' };
  // An invalid N-column URL is already reported separately; avoid a redundant note.
  if (infoSourceInvalid) return { missingMessage: '' };
  if (infoSourceUrl) return { missingMessage: '情報取得元URL（N列）から画像取得失敗' };
  return { missingMessage: '商品画像取得失敗' };
}

function getCompletionStatus(scraped, imageStatus, aColumnScraped) {
  // A soft failure (HTTP 200 with a bot-challenge page, a region redirect to
  // an unrelated page, etc.) can leave every A-column field empty without
  // ever setting shouldStop. Detect that by result (name/price/images all
  // empty on the A-column scrape itself) rather than by matching specific
  // causes. Skipped when the N-column already supplied a usable name, since
  // that row is still workable and the A-column failure is already noted
  // separately via extraNotes.
  if (isAColumnResultEmpty(aColumnScraped) && !hasValue(scraped.name)) {
    return A_COLUMN_ACCESS_FAILURE_STATUS;
  }

  const checks = [
    ['商品名取得失敗', scraped.name],
    ['商品説明取得失敗', scraped.description],
    ['Features取得失敗', scraped.features],
    ['素材取得失敗', scraped.composition || scraped.material],
    ['カラー取得失敗', scraped.color],
    ['価格取得失敗', scraped.price],
    ['商品コード取得失敗', scraped.productCode || scraped.sku || scraped.mpn]
  ];
  const missing = checks
    .filter(([, value]) => !hasValue(value))
    .map(([message]) => message);

  if (imageStatus && imageStatus.missingMessage) {
    missing.push(imageStatus.missingMessage);
  }

  if (missing.length > 0) {
    return `要確認：${missing.join('、')}`;
  }
  if (!hasUsableDimensions(scraped)) {
    return '完了（サイズ情報なし）';
  }
  return Status.COMPLETE;
}

function isAColumnResultEmpty(aColumnScraped) {
  if (!aColumnScraped) return true;
  const hasName = hasValue(aColumnScraped.name);
  const hasPrice = hasValue(aColumnScraped.price);
  const hasImages = hasValue(aColumnScraped.imageUrls) || hasValue(aColumnScraped.imageSources);
  return !hasName && !hasPrice && !hasImages;
}

function hasUsableDimensions(scraped) {
  if (!hasValue(scraped.dimensions)) return false;
  const dimensions = String(scraped.dimensions).trim();
  const category = String(scraped.category || '').toLowerCase();
  if (/^size\s+[a-z0-9]+$/i.test(dimensions) && /clothing|apparel|coats|jackets|dress|shirt|trouser|skirt/.test(category)) {
    return false;
  }
  return true;
}

main().catch(async (error) => {
  await writeErrorLog('startup', '', error).catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
