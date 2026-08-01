const HOBBS_HOSTS = new Set(['hobbs.com', 'www.hobbs.com']);
const HIGH_RES_WARNING_WIDTH = 2000;
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
  'fastening',
  'hardware',
  'decoration',
  'pockets',
  'lining',
  'modelInfo',
  'careInstructions',
  'returnNotes',
  'category'
];

function isHobbsLondonUrl(url) {
  try {
    const parsed = new URL(url);
    return HOBBS_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

async function extractHobbsLondonImages(page) {
  const candidates = await page.evaluate(() => {
    const absoluteUrl = (value) => {
      if (!value) return '';
      try {
        return new URL(value, location.href).href;
      } catch (_) {
        return '';
      }
    };

    return Array.from(document.querySelectorAll('.primary-images .main-gallery-inner img.primary-images__image'))
      .map((img, index) => ({
        order: index + 1,
        alt: img.getAttribute('alt') || '',
        sourceUrl: absoluteUrl(img.currentSrc || img.getAttribute('src')),
        src: absoluteUrl(img.getAttribute('src')),
        currentSrc: absoluteUrl(img.currentSrc),
        selector: '.primary-images .main-gallery-inner img.primary-images__image'
      }))
      .filter((item) => item.sourceUrl);
  });

  const seen = new Set();
  return candidates
    .map((candidate) => {
      const highQualityUrl = toHobbsHighQualityUrl(candidate.sourceUrl);
      return {
        ...candidate,
        url: highQualityUrl,
        canonicalKey: canonicalHobbsImageKey(highQualityUrl),
        role: candidate.order === 1 ? 'main' : 'sub',
        warningWidth: HIGH_RES_WARNING_WIDTH
      };
    })
    .filter((candidate) => {
      if (seen.has(candidate.canonicalKey)) return false;
      seen.add(candidate.canonicalKey);
      return true;
    });
}

async function extractHobbsLondonProductDetails(page, pageUrl) {
  return page.evaluate(({ pageUrl, detailFields }) => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const unique = (values) => {
      const seen = new Set();
      return values.filter((value) => {
        const key = clean(value).toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const meta = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const value = clean(element && element.getAttribute('content'));
        if (value) return value;
      }
      return '';
    };
    const textBySelector = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const value = clean(element && (element.innerText || element.textContent));
        if (value) return value;
      }
      return '';
    };
    const htmlToText = (html) => {
      const element = document.createElement('div');
      element.innerHTML = html || '';
      return clean(element.textContent);
    };
    const normalizePrice = (value) => {
      const price = Number(String(value || '').replace(/[^\d.]/g, ''));
      return Number.isFinite(price) && price > 0 ? price : null;
    };

    const getJsonLdProducts = () => Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .flatMap((script) => {
        try {
          const parsed = JSON.parse(script.textContent || '{}');
          if (Array.isArray(parsed)) return parsed;
          if (Array.isArray(parsed['@graph'])) return parsed['@graph'];
          return [parsed];
        } catch (_) {
          return [];
        }
      })
      .filter((item) => {
        const type = item && item['@type'];
        return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
      });

    const jsonLd = getJsonLdProducts()[0] || {};
    const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers || {};
    const jsonBrand = typeof jsonLd.brand === 'string' ? jsonLd.brand : clean(jsonLd.brand && jsonLd.brand.name);
    const detailsItems = Array.from(document.querySelectorAll('#collapseDetails li'))
      .map((item) => clean(item.innerText || item.textContent))
      .filter(Boolean);
    const detailsParagraphs = Array.from(document.querySelectorAll('#collapseDetails p'))
      .map((item) => clean(item.innerText || item.textContent))
      .filter(Boolean);
    const fabricItems = Array.from(document.querySelectorAll('#collapseDescription li'))
      .map((item) => clean(item.innerText || item.textContent))
      .filter(Boolean);
    const breadcrumbItems = unique(Array.from(document.querySelectorAll(
      '.breadcrumb-top a, .breadcrumb-bottom a, .product-detail__breadcrumb a, .product-breadcrumb a, .breadcrumb a, .breadcrumb-item a'
    )).map((item) => clean(item.innerText || item.textContent)));

    const extractByPrefix = (values, prefixes) => {
      for (const value of values) {
        for (const prefix of prefixes) {
          const match = value.match(new RegExp(`^${prefix}\\s*[:：]\\s*(.+)$`, 'i'));
          if (match && clean(match[1])) return clean(match[1]);
        }
      }
      return '';
    };
    const description = detailsParagraphs.find((item) => !/^(length|model|product code)\s*[:：]/i.test(item) && !/^model is\b/i.test(item))
      || htmlToText(jsonLd.description)
      || meta(['meta[name="description"]', 'meta[property="og:description"]']);
    const dimensions = detailsParagraphs
      .filter((item) => /^(length|height|width|depth|drop|diameter)\s*[:：]/i.test(item))
      .join('\n');
    const modelInfo = detailsParagraphs.find((item) => /^model is\b/i.test(item)) || '';
    const productCodeFromDom = extractByPrefix(detailsParagraphs, ['Product Code']);
    const composition = extractComposition(fabricItems);
    const material = extractMaterial(composition || clean(jsonLd.material));
    const colorDom = textBySelector(['.product-detail__attribute--color .product-detail__attribute__display-value']);
    const colorSelect = textBySelector(['select[id*="color" i] option:checked']);
    const priceDom = textBySelector([
      '.product-detail__prices .sales .value',
      '.product-detail__prices .price .value',
      '.product-detail__prices .price',
      '.price_rating .price'
    ]);
    const name = textBySelector(['h1.product-detail__product-name']) || clean(jsonLd.name) || meta(['meta[property="og:title"]']);
    const categoryFromBreadcrumb = breadcrumbItems.length
      ? breadcrumbItems
        .filter((item) => !/^home$/i.test(item))
        .filter((item) => clean(item).toLowerCase() !== clean(name).toLowerCase())
        .join(' > ')
      : '';
    const categoryFromUrl = parseCategoryFromUrl(pageUrl || location.href);
    const sku = clean(jsonLd.sku);
    const mpn = clean(jsonLd.mpn);
    const price = normalizePrice(offer.price)
      || normalizePrice(meta(['meta[property="og:product:price:amount"]']))
      || normalizePrice(priceDom);
    const currency = clean(offer.priceCurrency)
      || meta(['meta[property="og:product:price:currency"]'])
      || (priceDom.includes('£') ? 'GBP' : '');

    const result = {
      name,
      brand: jsonBrand || 'Hobbs London',
      price,
      currency,
      color: clean(colorDom) || clean(colorSelect) || clean(jsonLd.color),
      description,
      features: unique(detailsItems),
      composition,
      material,
      dimensions,
      weight: '',
      productCode: productCodeFromDom || sku || mpn || parseProductCodeFromUrl(pageUrl || location.href),
      sku,
      mpn,
      countryOfOrigin: '',
      fastening: detailsItems.filter((item) => /\b(fastening|closure|zip|button)\b/i.test(item)).join('\n'),
      hardware: '',
      decoration: detailsItems.filter((item) => /\b(print|sequin|embellish|motif|floral|jacquard)\b/i.test(item)).join('\n'),
      pockets: detailsItems.filter((item) => /\bpocket\b/i.test(item)).join('\n'),
      lining: fabricItems.filter((item) => /\blined|lining|unlined\b/i.test(item)).join('\n'),
      modelInfo,
      careInstructions: extractCareInstructions(fabricItems),
      returnNotes: '',
      category: categoryFromBreadcrumb || categoryFromUrl,
      detailSource: 'hobbs-london',
      extractionLog: {
        color: {
          value: clean(colorDom) || clean(colorSelect) || clean(jsonLd.color),
          source: colorDom ? 'selected-color-display' : colorSelect ? 'selected-color-option' : clean(jsonLd.color) ? 'json-ld' : ''
        }
      },
      warnings: []
    };

    if (currency && currency !== 'GBP') {
      result.warnings.push(`Hobbs London page currency is not GBP: ${currency}`);
    }

    for (const field of detailFields) {
      if (!(field in result)) result[field] = '';
    }
    result.rawBlocks = {
      details: detailsParagraphs.concat(detailsItems),
      fabric: fabricItems,
      breadcrumbs: breadcrumbItems
    };
    return result;

    function extractComposition(items) {
      const compositionItems = [];
      for (const item of items) {
        if (/^care\s*[:：]?/i.test(item) || /^machine wash$/i.test(item)) continue;
        const value = item.replace(/^composition\s*[:：]?\s*/i, '').trim();
        if (/^(fabric|composition|lining|shell|outer|main)\s*[:：]/i.test(value) || /\d+(?:\.\d+)?\s*%/.test(value) || /\bunlined\b/i.test(value)) {
          compositionItems.push(value);
        }
      }
      return unique(compositionItems).join('\n');
    }

    function extractMaterial(value) {
      const text = String(value || '').trim();
      if (!text) return '';
      return unique(text
        .split(/\n+/)
        .map((line) => line.replace(/^(fabric|composition|lining|shell|outer|main)\s*[:：]\s*/i, ''))
        .map((line) => line.replace(/\b\d+(?:\.\d+)?\s*%/g, ''))
        .map(clean)
        .filter((line) => line && !/^unlined$/i.test(line)))
        .join('\n') || text;
    }

    function extractCareInstructions(items) {
      const careIndex = items.findIndex((item) => /^care\s*[:：]?$/i.test(item));
      if (careIndex >= 0) return clean(items.slice(careIndex + 1).join('\n'));
      return extractByPrefix(items, ['Care']);
    }

    function parseProductCodeFromUrl(url) {
      try {
        const filename = new URL(url).pathname.split('/').pop() || '';
        const match = filename.match(/([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{7})/i);
        return match ? match[1].toUpperCase() : '';
      } catch (_) {
        return '';
      }
    }

    function parseCategoryFromUrl(url) {
      try {
        const parts = new URL(url).pathname.split('/').filter(Boolean);
        const productIndex = parts.indexOf('product');
        if (productIndex >= 0 && parts[productIndex + 1]) {
          return parts[productIndex + 1].replace(/-/g, ' ');
        }
      } catch (_) {}
      return '';
    }
  }, { pageUrl, detailFields: DETAIL_FIELDS });
}

function toHobbsHighQualityUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    if (parsed.hostname === 'assets.hobbs.com' && parsed.pathname.startsWith('/i/hobbs/')) {
      parsed.search = '';
      parsed.searchParams.set('fmt', 'jpg');
      parsed.searchParams.set('qlt', '95');
      parsed.searchParams.set('wid', '2000');
      return parsed.href;
    }

    parsed.searchParams.set('fmt', 'jpg');
    parsed.searchParams.set('qlt', '95');
    parsed.searchParams.set('wid', '2000');
    return parsed.href;
  } catch (_) {
    return imageUrl;
  }
}

function canonicalHobbsImageKey(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    const filename = (parsed.pathname.split('/').pop() || parsed.pathname)
      .replace(/-swatch$/i, '')
      .replace(/_0?(\d+).*$/i, '_$1');
    return `${parsed.hostname}${parsed.pathname.replace(/_0?(\d+).*$/i, '_$1')}::${filename}`;
  } catch (_) {
    return imageUrl.split('?')[0];
  }
}

module.exports = {
  HIGH_RES_WARNING_WIDTH,
  isHobbsLondonUrl,
  extractHobbsLondonProductDetails,
  extractHobbsLondonImages,
  toHobbsHighQualityUrl,
  canonicalHobbsImageKey
};
