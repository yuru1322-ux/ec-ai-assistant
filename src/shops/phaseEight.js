const PHASE_EIGHT_HOSTS = new Set(['phase-eight.com', 'www.phase-eight.com']);
const PHASE_EIGHT_IMAGE_FAILURE_STATUS = '要確認：商品画像取得失敗';
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

function isPhaseEightUrl(url) {
  try {
    const parsed = new URL(url);
    return PHASE_EIGHT_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

async function extractPhaseEightProductDetails(page, pageUrl) {
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
    const allTextContentBySelector = (selectors) => unique(selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .map((element) => clean(element && element.textContent))
      .filter(Boolean))
      .join(' ');
    const normalizePrice = (value) => {
      const price = Number(String(value || '').replace(/[^\d.]/g, ''));
      return Number.isFinite(price) && price > 0 ? price : null;
    };

    const jsonLd = getJsonLdProduct();
    const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers || {};
    const seller = offer.seller || {};
    const productArea = textBySelector([
      '.product-detail',
      '.product-details',
      '[data-pid]',
      '.pdp-main',
      '.product'
    ]);
    const pageText = clean(document.body && (document.body.innerText || document.body.textContent));
    const accordionText = textBySelector([
      '.product-detail__accordion',
      '.product-details__accordion',
      '.accordion',
      '[class*="accordion"]'
    ]);
    const materialText = allTextContentBySelector([
      '.product-desc-tab-body',
      '.collapse',
      '.card'
    ]);
    const color = extractSelectedColor() || extractColorFromText(productArea) || clean(jsonLd.color);
    const featureLines = extractFeatureLines(productArea);
    const composition = extractComposition([materialText, productArea, accordionText, pageText].filter(Boolean).join(' '));
    const material = extractMaterial(composition || clean(jsonLd.material));
    const description = extractDescription(productArea)
      || htmlToText(jsonLd.description)
      || meta(['meta[name="description"]', 'meta[property="og:description"]']);
    const sku = clean(jsonLd.sku);
    const mpn = clean(jsonLd.mpn);
    const styleCode = extractLabelValue(productArea, ['Style code', 'Style Code', 'Product code', 'Product Code']);
    const breadcrumbItems = unique(Array.from(document.querySelectorAll(
      '.breadcrumb a, .breadcrumbs a, [class*="breadcrumb"] a'
    )).map((element) => clean(element.innerText || element.textContent)));
    const breadcrumbCategory = breadcrumbItems.length
      ? breadcrumbItems
        .filter((item) => !/^home$/i.test(item))
        .filter((item) => clean(item).toLowerCase() !== clean(jsonLd.name).toLowerCase())
        .join(' > ')
      : '';
    const inferredCategory = inferCategoryFromName(jsonLd.name);
    const category = isWeakCategory(breadcrumbCategory)
      ? inferredCategory || parseCategoryFromUrl(pageUrl || location.href) || breadcrumbCategory
      : breadcrumbCategory || parseCategoryFromUrl(pageUrl || location.href) || inferredCategory;
    const priceDom = textBySelector([
      '.product-detail__price',
      '.product-detail__prices',
      '.price',
      '[class*="price"]'
    ]);
    const price = normalizePrice(offer.price)
      || normalizePrice(meta(['meta[property="og:product:price:amount"]']))
      || normalizePrice(priceDom);
    const currency = clean(offer.priceCurrency)
      || meta(['meta[property="og:product:price:currency"]'])
      || (priceDom.includes('£') ? 'GBP' : '');

    const result = {
      name: clean(jsonLd.name) || textBySelector(['h1']) || meta(['meta[property="og:title"]']),
      brand: clean(seller.name) || 'Phase Eight',
      price,
      currency,
      color,
      description,
      features: featureLines,
      composition,
      material,
      dimensions: featureLines.filter((line) => /^(length|height|width|depth|drop|diameter|shoulder|hem|waist|bust|hip)\s*[:：]/i.test(line)).join('\n'),
      weight: '',
      productCode: sku || mpn || styleCode || parseProductCodeFromUrl(pageUrl || location.href),
      sku,
      mpn,
      countryOfOrigin: '',
      fastening: featureLines.filter((line) => /\bfastening|closure|zip|button\b/i.test(line)).join('\n'),
      hardware: '',
      decoration: featureLines.filter((line) => /\bprint|petal|abstract|floral|stripe|lace|sequin|embellish\b/i.test(line)).join('\n'),
      pockets: featureLines.filter((line) => /\bpocket\b/i.test(line)).join('\n'),
      lining: [composition, ...featureLines].filter((line) => /\blining|lined\b/i.test(line)).join('\n'),
      modelInfo: featureLines.find((line) => /\bmodel\b/i.test(line)) || '',
      careInstructions: extractLabelValue(productArea, ['Care']) || featureLines.filter((line) => /\bwash|clean|care\b/i.test(line)).join('\n'),
      returnNotes: '',
      category,
      detailSource: 'phase-eight',
      extractionLog: {
        color: {
          value: color,
          source: color ? 'selected-color-or-product-text' : ''
        }
      },
      rawBlocks: {
        productArea,
        accordionText,
        materialText,
        breadcrumb: breadcrumbItems
      },
      warnings: []
    };

    if (currency && currency !== 'GBP') {
      result.warnings.push(`Phase Eight page currency is not GBP: ${currency}`);
    }

    for (const field of detailFields) {
      if (!(field in result)) result[field] = '';
    }
    return result;

    function getJsonLdProduct() {
      return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
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
        .find((item) => {
          const type = item && item['@type'];
          return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
        }) || {};
    }

    function htmlToText(value) {
      const element = document.createElement('div');
      element.innerHTML = value || '';
      return clean(element.textContent);
    }

    function extractSelectedColor() {
      const selectors = [
        '.product-detail__attribute__value.attribute_current[data-attr="color"]',
        '[data-attr="color"].attribute_current',
        '[data-attr="color"][aria-checked="true"]',
        '[data-attr="color"][data-selected="true"]',
        '[data-attr="color"][data-attr-value]'
      ];
      const attrNames = ['data-attr-value', 'data-value', 'data-tippy-content', 'aria-label', 'title'];
      for (const selector of selectors) {
        for (const element of Array.from(document.querySelectorAll(selector))) {
          const value = attrNames.map((name) => element.getAttribute(name)).find((item) => clean(item))
            || clean(element.innerText || element.textContent);
          if (value && !/colour|color|select/i.test(value)) return clean(value);
        }
      }
      return '';
    }

    function extractColorFromText(value) {
      const match = clean(value).match(/\b(?:Color|Colour)\s*[:：]?\s*([A-Z][A-Za-z /-]+?)(?:\s+Size\b|\s+Size Guide\b|\s+ADD TO BAG\b|$)/i);
      return match ? clean(match[1]) : '';
    }

    function extractDescription(value) {
      const text = clean(value);
      const marker = text.search(/\bSize Fit\b/i);
      if (marker > 0) {
        const before = text.slice(0, marker);
        const fitIndex = before.search(/\bFIT\b/i);
        return clean(fitIndex >= 0 ? before.slice(fitIndex + 3) : before);
      }
      const match = text.match(/\bFIT\s+(.+?)(?:\s+Size Fit\b|\s+MATERIAL\b|\s+DELIVERY\b|$)/i);
      return match ? clean(match[1]) : '';
    }

    function extractFeatureLines(value) {
      const text = clean(value);
      const features = [];
      const patterns = [
        /\bSize Fit\s*[:：]?\s*([A-Za-z ]+?)(?=\s+Length\b|\s+Other details\b|\s+Fastening\b|\s+Sleeve length\b|$)/i,
        /\bLength\s*[:：]?\s*([0-9.]+\s*cm(?:\s+Side neck point to hem)?)(?=\s+Other details\b|\s+Fastening\b|\s+Sleeve length\b|$)/i,
        /\bFastening\s*[:：]?\s*([A-Za-z -]+?)(?=\s+Sleeve length\b|\s+Style code\b|\s+MATERIAL\b|$)/i,
        /\bSleeve length\s*[:：]?\s*([A-Za-z -]+?)(?=\s+Style code\b|\s+MATERIAL\b|$)/i
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && clean(match[1])) {
          const label = pattern.source.includes('Size Fit') ? 'Size Fit'
            : pattern.source.includes('Length') ? 'Length'
              : pattern.source.includes('Fastening') ? 'Fastening'
                : 'Sleeve length';
          features.push(`${label}: ${clean(match[1])}`);
        }
      }
      return unique(features);
    }

    function extractComposition(value) {
      const text = clean(value);
      const items = [];
      const composition = text.match(/\bComposition\s*[:：]?\s*([A-Za-z ]+\s+\d+(?:\.\d+)?%)/i);
      if (composition && clean(composition[1])) items.push(`Composition: ${clean(composition[1])}`);
      const lining = text.match(/\bLining\s*[:：]?\s*([A-Za-z ]+\s+\d+(?:\.\d+)?%)/i);
      if (lining && clean(lining[1])) items.push(`Lining: ${clean(lining[1])}`);
      return unique(items.map((item) => item.replace(/\s+Care:.+$/i, '').trim())).join('\n');
    }

    function extractMaterial(value) {
      const text = clean(value);
      if (!text) return '';
      return unique(text
        .replace(/\b(Composition|Lining)\s*[:：]/ig, '')
        .split(/\b\d+(?:\.\d+)?\s*%/g)
        .map(clean)
        .filter(Boolean)).join(', ') || text;
    }

    function extractLabelValue(value, labels) {
      const text = clean(value);
      for (const label of labels) {
        const match = text.match(new RegExp(`\\b${escapeRegex(label)}\\s*[:：]?\\s*([^]+?)(?=\\s+[A-Z][A-Za-z ]+\\s*[:：]|\\s+MATERIAL\\b|\\s+DELIVERY\\b|$)`, 'i'));
        if (match && clean(match[1])) return clean(match[1]);
      }
      return '';
    }

    function parseCategoryFromUrl(value) {
      try {
        const parsed = new URL(value);
        return parsed.pathname.split('/').filter(Boolean).slice(0, -1).join(' > ');
      } catch (_) {
        return '';
      }
    }

    function inferCategoryFromName(value) {
      if (/\bdress|gown\b/i.test(value || '')) return 'Clothing > Dresses';
      if (/\bshirt|top|blouse|t-shirt|tee\b/i.test(value || '')) return 'Clothing > Tops';
      if (/\bskirt\b/i.test(value || '')) return 'Clothing > Skirts';
      if (/\bjacket|coat\b/i.test(value || '')) return 'Clothing > Jackets';
      if (/\btrouser|pants|jeans|jumpsuit\b/i.test(value || '')) return 'Clothing';
      return '';
    }

    function isWeakCategory(value) {
      return !value || /^(new in|sale|home)$/i.test(clean(value));
    }

    function parseProductCodeFromUrl(value) {
      try {
        const filename = new URL(value).pathname.split('/').pop() || '';
        return clean((filename.match(/-(\d+)\.html$/) || [])[1]);
      } catch (_) {
        return '';
      }
    }

    function escapeRegex(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }, { pageUrl, detailFields: DETAIL_FIELDS });
}

async function extractPhaseEightImages(page) {
  const candidates = await page.evaluate(() => {
    const absoluteUrl = (value) => {
      if (!value) return '';
      try {
        return new URL(String(value).startsWith('//') ? `https:${value}` : value, location.href).href;
      } catch (_) {
        return '';
      }
    };
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const currentName = clean(document.querySelector('h1') && document.querySelector('h1').textContent);
    const urlProductId = (() => {
      const filename = location.pathname.split('/').pop() || '';
      const match = filename.match(/-(\d+)\.html$/);
      return match ? match[1] : '';
    })();
    const normalizeKey = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const productNodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
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

    const productWithImages = productNodes
      .map((product, nodeIndex) => {
        const images = Array.isArray(product.image) ? product.image : [product.image].filter(Boolean);
        return {
          product,
          nodeIndex,
          images,
          score: scoreProductNode(product, images)
        };
      })
      .filter((item) => item.images.length > 0)
      .sort((a, b) => b.score - a.score || a.nodeIndex - b.nodeIndex)[0];

    const sourceItems = productWithImages
      ? productWithImages.images.map((imageUrl, index) => ({
        order: index + 1,
        sourceUrl: absoluteUrl(String(imageUrl).replace(/&amp;/g, '&')),
        alt: productWithImages.product.name || '',
        selector: 'json-ld-image'
      }))
      : extractGalleryImages();

    return sourceItems
      .map((imageUrl, index) => ({
        order: imageUrl.order || index + 1,
        sourceUrl: absoluteUrl(String(imageUrl.sourceUrl || '').replace(/&amp;/g, '&')),
        alt: imageUrl.alt || '',
        selector: imageUrl.selector || ''
      }))
      .filter((item) => item.sourceUrl)
      .filter((item) => !/logo|icon|navigation|banner|recommend|related|footer|header/i.test(`${item.sourceUrl} ${item.alt}`));

    function scoreProductNode(product, images) {
      let score = images.length;
      const nameKey = normalizeKey(product.name);
      const currentNameKey = normalizeKey(currentName);
      const sku = clean(product.sku);
      const mpn = clean(product.mpn);
      const imageText = images.join(' ');

      if (currentNameKey && nameKey && (nameKey === currentNameKey || nameKey.includes(currentNameKey) || currentNameKey.includes(nameKey))) {
        score += 50;
      }
      if (urlProductId && imageText.includes(urlProductId)) score += 40;
      if (sku && imageText.includes(sku)) score += 20;
      if (mpn && imageText.includes(mpn)) score += 20;
      if (images.some((image) => /\/dw\/image\/v2\//i.test(image))) score += 10;
      return score;
    }

    function extractGalleryImages() {
      return Array.from(document.querySelectorAll('.primary-images .main-gallery-inner img.primary-images__image'))
        .filter((image) => !image.matches('.thumb, .primary-images .thumb-carousel img, .primary-images img.thumb'))
        .map((image, index) => ({
          order: index + 1,
          sourceUrl: image.getAttribute('src') || image.currentSrc || image.getAttribute('data-src') || '',
          alt: image.getAttribute('alt') || currentName,
          selector: 'phase-eight-gallery'
        }));
    }
  });

  const seen = new Set();
  return candidates
    .map((candidate) => {
      const highQualityUrl = toPhaseEightHighQualityUrl(candidate.sourceUrl);
      return {
        ...candidate,
        url: highQualityUrl,
        canonicalKey: canonicalPhaseEightImageKey(highQualityUrl),
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

function toPhaseEightHighQualityUrl(imageUrl) {
  try {
    const parsed = new URL(String(imageUrl).replace(/&amp;/g, '&'));
    if (parsed.pathname.includes('/dw/image/v2/')) {
      parsed.searchParams.set('sw', '2000');
      parsed.searchParams.set('sh', '2800');
    }
    return parsed.href;
  } catch (_) {
    return imageUrl;
  }
}

function canonicalPhaseEightImageKey(imageUrl) {
  try {
    const parsed = new URL(String(imageUrl).replace(/&amp;/g, '&'));
    parsed.search = '';
    return `${parsed.hostname}${parsed.pathname}`;
  } catch (_) {
    return String(imageUrl || '').split('?')[0];
  }
}

module.exports = {
  PHASE_EIGHT_IMAGE_FAILURE_STATUS,
  HIGH_RES_WARNING_WIDTH,
  isPhaseEightUrl,
  extractPhaseEightProductDetails,
  extractPhaseEightImages,
  toPhaseEightHighQualityUrl,
  canonicalPhaseEightImageKey
};
