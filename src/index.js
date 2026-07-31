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

    await writeResult(sheets, product.rowNumber, {
      title: [generated.title, ...(generated.titleCandidates || [])]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join('\n'),
      description: [generated.description, generated.productDetails].filter(Boolean).join('\n\n'),
      imagePrompt: generated.imagePrompt,
      imagePaths,
      status: Status.SUCCESS
    });

    await updateStatus(sheets, product.rowNumber, Status.COMPLETE);
    console.log(`完了: ${product.rowNumber}行目 ${product.url}`);
  } catch (error) {
    await updateStatus(sheets, product.rowNumber, Status.ERROR_OCCURRED).catch(() => {});
    const logPath = await writeErrorLog(product.rowNumber, product.url, error);
    await writeResult(sheets, product.rowNumber, {
      title: '',
      description: '',
      imagePrompt: '',
      imagePaths: [],
      status: `${Status.ERROR}: ${logPath}`
    });
    await updateStatus(sheets, product.rowNumber, Status.ERROR);
    console.error(`エラー: ${product.rowNumber}行目 ${product.url}`, error.message);
  } finally {
    await page.close();
  }
}

main().catch(async (error) => {
  await writeErrorLog('startup', '', error).catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
