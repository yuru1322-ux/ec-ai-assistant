const ZALANDO_HOST_PATTERN = /(^|\.)zalando\.[a-z.]+$/i;
const ZALANDO_PAGE_FAILURE_STATUS = '要確認：Zalandoページ取得失敗';
const ZALANDO_IMAGE_FAILURE_STATUS = '要確認：商品画像取得失敗';
const PRODUCT_IMAGE_HOST = 'img01.ztat.net';
const PRODUCT_IMAGE_PATH_MARKER = '/article/spp-media-';

function isZalandoUrl(url) {
  try {
    const parsed = new URL(url);
    return ZALANDO_HOST_PATTERN.test(parsed.hostname);
  } catch (_) {
    return false;
  }
}

async function inspectZalandoPage(page, url, timeoutMs) {
  let response = null;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
  } catch (error) {
    if (String(error.message || '').includes('Timeout')) {
      return zalandoStopResult('page.goto timeout');
    }
    throw error;
  }

  const status = response && response.status();
  if (status === 403 || status === 503) {
    return zalandoStopResult(`HTTP ${status}`);
  }

  const pageState = await page.evaluate(() => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const bodyText = clean(document.body && document.body.innerText);
    const productRoot = findProductRoot();

    return {
      hasProductMain: Boolean(productRoot && /(material|details|article number|colour|color|€|£)/i.test(clean(productRoot.innerText || productRoot.textContent))),
      currency: normalizeCurrency([
        meta(['meta[property="product:price:currency"]', 'meta[property="og:product:price:currency"]']),
        textBySelector(['[itemprop="priceCurrency"]']),
        bodyText.includes('€') ? 'EUR' : '',
        bodyText.includes('£') ? 'GBP' : ''
      ].filter(Boolean)[0] || ''),
      title: clean(document.title)
    };

    function findProductRoot() {
      const selectors = [
        'main article',
        'main [data-testid*="pdp" i]',
        'main [data-testid*="product" i]',
        'main [data-testid*="article" i]',
        '[data-testid*="pdp" i]',
        '[data-testid*="product" i]',
        '[data-testid*="article" i]',
        'main'
      ];
      return selectors.map((selector) => document.querySelector(selector)).find(Boolean);
    }

    function meta(selectors) {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const value = clean(element && element.getAttribute('content'));
        if (value) return value;
      }
      return '';
    }

    function textBySelector(selectors) {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const value = clean(element && (element.innerText || element.textContent));
        if (value) return value;
      }
      return '';
    }

    function normalizeCurrency(value) {
      const text = clean(value).toUpperCase();
      if (text.includes('EUR') || text.includes('€')) return 'EUR';
      if (text.includes('GBP') || text.includes('£')) return 'GBP';
      return text;
    }
  });

  if (!pageState.hasProductMain) {
    return zalandoStopResult('product main not found');
  }

  return {
    shouldStop: false,
    status: '',
    reason: '',
    currency: pageState.currency
  };
}

async function extractZalandoProductDetails(page, pageUrl) {
  return page.evaluate(({ pageUrl }) => {
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
    const absoluteUrl = (value) => {
      try {
        return new URL(value, location.href).href;
      } catch (_) {
        return '';
      }
    };
    const meta = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const value = clean(element && element.getAttribute('content'));
        if (value) return value;
      }
      return '';
    };
    const textBySelector = (selectors, root = document) => {
      for (const selector of selectors) {
        const element = root.querySelector(selector);
        const value = clean(element && (element.innerText || element.textContent));
        if (value) return value;
      }
      return '';
    };
    const normalizeCurrency = (value) => {
      const text = clean(value).toUpperCase();
      if (text.includes('EUR') || text.includes('€')) return 'EUR';
      if (text.includes('GBP') || text.includes('£')) return 'GBP';
      return text;
    };
    const normalizePrice = (value) => {
      const match = String(value || '').replace(/\s/g, '').match(/[€£]?\s*(\d+(?:[.,]\d{2})?)/);
      if (!match) return null;
      const price = Number(match[1].replace(',', '.'));
      return Number.isFinite(price) ? price : null;
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

    const productRoot = findProductRoot();
    const rootText = clean(productRoot && (productRoot.innerText || productRoot.textContent));
    const jsonLd = getJsonLdProducts()[0] || {};
    const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers || {};
    const breadcrumbs = extractBreadcrumbs();
    const sections = extractSections(productRoot || document);
    const color = extractColor(productRoot || document, rootText);
    const priceText = [
      textBySelector(['[data-testid*="price" i]', '[class*="price" i]', '[aria-label*="price" i]'], productRoot || document),
      meta(['meta[property="product:price:amount"]', 'meta[property="og:product:price:amount"]']),
      offer.price
    ].filter(Boolean)[0] || '';
    const price = normalizePrice(priceText);
    const currency = normalizeCurrency([
      offer.priceCurrency,
      meta(['meta[property="product:price:currency"]', 'meta[property="og:product:price:currency"]']),
      priceText,
      rootText.includes('€') ? 'EUR' : '',
      rootText.includes('£') ? 'GBP' : ''
    ].filter(Boolean)[0] || '');
    const brand = extractBrand(productRoot, jsonLd);
    const name = extractName(productRoot, brand, jsonLd);
    const materialLines = sections['material & care'] || sections.material || [];
    const detailsLines = sections.details || [];
    const sizeLines = sections['size & fit'] || [];
    const articleNumber = valueFromLines(detailsLines, ['Article number', 'Artikelnummer', 'Art. no.', 'Art No'])
      || extractLabelValue(rootText, ['Article number', 'Artikelnummer', 'Art. no.', 'Art No']);
    const features = unique([...materialLines, ...detailsLines, ...sizeLines]
      .filter((line) => !/^article number\b/i.test(line))
      .filter((line) => !/^colour\b|^color\b/i.test(line)));
    const description = extractDescription(productRoot, name) || clean(jsonLd.description) || meta(['meta[name="description"]', 'meta[property="og:description"]']);
    const composition = materialLines.join('\n');

    return {
      shouldStop: false,
      name,
      brand,
      price,
      currency,
      color,
      description,
      features,
      composition,
      material: materialLines.join('\n'),
      dimensions: sizeLines.join('\n'),
      weight: '',
      productCode: articleNumber || clean(jsonLd.sku) || clean(jsonLd.mpn) || parseSkuFromUrl(pageUrl || location.href),
      sku: clean(jsonLd.sku) || articleNumber,
      mpn: clean(jsonLd.mpn),
      countryOfOrigin: '',
      fastening: features.filter((item) => /\bfastening|closure|clasp|hook|zip|button\b/i.test(item)).join('\n'),
      hardware: '',
      decoration: features.filter((item) => /\bpearl|crystal|stone|pendant|charm|orb|logo|embellish\b/i.test(item)).join('\n'),
      pockets: '',
      lining: features.filter((item) => /\blining|lined\b/i.test(item)).join('\n'),
      modelInfo: '',
      careInstructions: materialLines.filter((item) => /\bcare|wash|clean\b/i.test(item)).join('\n'),
      returnNotes: '',
      category: breadcrumbs.filter((item) => !/^home$/i.test(item)).join(' > ') || categoryFromUrl(pageUrl || location.href) || categoryFromName(name),
      breadcrumbs,
      categoryPath: breadcrumbs,
      sourceUrl: absoluteUrl(pageUrl || location.href),
      detailSource: 'zalando',
      extractionLog: {
        color: {
          value: color,
          source: color ? 'product-main-color-text' : ''
        }
      },
      rawSections: sections,
      warnings: []
    };

    function findProductRoot() {
      const selectors = [
        'main article',
        'main [data-testid*="pdp" i]',
        'main [data-testid*="product" i]',
        'main [data-testid*="article" i]',
        '[data-testid*="pdp" i]',
        '[data-testid*="product" i]',
        '[data-testid*="article" i]',
        'main'
      ];
      return selectors.map((selector) => document.querySelector(selector)).find(Boolean);
    }

    function extractBreadcrumbs() {
      const selectors = [
        'nav[aria-label*="breadcrumb" i] a',
        '[data-testid*="breadcrumb" i] a',
        'ol[aria-label*="breadcrumb" i] a',
        'a[href*="/catalog/"]'
      ];
      return unique(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))
        .map((element) => clean(element.innerText || element.textContent))
        .filter(Boolean)));
    }

    function extractSections(root) {
      const sectionTitles = ['Material & care', 'Details', 'Size & fit', 'Material', 'Care'];
      const blocks = {};
      for (const title of sectionTitles) {
        const titleElement = Array.from(root.querySelectorAll('h2, h3, h4, button, summary, span, div'))
          .find((element) => clean(element.innerText || element.textContent).toLowerCase() === title.toLowerCase());
        if (!titleElement) continue;
        const container = closestSection(titleElement);
        const lines = extractLines(container || titleElement.parentElement || titleElement)
          .filter((line) => line.toLowerCase() !== title.toLowerCase());
        if (lines.length) blocks[title.toLowerCase()] = lines;
      }

      if (Object.keys(blocks).length === 0) {
        Object.assign(blocks, extractSectionsFromText(clean(root.innerText || root.textContent)));
      }
      return blocks;
    }

    function closestSection(element) {
      let node = element;
      for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
        const text = clean(node.innerText || node.textContent);
        if (text.length > 30 && /(material|details|size & fit|article number|stone type|finish)/i.test(text)) return node;
      }
      return element.parentElement;
    }

    function extractLines(root) {
      const definitionItems = Array.from(root.querySelectorAll('dl')).flatMap((list) => {
        const children = Array.from(list.children);
        const lines = [];
        for (let index = 0; index < children.length; index += 1) {
          const child = children[index];
          if (child.tagName !== 'DT') continue;
          const label = clean(child.innerText || child.textContent);
          const valueElement = children.slice(index + 1).find((item) => item.tagName === 'DD');
          const value = clean(valueElement && (valueElement.innerText || valueElement.textContent));
          if (label && value) lines.push(`${label}: ${value}`);
        }
        return lines;
      });
      const otherItems = Array.from(root.querySelectorAll('li, p'))
        .map((element) => clean(element.innerText || element.textContent))
        .filter((line) => line && line.length < 220)
        .filter((line) => !/^(show more|show less)$/i.test(line));
      return unique([...definitionItems, ...otherItems]);
    }

    function extractSectionsFromText(text) {
      const headings = ['Material & care', 'Details', 'Size & fit'];
      const result = {};
      for (let i = 0; i < headings.length; i += 1) {
        const heading = headings[i];
        const nextHeadingPattern = headings.filter((item) => item !== heading).map(escapeRegex).join('|');
        const match = text.match(new RegExp(`${escapeRegex(heading)}\\s+([\\s\\S]*?)(?=${nextHeadingPattern}|$)`, 'i'));
        if (!match) continue;
        result[heading.toLowerCase()] = unique(match[1]
          .split(/(?=(?:Material|Finish|Stone type|Outer material|Lining|Pattern|Article number|Closure|Length|Width|Diameter|Details)\\b)/i)
          .map(clean)
          .filter(Boolean));
      }
      return result;
    }

    function valueFromLines(lines, labels) {
      for (const line of lines) {
        for (const label of labels) {
          const match = line.match(new RegExp(`^${escapeRegex(label)}\\s*:?\\s*(.+)$`, 'i'));
          if (match && clean(match[1])) return clean(match[1]);
        }
      }
      return '';
    }

    function extractLabelValue(text, labels) {
      for (const label of labels) {
        const match = text.match(new RegExp(`${escapeRegex(label)}\\s*:?\\s*([^\\n]+?)(?=\\s(?:Material & care|Details|Size & fit|Article number|Closure|Length|Width|Height)\\b|$)`, 'i'));
        if (match && clean(match[1])) return clean(match[1]);
      }
      return '';
    }

    function extractColor(root, text) {
      const colorElementText = Array.from(root.querySelectorAll('div, span, p'))
        .map((element) => clean(element.innerText || element.textContent))
        .find((value) => value.length < 180 && /Current Selected color\s+(Colour|Color):/i.test(value));
      if (colorElementText) return extractColorFromText(colorElementText);
      return extractColorFromText(text);
    }

    function extractColorFromText(text) {
      const patterns = [
        /Current Selected color\s+Colour:\s*(.+?)(?=\s(?:Material & care|Details|Size & fit|Description)\b|$)/i,
        /Current Selected color\s+Color:\s*(.+?)(?=\s(?:Material & care|Details|Size & fit|Description)\b|$)/i,
        /Colour:\s*(.+?)(?=\s(?:Material & care|Details|Size & fit|Description)\b|$)/i,
        /Color:\s*(.+?)(?=\s(?:Material & care|Details|Size & fit|Description)\b|$)/i
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && clean(match[1])) return clean(match[1]);
      }
      return '';
    }

    function extractBrand(root, product) {
      const jsonBrand = typeof product.brand === 'string' ? product.brand : clean(product.brand && product.brand.name);
      const brandLink = textBySelector([
        'a[href*="vivienne-westwood" i]',
        '[data-testid*="brand" i] a',
        '[data-testid*="brand" i]',
        'h3 a'
      ], root || document);
      return brandLink || jsonBrand;
    }

    function extractName(root, brandName, product) {
      const candidates = [
        textBySelector(['h1', '[data-testid*="product-name" i]', '[data-testid*="article-name" i]'], root || document),
        clean(product.name),
        meta(['meta[property="og:title"]', 'meta[name="twitter:title"]']),
        clean(document.title)
      ].filter(Boolean);
      for (const candidate of candidates) {
        const value = clean(candidate)
          .replace(new RegExp(`^${escapeRegex(brandName)}\\s*`, 'i'), '')
          .replace(/\s*\|\s*Zalando.*$/i, '')
          .replace(/\s*-\s*Zalando.*$/i, '');
        if (value) return value;
      }
      return '';
    }

    function extractDescription(root, productName) {
      const selectors = [
        '[data-testid*="description" i]',
        '[class*="description" i]',
        'section p'
      ];
      const values = selectors.map((selector) => textBySelector([selector], root || document))
        .filter((value) => value && value !== productName)
        .filter((value) => !/(material & care|details|size & fit|article number)/i.test(value));
      return values[0] || '';
    }

    function parseSkuFromUrl(url) {
      try {
        const filename = new URL(url).pathname.split('/').pop() || '';
        return filename.replace(/\.html$/i, '').split('-').pop().toUpperCase();
      } catch (_) {
        return '';
      }
    }

    function categoryFromUrl(url) {
      try {
        const path = new URL(url).pathname.replace(/[-_/]+/g, ' ');
        if (/\bnecklace\b/i.test(path)) return 'Accessories > Jewellery > Necklaces';
      } catch (_) {}
      return '';
    }

    function categoryFromName(value) {
      if (/\bnecklace\b/i.test(value)) return 'Accessories > Jewellery > Necklaces';
      return '';
    }

    function escapeRegex(value) {
      return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }, { pageUrl });
}

async function extractZalandoImages(page) {
  const candidates = await page.evaluate(({ host, marker }) => {
    const absoluteUrl = (value) => {
      if (!value) return '';
      try {
        return new URL(value, location.href).href;
      } catch (_) {
        return '';
      }
    };
    const parseSrcset = (srcset) => String(srcset || '').split(',')
      .map((part) => part.trim().split(/\s+/)[0])
      .map(absoluteUrl)
      .filter(Boolean);
    const isProductImage = (url) => {
      try {
        const parsed = new URL(url);
        return parsed.hostname === host && parsed.pathname.includes(marker);
      } catch (_) {
        return false;
      }
    };
    const isExcluded = (img) => Boolean(img.closest([
      'header',
      'footer',
      '[data-testid*="recommend" i]',
      '[data-testid*="related" i]',
      '[data-testid*="recent" i]',
      '[data-testid*="outfit" i]',
      '[class*="recommend" i]',
      '[class*="related" i]',
      '[class*="recent" i]',
      '[class*="outfit" i]',
      '[class*="product-tile" i]',
      '[class*="banner" i]',
      'nav'
    ].join(',')));

    return Array.from(document.querySelectorAll('main img'))
      .filter((img) => !isExcluded(img))
      .flatMap((img, index) => {
        const urls = [
          img.currentSrc,
          img.src,
          img.getAttribute('src'),
          img.getAttribute('data-src'),
          ...parseSrcset(img.getAttribute('srcset'))
        ].map(absoluteUrl).filter(isProductImage);
        return urls.map((url) => ({
          order: index + 1,
          alt: img.getAttribute('alt') || '',
          sourceUrl: url,
          selector: 'main img'
        }));
      });
  }, { host: PRODUCT_IMAGE_HOST, marker: PRODUCT_IMAGE_PATH_MARKER });

  const seen = new Set();
  return candidates
    .map((candidate) => {
      const url = toZalandoHighQualityUrl(candidate.sourceUrl);
      return {
        ...candidate,
        url,
        canonicalKey: canonicalZalandoImageKey(url),
        role: candidate.order === 1 ? 'main' : 'sub',
        warningWidth: 1800
      };
    })
    .filter((candidate) => {
      if (seen.has(candidate.canonicalKey)) return false;
      seen.add(candidate.canonicalKey);
      return true;
    });
}

function toZalandoHighQualityUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    parsed.searchParams.set('imwidth', '1800');
    return parsed.href;
  } catch (_) {
    return imageUrl;
  }
}

function canonicalZalandoImageKey(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    parsed.searchParams.delete('imwidth');
    parsed.searchParams.delete('width');
    parsed.searchParams.delete('height');
    return parsed.href;
  } catch (_) {
    return imageUrl.split('?')[0];
  }
}

function zalandoStopResult(reason, status = ZALANDO_PAGE_FAILURE_STATUS) {
  return {
    shouldStop: true,
    status,
    reason,
    name: '',
    brand: '',
    price: '',
    currency: '',
    color: '',
    description: '',
    features: [],
    composition: '',
    material: '',
    dimensions: '',
    productCode: '',
    sku: '',
    mpn: '',
    category: '',
    imageUrls: [],
    imageSources: [],
    detailSource: 'zalando-protection'
  };
}

module.exports = {
  ZALANDO_PAGE_FAILURE_STATUS,
  ZALANDO_IMAGE_FAILURE_STATUS,
  isZalandoUrl,
  inspectZalandoPage,
  extractZalandoProductDetails,
  extractZalandoImages,
  toZalandoHighQualityUrl,
  canonicalZalandoImageKey
};
