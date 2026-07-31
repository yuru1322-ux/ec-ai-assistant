const { chromium } = require('playwright');
const config = require('./config');
const Status = require('./status');
const { ensureDir } = require('./utils');
const { writeErrorLog } = require('./logger');
const { getSheetsClient, readProducts, updateStatus, writeResult } = require('./sheets');
const { scrapeProductPage } = require('./scraper');
const { downloadImages } = require('./images');
const { generateBuymaContent } = require('./openaiClient');

async function main() {
  await ensureDir(config.imagesDir);
  await ensureDir(config.logsDir);

  const sheets = await getSheetsClient();
  const products = await readProducts(sheets);

  if (products.length === 0) {
    console.log('処理対象の商品URLが見つかりませんでした。');
    return;
  }

  const browser = await chromium.launch({ headless: config.browser.headless });

  try {
    for (const product of products) {
      await processProduct({ browser, sheets, product });
    }
  } finally {
    await browser.close();
  }
}

async function processProduct({ browser, sheets, product }) {
  await updateStatus(sheets, product.rowNumber, Status.STARTING);
  const page = await browser.newPage();
  page.setDefaultTimeout(config.browser.timeoutMs);

  try {
    const scraped = await scrapeProductPage(page, product.url);
    const brand = scraped.brand || product.brand;
    const productName = scraped.name || '商品名未取得';
    const imagePaths = await downloadImages(page, scraped.imageSources || scraped.imageUrls || [], brand, productName, product.rowNumber);

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

    const finalStatus = getCompletionStatus(scraped);
    await writeResult(sheets, product.rowNumber, {
      title: productName,
      description: [generated.description, generated.productDetails].filter(Boolean).join('\n\n'),
      imagePaths,
      status: finalStatus
    });

    await updateStatus(sheets, product.rowNumber, finalStatus);
    console.log(`完了: ${product.rowNumber}行目 ${product.url}`);
  } catch (error) {
    await updateStatus(sheets, product.rowNumber, Status.ERROR_OCCURRED).catch(() => {});
    const logPath = await writeErrorLog(product.rowNumber, product.url, error);
    await writeResult(sheets, product.rowNumber, {
      title: '',
      description: '',
      imagePaths: [],
      status: `${Status.ERROR}: ${logPath}`
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

function getCompletionStatus(scraped) {
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
