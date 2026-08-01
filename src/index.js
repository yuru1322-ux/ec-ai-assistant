const path = require('path');
const { chromium } = require('playwright');
const config = require('./config');
const Status = require('./status');
const { ensureDir } = require('./utils');
const { writeErrorLog } = require('./logger');
const { getSheetsClient, readProducts, readSettings, updateStatus, writeResult } = require('./sheets');
const { scrapeProductPage } = require('./scraper');
const { downloadImages } = require('./images');
const { generateBuymaContent } = require('./openaiClient');
const { calculatePricing } = require('./pricing');

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
    const scraped = await scrapeProductPage(page, product.url);
    const brand = scraped.brand || product.brand;
    const productName = scraped.name || '商品名未取得';
    const imagePaths = await downloadImages(page, scraped.imageSources || scraped.imageUrls || [], brand, productName, product.rowNumber);
    const imageFileNames = getImageFileNames(imagePaths);

    const generated = await generateBuymaContent({
      sourceUrl: product.url,
      sheetBrand: product.brand,
      scraped: {
        ...scraped,
        brand,
        name: productName
      },
      downloadedImagePaths: imagePaths
    });

    const pricing = calculatePricing({
      sourceUrl: product.url,
      brandName: product.brand,
      costGbp: formatCost(scraped),
      category: scraped.category,
      productData: scraped,
      settings
    });
    const finalStatus = appendStatusMessages(getCompletionStatus(scraped), [
      ...pricing.warnings,
      ...pricing.errors
    ]);
    await writeResult(sheets, product.rowNumber, {
      cost: formatCost(scraped),
      title: productName,
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

function formatCost(scraped) {
  if (!hasValue(scraped.price)) return '';
  const price = Number(scraped.price);
  return Number.isFinite(price) ? price : '';
}

function getImageFileNames(imagePaths) {
  return (imagePaths || [])
    .map((imagePath) => path.basename(imagePath))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
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

function getCompletionStatus(scraped) {
  const checks = [
    ['商品名取得失敗', scraped.name],
    ['商品説明取得失敗', scraped.description],
    ['Features取得失敗', scraped.features],
    ['素材取得失敗', scraped.composition || scraped.material],
    ['カラー取得失敗', scraped.color],
    ['価格取得失敗', scraped.price],
    ['商品コード取得失敗', scraped.productCode || scraped.sku || scraped.mpn],
    ['商品画像取得失敗', scraped.imageSources]
  ];
  const missing = checks
    .filter(([, value]) => !hasValue(value))
    .map(([message]) => message);

  if (missing.length > 0) {
    return `要確認：${missing.join('、')}`;
  }
  if (!hasUsableDimensions(scraped)) {
    return '完了（サイズ情報なし）';
  }
  return Status.COMPLETE;
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
