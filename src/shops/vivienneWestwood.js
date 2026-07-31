const VIVIENNE_HOST = 'www.viviennewestwood.com';
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

function isVivienneWestwoodUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === VIVIENNE_HOST && parsed.pathname.startsWith('/en-gb/');
  } catch (_) {
    return false;
  }
}

async function extractVivienneWestwoodImages(page) {
  const candidates = await page.evaluate(() => {
    const absoluteUrl = (value) => {
      if (!value) return '';
      try {
        return new URL(value, location.href).href;
      } catch (_) {
        return '';
      }
    };

    const parseSrcset = (srcset) => {
      if (!srcset) return [];
      return srcset
        .split(',')
        .map((part) => {
          const [url, descriptor = ''] = part.trim().split(/\s+/);
          const width = descriptor.endsWith('w') ? Number(descriptor.replace('w', '')) : 0;
          const density = descriptor.endsWith('x') ? Number(descriptor.replace('x', '')) : 0;
          return { url: absoluteUrl(url), width, density };
        })
        .filter((item) => item.url)
        .sort((a, b) => (b.width || b.density) - (a.width || a.density));
    };

    const bestUrlForImage = (img) => {
      const srcsetBest = parseSrcset(img.getAttribute('srcset'))[0];
      return [
        img.getAttribute('data-zoom-image'),
        img.closest('a') && img.closest('a').getAttribute('href'),
        srcsetBest && srcsetBest.url,
        img.getAttribute('data-original'),
        img.getAttribute('data-src'),
        img.currentSrc,
        img.src
      ].map(absoluteUrl).find(Boolean);
    };

    return Array.from(document.querySelectorAll('.b-product_gallery-main .b-product_image-img, .b-product_slider .b-product_image-img'))
      .map((img, index) => ({
        order: index + 1,
        alt: img.getAttribute('alt') || '',
        sourceUrl: bestUrlForImage(img),
        src: absoluteUrl(img.getAttribute('src')),
        currentSrc: absoluteUrl(img.currentSrc),
        srcset: img.getAttribute('srcset') || '',
        dataOriginal: absoluteUrl(img.getAttribute('data-original')),
        dataSrc: absoluteUrl(img.getAttribute('data-src')),
        dataZoom: absoluteUrl(img.getAttribute('data-zoom-image')),
        selector: '.b-product_gallery-main .b-product_image-img'
      }))
      .filter((item) => item.sourceUrl);
  });

  return candidates.map((candidate) => {
    const highQualityUrl = toVivienneHighQualityUrl(candidate.sourceUrl);
    return {
      ...candidate,
      url: highQualityUrl,
      canonicalKey: canonicalVivienneImageKey(highQualityUrl),
      role: candidate.order === 1 ? 'main' : 'sub',
      warningWidth: HIGH_RES_WARNING_WIDTH
    };
  });
}

async function extractVivienneWestwoodProductDetails(page, pageUrl) {
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
    const absoluteUrl = (value) => {
      if (!value) return '';
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
    const nodeRawText = (element) => (element && (element.innerText || element.textContent)) || '';
    const nodeText = (element) => clean(nodeRawText(element));
    const textBySelector = (selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const value = nodeText(element);
        if (value) return value;
      }
      return '';
    };
    const rawTextBySelector = (selectors) => {
      for (const selector of selectors) {
        const value = nodeRawText(document.querySelector(selector));
        if (clean(value)) return value;
      }
      return '';
    };

    const getJsonLdProducts = () => Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .flatMap((script) => {
        try {
          const parsed = JSON.parse(script.textContent || '{}');
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch (_) {
          return [];
        }
      })
      .flatMap((item) => {
        if (!item) return [];
        if (Array.isArray(item['@graph'])) return item['@graph'];
        return [item];
      })
      .filter((item) => {
        const type = item && item['@type'];
        return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
      });

    const jsonLd = getJsonLdProducts()[0] || {};
    const jsonBrand = typeof jsonLd.brand === 'string' ? jsonLd.brand : clean(jsonLd.brand && jsonLd.brand.name);
    const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers || {};
    const price = Number(String(offer.price || '').replace(/[^\d.]/g, '')) || null;
    const currency = clean(offer.priceCurrency);

    const parseTitleColor = () => {
      const values = [
        clean(document.title),
        meta(['meta[property="og:title"]', 'meta[name="twitter:title"]']),
        clean(jsonLd.name)
      ];
      for (const value of values) {
        const match = value.match(/\bin\s+([^|]+?)(?:\s*\||$)/i);
        if (match && clean(match[1])) return normalizeColor(match[1]);
      }
      return '';
    };

    const parseUrlInfo = () => {
      const info = { color: '', productCode: '', category: '' };
      try {
        const parsed = new URL(pageUrl || location.href);
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        const filename = pathParts[pathParts.length - 1] || '';
        const basename = filename.replace(/\.html$/i, '');
        if (basename.includes('--')) {
          const [code, color] = basename.split('--');
          info.productCode = clean(code);
          info.color = normalizeColor(color);
        } else {
          info.productCode = clean(basename);
        }
        const productSlugIndex = pathParts.findIndex((part) => part === filename);
        const categoryParts = productSlugIndex > 2
          ? pathParts.slice(2, productSlugIndex - 1)
          : [];
        info.category = categoryParts
          .map((part) => part.replace(/-/g, ' '))
          .join(' > ');
      } catch (_) {}
      return info;
    };

    function normalizeColor(value) {
      return clean(String(value || '')
        .replace(/\.html$/i, '')
        .replace(/--/g, ' ')
        .replace(/-/g, ' ')
        .replace(/\s*\/\s*/g, '/'))
        .replace(/\b([A-Z]+)\b/g, (word) => word.charAt(0) + word.slice(1).toLowerCase())
        .replace(/\bUk\b/g, 'UK');
    }

    const getSelectedColor = () => {
      const selectors = [
        '[aria-checked="true"][aria-label]',
        '[aria-selected="true"][aria-label]',
        '.m-selected[aria-label]',
        '.selected[aria-label]',
        '[class*="selected"][aria-label]',
        '[data-selected="true"][aria-label]',
        '[data-attr-value][aria-checked="true"]',
        '[data-attr-value][aria-selected="true"]',
        '.b-product_variations [class*="selected"]',
        '.b-product_attrs [class*="selected"]'
      ];
      const attributeNames = [
        'aria-label',
        'title',
        'data-attr-value',
        'data-value',
        'data-color',
        'data-variation-value',
        'data-variation-id'
      ];
      for (const selector of selectors) {
        for (const element of Array.from(document.querySelectorAll(selector))) {
          const inRecommendations = element.closest('[class*="recommend"], [class*="carousel"], [class*="tile"]')
            && !element.closest('.b-product_main, .b-product_detail, .b-product_info, .b-product_attrs, .b-product_variations');
          if (inRecommendations) continue;
          const attrValue = attributeNames.map((name) => element.getAttribute(name)).find((value) => clean(value));
          const textValue = clean(element.textContent);
          const raw = attrValue || textValue;
          if (raw && !/size|quantity|add to bag|wishlist/i.test(raw)) {
            return normalizeColor(raw.replace(/^color[:：]?\s*/i, ''));
          }
        }
      }
      return '';
    };

    const splitFeatureText = (text) => {
      const lineParts = String(text || '')
        .split(/\n+/)
        .map(clean)
        .filter(Boolean)
        .filter((item) => !/^(description|features|code|composition|care instructions)$/i.test(item));
      if (lineParts.length > 1) {
        return unique(lineParts);
      }
      const marked = clean(text)
        .replace(/([a-z0-9.)])([A-Z][a-z])/g, '$1|$2')
        .replace(/\b(Height|Width|Depth|Length|Drop|Weight|Made in|Please note|The model)\b/g, '|$1')
        .replace(/\b(Silver-tone|Gold-tone|Press-stud|Kiss-lock|Butterfly-back|Magnetic snap|Bas Relief)\b/g, '|$1');
      return unique(marked.split('|').map(clean))
        .filter((item) => !/^(description|features|code|composition|care instructions)$/i.test(item));
    };

    const extractBlocksFromSections = () => {
      const blocks = {};
      const sections = Array.from(document.querySelectorAll('.b-product_accordion-container section, .b-product_accordion section, .b-product_accordion-item'));
      for (const section of sections) {
        const title = nodeText(section.querySelector('button, h2, h3, [class*="title"], [class*="header"]'));
        if (!title) continue;
        const normalized = normalizeHeading(title);
        if (!normalized) continue;
        const contentElement = section.querySelector('[class*="content"], [class*="body"], [class*="inner"]') || section;
        const content = nodeText(contentElement).replace(new RegExp(`^${escapeRegex(title)}\\s*`, 'i'), '');
        blocks[normalized] = content;
      }
      return blocks;
    };

    const extractBlocksFromText = () => {
      const containerText = rawTextBySelector(['.b-product_accordion-container', '.b-product_accordion', '[class*="product"][class*="accordion"]']);
      const blocks = {};
      const headingPattern = /(Description|Features|Dimensions|Code:|Code|Composition|Care Instructions)/gi;
      const matches = Array.from(containerText.matchAll(headingPattern));
      matches.forEach((match, index) => {
        const heading = normalizeHeading(match[1]);
        const start = match.index + match[0].length;
        const end = matches[index + 1] ? matches[index + 1].index : containerText.length;
        const value = containerText.slice(start, end).replace(/^[:：]\s*/, '').trim();
        if (heading && value) blocks[heading] = value;
      });
      return blocks;
    };

    function normalizeHeading(value) {
      const heading = clean(value).replace(/[:：]$/, '').toLowerCase();
      if (heading.includes('description')) return 'description';
      if (heading.includes('features')) return 'features';
      if (heading.includes('dimensions')) return 'dimensions';
      if (heading === 'code' || heading.startsWith('code')) return 'code';
      if (heading.includes('composition')) return 'composition';
      if (heading.includes('care instructions')) return 'careInstructions';
      return '';
    }

    function escapeRegex(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    const extractMaterial = (composition) => {
      const text = clean(composition);
      if (!text) return '';
      const parts = text
        .replace(/\b(main|outer|lining|trim|details?)\s*[:：]/ig, '')
        .split(/\b\d+(?:\.\d+)?\s*%/g)
        .map(clean)
        .filter(Boolean);
      return unique(parts).join(', ') || text;
    };

    const formatLongText = (value) => clean(value)
      .replace(/([a-z.)])([A-Z][a-z])/g, '$1 $2')
      .replace(/\s+([.,;:])/g, '$1');

    const extractSelectedSizes = () => {
      const sizeSelectors = [
        '[data-attr="size"] [aria-checked="true"]',
        '[data-attribute-id="size"] [aria-checked="true"]',
        '[data-attr="size"] [aria-selected="true"]',
        '[data-attribute-id="size"] [aria-selected="true"]',
        '.b-product_attrs-size [class*="selected"]',
        '.b-product_size [class*="selected"]',
        '[class*="size"] option:checked'
      ];
      const attrNames = ['aria-label', 'title', 'data-attr-value', 'data-value', 'value'];
      return unique(sizeSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))
        .map((element) => {
          const attrValue = attrNames.map((name) => element.getAttribute(name)).find((value) => clean(value));
          const textValue = nodeText(element);
          return clean((attrValue || textValue || '').replace(/^size[:：]?\s*/i, ''));
        })
        .filter((value) => value && !/select|choose|size guide|サイズガイド/i.test(value))));
    };

    const jsonLdValues = (value) => {
      if (!value) return [];
      if (typeof value === 'string' || typeof value === 'number') return [clean(value)];
      if (Array.isArray(value)) return value.flatMap(jsonLdValues);
      if (typeof value === 'object') {
        return [value.name, value.value, value.description].flatMap(jsonLdValues);
      }
      return [];
    };

    const extractDimensionCandidates = ({ features, blocks, jsonLd }) => {
      const dimensionPattern = /\b(?:height|width|depth|length|drop|diameter|shoulder|chest|waist|sleeve|inseam|hip|rise|hem|h|w|d)\b[^.;\n]*?\b\d+(?:\.\d+)?\s*(?:cm|mm|in|inch|inches)\b(?:[^.;\n]*?\b\d+(?:\.\d+)?\s*(?:cm|mm|in|inch|inches)\b)*/ig;
      const sizePattern = /\b(?:size|着用サイズ|サイズ)\s*[:：]?\s*[A-Z0-9]+(?:\s*[-/]\s*[A-Z0-9]+)?\b/ig;
      const selectedSizes = extractSelectedSizes().map((size) => `Selected size: ${size}`);
      const primarySources = [
        ...features,
        blocks.dimensions,
        blocks.description,
        ...jsonLdValues(jsonLd.size),
        ...jsonLdValues(jsonLd.additionalProperty),
        ...selectedSizes,
        textBySelector([
          '.b-product_size',
          '.b-size_selector',
          '[class*="size"][class*="selector"]',
          '[class*="size"][class*="attribute"]'
        ])
      ].filter(Boolean);

      const collect = (sources) => {
        const found = [];
        for (const source of sources) {
          const text = clean(source);
          found.push(...Array.from(text.matchAll(dimensionPattern)).map((match) => clean(match[0])));
          found.push(...Array.from(text.matchAll(sizePattern)).map((match) => clean(match[0])));
        }
        return unique(found);
      };

      const primaryFound = collect(primarySources);
      if (primaryFound.length > 0) return primaryFound;

      const broadSources = [
        textBySelector([
          '.b-product_accordion-container',
          '.b-product_detail',
          '.b-product_info',
          '[class*="product"][class*="detail"]'
        ])
      ].filter(Boolean);
      return collect(broadSources);
    };

    const matches = (value, pattern) => pattern.test(value);
    const featureValues = (features, pattern) => features.filter((feature) => matches(feature, pattern));
    const firstFeatureValue = (features, pattern) => featureValues(features, pattern)[0] || '';
    const joinFeatureValues = (features, pattern) => featureValues(features, pattern).join('\n');

    const urlInfo = parseUrlInfo();
    const blocks = {
      ...extractBlocksFromSections(),
      ...extractBlocksFromText()
    };
    const features = splitFeatureText(blocks.features || '');
    const selectedColor = getSelectedColor();
    const titleColor = parseTitleColor();
    const color = selectedColor || titleColor || normalizeColor(jsonLd.color) || urlInfo.color || normalizeColor(meta(['meta[property="product:color"]']));
    const colorSource = selectedColor
      ? 'selected-swatch'
      : titleColor
        ? 'product-title'
        : clean(jsonLd.color)
          ? 'json-ld'
          : urlInfo.color
            ? 'url'
            : meta(['meta[property="product:color"]'])
              ? 'meta'
              : '';
    const sku = clean(jsonLd.sku);
    const mpn = clean(jsonLd.mpn);
    const productCode = clean(blocks.code) || sku || mpn || urlInfo.productCode;
    const countryOfOrigin = firstFeatureValue(features, /\bmade in\b/i);
    const dimensions = extractDimensionCandidates({ features, blocks, jsonLd }).join('\n');
    const weight = firstFeatureValue(features, /\bweight\b/i);
    const modelInfo = firstFeatureValue(features, /\bmodel\b.*\b(wearing|size|cm|ft|')/i);
    const returnNotes = firstFeatureValue(features, /\b(do not accept returns|cannot be returned|returns on earring|pierced earrings)\b/i);

    const result = {
      name: clean(jsonLd.name) || textBySelector(['h1', '[class*="product"][class*="name"]']) || meta(['meta[property="og:title"]']),
      brand: jsonBrand || 'Vivienne Westwood',
      price,
      currency,
      color,
      colorSource,
      description: clean(blocks.description) || clean(jsonLd.description) || meta(['meta[name="description"]', 'meta[property="og:description"]']),
      features,
      composition: clean(blocks.composition),
      material: extractMaterial(blocks.composition),
      dimensions,
      weight,
      productCode,
      sku,
      mpn,
      countryOfOrigin,
      fastening: joinFeatureValues(features, /\b(fastening|closure|zip|button|press-stud|magnetic snap|butterfly-back|kiss-lock)\b/i),
      hardware: joinFeatureValues(features, /\b(hardware|metal fittings|silver-tone|gold-tone|plating)\b/i),
      decoration: joinFeatureValues(features, /\b(orb motif|bas relief|crystal|logo|embroidery|charm|emboss|jacquard|cut-out)\b/i),
      pockets: joinFeatureValues(features, /\b(pocket|card slot|card compartment|coin compartment)\b/i),
      lining: joinFeatureValues(features, /\b(lining|lined|unlined)\b/i),
      modelInfo,
      careInstructions: formatLongText(blocks.careInstructions),
      returnNotes,
      category: urlInfo.category || meta(['meta[property="product:category"]']),
      detailSource: 'vivienne-westwood-en-gb',
      extractionLog: {
        color: {
          value: color,
          source: colorSource
        }
      },
      warnings: []
    };

    if (currency && currency !== 'GBP') {
      result.warnings.push(`Vivienne Westwood UK page currency is not GBP: ${currency}`);
    }

    for (const field of detailFields) {
      if (!(field in result)) result[field] = Array.isArray(result[field]) ? [] : '';
    }
    result.rawBlocks = blocks;
    result.sourceUrl = absoluteUrl(pageUrl || location.href);
    return result;
  }, { pageUrl, detailFields: DETAIL_FIELDS });
}

function toVivienneHighQualityUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    if (!parsed.pathname.includes('/dw/image/v2/')) return imageUrl;

    parsed.searchParams.set('sw', '2000');
    parsed.searchParams.set('sh', '2600');
    parsed.searchParams.set('sm', 'fit');
    parsed.searchParams.set('q', '100');
    return parsed.href;
  } catch (_) {
    return imageUrl;
  }
}

function canonicalVivienneImageKey(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    const filename = parsed.pathname.split('/').pop() || parsed.pathname;
    return `${parsed.hostname}${parsed.pathname.replace(/\/dw[^/]+\//, '/dw/')}::${filename}`;
  } catch (_) {
    return imageUrl.split('?')[0];
  }
}

module.exports = {
  HIGH_RES_WARNING_WIDTH,
  isVivienneWestwoodUrl,
  extractVivienneWestwoodProductDetails,
  extractVivienneWestwoodImages,
  toVivienneHighQualityUrl,
  canonicalVivienneImageKey
};
