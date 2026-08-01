const HARVEY_NICHOLS_HOSTS = new Set(['harveynichols.com', 'www.harveynichols.com']);
const HARVEY_NICHOLS_IMAGE_FAILURE_STATUS = '要確認：商品画像取得失敗';
const HIGH_RES_WARNING_WIDTH = 1500;
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

function isHarveyNicholsUrl(url) {
  try {
    const parsed = new URL(url);
    return HARVEY_NICHOLS_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

async function extractHarveyNicholsProductDetails(page, pageUrl) {
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
    const normalizePrice = (value) => {
      const price = Number(String(value || '').replace(/[^\d.]/g, ''));
      return Number.isFinite(price) && price > 0 ? price : null;
    };

    const bcProduct = window.BC_product || {};
    const bcData = window.BCData || {};
    const attributes = bcData.product_attributes || {};
    const customFields = normalizeCustomFields(bcProduct.custom_fields);
    const brand = toTitleCase(customField(customFields, 'Brand') || clean(bcProduct.brand && bcProduct.brand.name));
    const rawName = customField(customFields, 'Displayable Product Name')
      || textBySelector(['h1.productView-brand-title'])
      || clean(bcProduct.title)
      || meta(['meta[property="og:title"]', 'meta[name="twitter:title"]']);
    const name = normalizeProductName(rawName, brand);
    const price = normalizePrice(attributes.price && attributes.price.with_tax && attributes.price.with_tax.value)
      || normalizePrice(bcProduct.price && bcProduct.price.with_tax && bcProduct.price.with_tax.value)
      || normalizePrice(textBySelector(['.productView-price']))
      || normalizePrice(meta(['meta[property="product:price:amount"]', 'meta[property="og:price:amount"]']));
    const currency = clean(attributes.price && attributes.price.with_tax && attributes.price.with_tax.currency)
      || clean(bcProduct.price && bcProduct.price.with_tax && bcProduct.price.with_tax.currency)
      || meta(['meta[property="product:price:currency"]', 'meta[property="og:price:currency"]'])
      || (textBySelector(['.productView-price']).includes('£') ? 'GBP' : '');
    const color = clean(customField(customFields, 'Colour') || customField(customFields, 'Colour Group'));
    const infoCareText = cleanSectionText(textBySelector(['.tab-content.info-care']));
    const sizeFitText = cleanSectionText(textBySelector(['.tab-content.size-fit']));
    const infoCareLines = sectionToLines(infoCareText);
    const sizeFitLines = sectionToLines(sizeFitText);
    const skuFromText = extractLabelValue(infoCareText, ['SKU No.', 'SKU']);
    const styleNo = customField(customFields, 'Style Number')
      || extractLabelValue(infoCareText, ['Style No.', 'Style Number'])
      || clean(attributes.mpn)
      || clean(bcProduct.mpn);
    const sku = skuFromText || clean(attributes.sku) || clean(bcProduct.sku);
    const productCode = sku || clean(attributes.mpn) || clean(bcProduct.mpn) || styleNo;
    const composition = extractComposition(infoCareText, customField(customFields, 'Fabric'));
    const material = extractMaterial(composition || customField(customFields, 'Fabric'));
    const features = unique([
      ...extractFeatureLines(infoCareText),
      ...extractFeatureLines(sizeFitText)
    ]);
    const description = extractDescription(infoCareText)
      || meta(['meta[name="description"]', 'meta[property="og:description"]']);
    const category = selectCategory(bcProduct.category) || parseCategoryFromUrl(pageUrl || location.href);
    const dimensions = extractFeatureLines(sizeFitText)
      .filter((line) => /\b(length|height|width|depth|drop|diameter|shoulder|hem)\b/i.test(line))
      .join('\n');
    const modelInfo = extractFeatureLines(sizeFitText).find((line) => /^model is\b/i.test(line)) || '';

    const result = {
      name,
      brand,
      price,
      currency,
      color,
      description,
      features,
      composition,
      material,
      dimensions,
      weight: '',
      productCode,
      sku,
      mpn: clean(attributes.mpn) || clean(bcProduct.mpn) || styleNo,
      countryOfOrigin: '',
      fastening: features.filter((item) => /\bfastening|fastenings|closure|button|zip|press-stud|snap\b/i.test(item)).join('\n'),
      hardware: '',
      decoration: features.filter((item) => /\borb|embroidered|embroidery|motif|logo|crystal|charm|sequin\b/i.test(item)).join('\n'),
      pockets: features.filter((item) => /\bpocket|pockets\b/i.test(item)).join('\n'),
      lining: features.filter((item) => /\blined|lining|unlined\b/i.test(item)).join('\n'),
      modelInfo,
      careInstructions: features.filter((item) => /\b(machine wash|dry clean|hand wash|care)\b/i.test(item)).join('\n'),
      returnNotes: '',
      category,
      categoryPath: Array.isArray(bcProduct.category) ? bcProduct.category : [],
      detailSource: 'harvey-nichols',
      extractionLog: {
        color: {
          value: color,
          source: color ? 'BC_product.custom_fields.Colour' : ''
        }
      },
      rawBlocks: {
        infoCare: infoCareLines,
        sizeFit: sizeFitLines,
        customFields
      },
      warnings: []
    };

    if (currency && currency !== 'GBP') {
      result.warnings.push(`Harvey Nichols page currency is not GBP: ${currency}`);
    }

    for (const field of detailFields) {
      if (!(field in result)) result[field] = '';
    }

    return result;

    function normalizeCustomFields(fields) {
      if (!fields) return {};
      if (Array.isArray(fields)) {
        return fields.reduce((acc, field) => {
          const name = clean(field.name || field.label || field.key);
          const value = clean(field.value || field.text);
          if (name) acc[name] = value;
          return acc;
        }, {});
      }
      return Object.entries(fields).reduce((acc, [key, value]) => {
        acc[clean(key)] = clean(value);
        return acc;
      }, {});
    }

    function customField(fields, name) {
      const target = name.toLowerCase();
      const key = Object.keys(fields).find((fieldName) => fieldName.toLowerCase() === target);
      return key ? clean(fields[key]) : '';
    }

    function toTitleCase(value) {
      return clean(value).toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
    }

    function normalizeProductName(value, brandName) {
      let nameValue = clean(value)
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
        .replace(/\bNew Season\b/ig, '')
        .replace(/\bAW\d{2}\b/ig, '')
        .replace(/\bSS\d{0,2}\b/ig, '')
        .replace(/\b[A-Z0-9]+_[A-Z0-9]+\b/g, '');
      if (brandName) {
        nameValue = nameValue.replace(new RegExp(`\\b${escapeRegExp(brandName)}\\b`, 'ig'), '');
      }
      return toTitleCase(nameValue);
    }

    function cleanSectionText(value) {
      return clean(value)
        .replace(/\bShare this:\b.*$/i, '')
        .replace(/\bStyle No\.\s*:\s*\S+/ig, '')
        .replace(/\bSKU No\.\s*:\s*\S+/ig, '')
        .replace(/\bShare this:\b.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function sectionToLines(value) {
      return unique(clean(value)
        .split(/\n|(?<=\.)\s+|(?<=cm)\s+|(?<=inches)\s+/)
        .map((line) => clean(line.replace(/^#|#$/g, '')))
        .filter(Boolean)
        .filter((line) => !/^share this:?$/i.test(line))
        .filter((line) => !/^(sku|style)\s+no\.?\s*:/i.test(line)));
    }

    function extractFeatureLines(value) {
      const text = cleanSectionText(value);
      const splitText = text
        .replace(/\b(Gathered\b)/gi, '\n$1')
        .replace(/\b(Concealed\b)/gi, '\n$1')
        .replace(/\b(Button fastenings? at front)\b/gi, '\n$1\n')
        .replace(/\b(\d+(?:\.\d+)?\s*%\s*(?:virgin wool|cotton|polyester|silk|wool|viscose|elastane|elastan|leather|linen|nylon|polyamide|cashmere|acrylic|modal|lyocell|rayon|metal|brass|glass|calf leather))\b/gi, '\n$1\n')
        .replace(/;\s*lining\s*:/gi, '\nLining:')
        .replace(/\b(Machine wash|Dry clean|Hand wash)\b/gi, '\n$1\n')
        .replace(/\b(Length [^:]+:\s*[^]+?cm)\b/i, '\n$1\n')
        .replace(/\b(Midweight|Lightweight|Heavyweight)\b/gi, '\n$1')
        .replace(/\b(Model is [^]+)$/i, '\n$1');
      return unique(splitText
        .split(/\n|,\s*/)
        .map((line) => clean(line))
        .filter(Boolean)
        .filter((line) => !/^share this:?$/i.test(line))
        .filter((line) => !/^(sku|style)\s+no\.?\s*:/i.test(line))
        .filter((line) => !/^lining:?$/i.test(line))
        .filter((line) => !/^\.?:\s*[A-Z0-9_ -]+$/i.test(line)));
    }

    function extractDescription(value) {
      const featuresStart = value.search(/\b(gathered|button fastenings?|zip|length|midweight|model is|machine wash)\b/i);
      if (featuresStart > 0) return clean(value.slice(0, featuresStart));
      return clean(value);
    }

    function extractComposition(text, fabric) {
      const compositionLines = clean(text).match(/\d+(?:\.\d+)?\s*%\s*(?:virgin wool|cotton|polyester|silk|wool|viscose|elastane|elastan|leather|linen|nylon|polyamide|cashmere|acrylic|modal|lyocell|rayon|metal|brass|glass|calf leather)/ig) || [];
      if (compositionLines.length) return unique(compositionLines.map(clean)).join('\n');
      return fabric ? clean(fabric) : '';
    }

    function extractMaterial(value) {
      const text = clean(value);
      if (!text) return '';
      return unique(text
        .split(/\n+/)
        .map((line) => line.replace(/\b\d+(?:\.\d+)?\s*%/g, ''))
        .map(clean)
        .filter(Boolean))
        .join('\n') || text;
    }

    function extractLabelValue(text, labels) {
      for (const label of labels) {
        const match = clean(text).match(new RegExp(`${escapeRegExp(label)}\\s*:?\\s*([A-Z0-9_ -]+)`, 'i'));
        if (match && clean(match[1])) return clean(match[1]);
      }
      return '';
    }

    function selectCategory(categories) {
      const values = Array.isArray(categories) ? categories.map(clean).filter(Boolean) : [clean(categories)].filter(Boolean);
      const productCategories = values.filter((item) => !/^(promotions|holiday shop)\b/i.test(item));
      const preferred = productCategories.find((item) => /\/Shirts$/i.test(item))
        || productCategories.find((item) => /\/Dresses$/i.test(item))
        || productCategories.find((item) => /\/Skirts$/i.test(item))
        || productCategories.find((item) => /\/Bags$/i.test(item))
        || productCategories.find((item) => /\/Shoes$/i.test(item))
        || productCategories.filter((item) => item.includes('/') && !/new season|transeasonal|edit/i.test(item)).sort((a, b) => b.length - a.length)[0]
        || productCategories.filter((item) => item.includes('/')).sort((a, b) => b.length - a.length)[0];
      return preferred
        || values[0]
        || '';
    }

    function parseCategoryFromUrl(url) {
      try {
        const parts = new URL(url).pathname.split('/').filter(Boolean);
        return parts.slice(0, -1).join(' > ');
      } catch (_) {
        return '';
      }
    }

    function escapeRegExp(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }, { pageUrl, detailFields: DETAIL_FIELDS });
}

async function extractHarveyNicholsImages(page) {
  const images = await page.evaluate(() => {
    const productImages = window.BC_product && Array.isArray(window.BC_product.images)
      ? window.BC_product.images
      : [];
    return productImages
      .map((image, index) => ({
        order: index + 1,
        sourceUrl: image && (image.data || image.url || image.src),
        alt: image && (image.alt || image.description || ''),
        selector: 'window.BC_product.images'
      }))
      .filter((image) => image.sourceUrl && !/loading\.svg/i.test(image.sourceUrl));
  });

  const seen = new Set();
  return images
    .map((image) => {
      const sourceUrl = normalizeHarveyNicholsImageTemplate(image.sourceUrl, '640w');
      const highQualityUrl = toHarveyNicholsHighQualityUrl(image.sourceUrl);
      return {
        ...image,
        sourceUrl,
        url: highQualityUrl,
        canonicalKey: canonicalHarveyNicholsImageKey(highQualityUrl),
        role: image.order === 1 ? 'main' : 'sub',
        warningWidth: HIGH_RES_WARNING_WIDTH
      };
    })
    .filter((image) => {
      if (!/^https?:\/\//i.test(image.url)) return false;
      if (seen.has(image.canonicalKey)) return false;
      seen.add(image.canonicalKey);
      return true;
    });
}

function normalizeHarveyNicholsImageTemplate(imageUrl, size) {
  try {
    const value = String(imageUrl || '').replace('/images/stencil/{:size}/', `/images/stencil/${size}/`);
    return new URL(value).href;
  } catch (_) {
    return String(imageUrl || '').replace('/images/stencil/{:size}/', `/images/stencil/${size}/`);
  }
}

function toHarveyNicholsHighQualityUrl(imageUrl) {
  try {
    const value = String(imageUrl || '')
      .replace('/images/stencil/{:size}/', '/images/stencil/2000w/')
      .replace(/\/images\/stencil\/[^/]+\//, '/images/stencil/2000w/');
    return new URL(value).href;
  } catch (_) {
    return String(imageUrl || '')
      .replace('/images/stencil/{:size}/', '/images/stencil/2000w/')
      .replace(/\/images\/stencil\/[^/]+\//, '/images/stencil/2000w/');
  }
}

function canonicalHarveyNicholsImageKey(imageUrl) {
  try {
    const parsed = new URL(String(imageUrl || '').replace('/images/stencil/{:size}/', '/images/stencil/2000w/'));
    const productPath = parsed.pathname.match(/\/products\/.+$/);
    return productPath ? productPath[0].replace(/\/images\/stencil\/[^/]+\//, '/images/stencil/{size}/') : parsed.pathname.replace(/\/images\/stencil\/[^/]+\//, '/images/stencil/{size}/');
  } catch (_) {
    return String(imageUrl || '')
      .split('?')[0]
      .replace(/\/images\/stencil\/(?:\{:\s*size\s*\}|[^/]+)\//, '/images/stencil/{size}/');
  }
}

module.exports = {
  HARVEY_NICHOLS_IMAGE_FAILURE_STATUS,
  HIGH_RES_WARNING_WIDTH,
  isHarveyNicholsUrl,
  extractHarveyNicholsProductDetails,
  extractHarveyNicholsImages,
  toHarveyNicholsHighQualityUrl,
  canonicalHarveyNicholsImageKey
};
