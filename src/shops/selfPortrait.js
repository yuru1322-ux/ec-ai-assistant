const SELF_PORTRAIT_HOSTS = new Set(['self-portrait.com', 'www.self-portrait.com']);
const SELF_PORTRAIT_IMAGE_FAILURE_STATUS = '要確認：商品画像取得失敗';
const HIGH_RES_WARNING_WIDTH = 3000;

function isSelfPortraitUrl(url) {
  try {
    const parsed = new URL(url);
    return SELF_PORTRAIT_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

async function extractSelfPortraitProductDetails(page, pageUrl) {
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

    const products = getJsonLdItems('Product');
    const product = products[0] || {};
    const breadcrumb = getJsonLdItems('BreadcrumbList')[0] || {};
    const shopifyProduct = window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product || {};
    const selectedVariantId = String(
      window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.selectedVariantId
      || inputValue('form[action*="/cart/add"] input[name="id"]')
      || ''
    );
    const variants = Array.isArray(shopifyProduct.variants) ? shopifyProduct.variants : getVariantJson();
    const selectedVariant = variants.find((variant) => String(variant.id) === selectedVariantId) || variants[0] || {};
    const offers = Array.isArray(product.offers) ? product.offers : [product.offers].filter(Boolean);
    const selectedOffer = offers.find((offer) => String(offer.url || '').includes(selectedVariantId)) || offers[0] || {};
    const detailsText = textBySelector(['#drw-PrdAccordion_AccDescription', '[id*="AccDescription"]']);
    const composition = textBySelector(['#drw-PrdAccordion_AccComposition', '[id*="AccComposition"]']);
    const jsonMaterial = Array.isArray(product.material) ? product.material.map(clean).filter(Boolean).join('\n') : clean(product.material);
    const modelInfo = extractModelInfo(detailsText);
    const features = extractFeatures(detailsText);
    const name = clean(product.name) || textBySelector(['h1']);
    const brand = clean(product.brand && product.brand.name) || clean(shopifyProduct.vendor);
    const sku = clean(selectedOffer.sku) || clean(selectedVariant.sku);
    const price = normalizePrice(selectedOffer.price) || normalizePrice(selectedVariant.price && Number(selectedVariant.price) / 100);
    const currency = clean(selectedOffer.priceCurrency)
      || clean(window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.currency);
    const color = extractColor(product, name, pageUrl || location.href, selectedVariant);
    const categoryPath = extractBreadcrumbs(breadcrumb, name);

    return {
      name,
      brand,
      price,
      currency,
      color,
      description: extractDescription(detailsText) || clean(product.description),
      features,
      composition,
      material: composition || jsonMaterial,
      dimensions: '',
      weight: '',
      productCode: sku || clean(shopifyProduct.handle),
      sku,
      mpn: clean(shopifyProduct.handle),
      countryOfOrigin: '',
      fastening: features.filter((item) => /\bzip|closure|fastening|button|hook\b/i.test(item)).join('\n'),
      hardware: '',
      decoration: features.filter((item) => /\brhinestone|embellishment|crystal|sequin|bead|lace\b/i.test(item)).join('\n'),
      pockets: features.filter((item) => /\bpocket\b/i.test(item)).join('\n'),
      lining: features.filter((item) => /\blined|lining\b/i.test(item)).join('\n'),
      modelInfo,
      careInstructions: '',
      returnNotes: '',
      category: categoryPath.join(' > '),
      categoryPath,
      detailSource: 'self-portrait',
      extractionLog: {
        color: {
          value: color,
          source: product.color ? 'json-ld-color' : color ? 'product-name-or-handle' : ''
        }
      },
      rawBlocks: {
        details: detailsText,
        composition,
        selectedVariant,
        breadcrumb: categoryPath
      },
      warnings: []
    };

    function getJsonLdItems(typeName) {
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
        .filter((item) => {
          const type = item && item['@type'];
          return type === typeName || (Array.isArray(type) && type.includes(typeName));
        });
    }

    function getVariantJson() {
      return Array.from(document.querySelectorAll('script[type="application/json"]'))
        .flatMap((script) => {
          try {
            const parsed = JSON.parse(script.textContent || '[]');
            return Array.isArray(parsed) ? parsed : [];
          } catch (_) {
            return [];
          }
        })
        .filter((item) => item && item.sku && item.price);
    }

    function textBySelector(selectors) {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const value = clean(element && (element.innerText || element.textContent));
        if (value) return value;
      }
      return '';
    }

    function inputValue(selector) {
      const element = document.querySelector(selector);
      return element && element.value || '';
    }

    function normalizePrice(value) {
      const price = Number(String(value || '').replace(/[^\d.]/g, ''));
      return Number.isFinite(price) && price > 0 ? price : null;
    }

    function extractDescription(text) {
      const marker = text.search(/\b(True to size|Fabric has|Concealed|Fully lined|Model is)\b/i);
      if (marker > 0) return clean(text.slice(0, marker));
      return clean(text);
    }

    function extractFeatures(text) {
      const featurePatterns = [
        /True to size/i,
        /Fabric has [^.]+?(?=Button|Concealed|Removable|Matching|Fully lined|All-over|Slit|Model is|$)/i,
        /Button [^.]+?(?=Fabric|Concealed|Removable|Matching|Fully lined|All-over|Slit|Model is|$)/i,
        /Concealed [^.]+?(?=Button|Fabric|Removable|Matching|Fully lined|All-over|Slit|Model is|$)/i,
        /Removable [^.]+?(?=Button|Fabric|Concealed|Matching|Fully lined|All-over|Slit|Model is|$)/i,
        /Matching [^.]+?(?=Button|Fabric|Concealed|Removable|Fully lined|All-over|Slit|Model is|$)/i,
        /Fully lined/i,
        /All-over [^.]+?(?=Button|Fabric|Concealed|Removable|Matching|Fully lined|Slit|Model is|$)/i,
        /Slit [^.]+?(?=Button|Fabric|Concealed|Removable|Matching|Fully lined|All-over|Model is|$)/i
      ];
      const matched = featurePatterns
        .map((pattern) => clean((text.match(pattern) || [])[0]))
        .filter(Boolean);
      if (matched.length) return unique(matched);

      return unique(clean(text)
        .split(/\n|(?<=\.)\s+/)
        .map(clean)
        .filter((line) => line && !/^model is\b/i.test(line)));
    }

    function extractModelInfo(text) {
      return clean((text.match(/Model is .+$/i) || [])[0]);
    }

    function extractColor(jsonLdProduct, productName, url, variant) {
      const jsonColor = Array.isArray(jsonLdProduct.color) ? jsonLdProduct.color.map(clean).filter(Boolean).join(' / ') : clean(jsonLdProduct.color);
      if (jsonColor) return jsonColor;
      const variantText = clean([variant.name, variant.title, variant.public_title].filter(Boolean).join(' '));
      const candidates = [productName, variantText, parseHandle(url)]
        .map((value) => clean(value).split(/\s|-/)[0])
        .filter((value) => value && !/^uk\d+$/i.test(value));
      return candidates[0] || '';
    }

    function parseHandle(url) {
      try {
        return new URL(url).pathname.split('/').filter(Boolean).pop() || '';
      } catch (_) {
        return '';
      }
    }

    function extractBreadcrumbs(breadcrumbList, currentName) {
      const items = Array.isArray(breadcrumbList.itemListElement) ? breadcrumbList.itemListElement : [];
      return items
        .map((item) => clean(item && item.name))
        .filter(Boolean)
        .filter((name) => !/^shop$/i.test(name))
        .filter((name) => clean(name).toLowerCase() !== clean(currentName).toLowerCase());
    }
  }, { pageUrl });
}

async function extractSelfPortraitImages(page) {
  const candidates = await page.evaluate(() => {
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const absoluteUrl = (value) => {
      if (!value) return '';
      const normalized = String(value).startsWith('//') ? `https:${value}` : value;
      try {
        return new URL(normalized, location.href).href;
      } catch (_) {
        return '';
      }
    };
    const product = getJsonLdProduct();
    const skuPrefix = extractSkuPrefix(product);
    const productImagePattern = skuPrefix ? new RegExp(`${escapeRegExp(skuPrefix)}_\\d+(?:_[^/?]+)?\\.jpe?g`, 'i') : null;
    const productName = clean(product && product.name);
    const jsonImages = (Array.isArray(product && product.image) ? product.image : [product && product.image].filter(Boolean))
      .map((url, index) => ({
        order: index + 1,
        sourceUrl: absoluteUrl(url),
        alt: productName,
        selector: 'json-ld-image'
      }));
    const domImages = Array.from(document.querySelectorAll('main img'))
      .map((img, index) => ({
        order: jsonImages.length + index + 1,
        sourceUrl: absoluteUrl(img.getAttribute('src') || img.currentSrc),
        alt: clean(img.getAttribute('alt')),
        srcset: img.getAttribute('srcset') || '',
        selector: 'main img'
      }))
      .filter((image) => image.sourceUrl);
    const all = jsonImages.concat(domImages);
    return all.filter((image) => {
      const value = `${image.sourceUrl} ${image.srcset} ${image.alt}`;
      if (!/cdn\/shop\/files\//i.test(value)) return false;
      if (/EDITS|RESIDENCY|banner|logo|icon|navigation|recommend|related|DAYWEAR|OCCASION|HOLIDAY|PARTY|SANDIWARA/i.test(value)) return false;
      if (skuPrefix && !value.includes(skuPrefix)) return false;
      if (productImagePattern && !productImagePattern.test(value)) return false;
      return true;
    });

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

    function extractSkuPrefix(product) {
      const offers = Array.isArray(product && product.offers) ? product.offers : [product && product.offers].filter(Boolean);
      const sku = clean(offers[0] && offers[0].sku);
      const match = sku.match(/^(.+?)-UK\d+/i);
      return match ? match[1] : sku.split('-UK')[0];
    }

    function escapeRegExp(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  });

  const seen = new Set();
  return candidates
    .map((candidate) => {
      const highQualityUrl = toSelfPortraitHighQualityUrl(candidate.sourceUrl);
      return {
        ...candidate,
        url: highQualityUrl,
        sourceUrl: candidate.sourceUrl,
        canonicalKey: canonicalSelfPortraitImageKey(highQualityUrl),
        role: candidate.order === 1 ? 'main' : 'sub',
        warningWidth: HIGH_RES_WARNING_WIDTH
      };
    })
    .filter((candidate) => {
      if (!candidate.url || seen.has(candidate.canonicalKey)) return false;
      seen.add(candidate.canonicalKey);
      return true;
    })
    .sort((a, b) => orderFromUrl(a.url) - orderFromUrl(b.url));
}

async function extractSelfPortraitSizeGuide(page) {
  await dismissCookieOverlay(page);
  const trigger = page.locator('#drw-Drawer_SizeGuide-trigger, button[data-drawers-trigger="size-guide"]').first();
  if (await trigger.count().catch(() => 0)) {
    await trigger.click({ force: true, timeout: 10000 }).catch(async () => {
      await page.evaluate(() => {
        const element = document.querySelector('#drw-Drawer_SizeGuide-trigger, button[data-drawers-trigger="size-guide"]');
        if (element) element.click();
      });
    });
  }
  await page.waitForTimeout(800);
  await page.getByText(/Garment measurement/i).first().click({ force: true, timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.getByText(/Centimetres/i).first().click({ force: true, timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);

  const table = page.locator('.prd-SizeGuide_Table').filter({ hasText: /SIZE|LENGTH|BUST|WAIST|HIP|SHOULDER|SLEEVE|HEM/i }).first();
  if (!await table.count().catch(() => 0)) {
    return {
      available: false,
      unit: 'CENTIMETRES',
      type: 'Garment measurement',
      rows: [],
      formatted: '',
      screenshotBase64: '',
      warnings: ['Size guide table not found']
    };
  }

  const rows = await table.evaluate((element) => Array.from(element.querySelectorAll('tr'))
    .map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim()))
    .filter((row) => row.some(Boolean)));
  const screenshot = await table.screenshot({ type: 'jpeg', quality: 90 });
  return {
    available: rows.length > 0,
    unit: 'CENTIMETRES',
    type: 'Garment measurement',
    rows,
    formatted: formatGarmentMeasurements(rows),
    screenshotBase64: screenshot.toString('base64'),
    screenshotFileName: 'size_guide.jpg',
    warnings: []
  };
}

async function dismissCookieOverlay(page) {
  for (const selector of ['button.cc-allow', '.pd-cp-ui-acceptAll']) {
    const button = page.locator(selector).first();
    if (await button.count().catch(() => 0)) {
      await button.click({ force: true, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
}

function toSelfPortraitHighQualityUrl(imageUrl) {
  try {
    const parsed = new URL(String(imageUrl).startsWith('//') ? `https:${imageUrl}` : imageUrl);
    parsed.searchParams.delete('width');
    return parsed.href;
  } catch (_) {
    return String(imageUrl || '').replace(/([?&])width=\d+&?/i, '$1').replace(/[?&]$/, '');
  }
}

function canonicalSelfPortraitImageKey(imageUrl) {
  try {
    const parsed = new URL(String(imageUrl).startsWith('//') ? `https:${imageUrl}` : imageUrl);
    parsed.searchParams.delete('width');
    return `${parsed.hostname}${parsed.pathname}?v=${parsed.searchParams.get('v') || ''}`;
  } catch (_) {
    return String(imageUrl || '').replace(/([?&])width=\d+&?/i, '$1').replace(/[?&]$/, '');
  }
}

function orderFromUrl(imageUrl) {
  const match = String(imageUrl || '').match(/_([0-9]+)\.jpe?g/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function formatGarmentMeasurements(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return '';
  const header = rows[0];
  const sizes = header.slice(1).filter(Boolean);
  return sizes.map((size, index) => {
    const measurements = rows.slice(1)
      .map((row) => {
        const label = row[0];
        const value = row[index + 1];
        return label && value ? `${label} ${value}cm` : '';
      })
      .filter(Boolean)
      .join('／');
    return measurements ? `UK${size}：${measurements}` : '';
  }).filter(Boolean).join('\n');
}

module.exports = {
  SELF_PORTRAIT_IMAGE_FAILURE_STATUS,
  HIGH_RES_WARNING_WIDTH,
  isSelfPortraitUrl,
  extractSelfPortraitProductDetails,
  extractSelfPortraitImages,
  extractSelfPortraitSizeGuide,
  toSelfPortraitHighQualityUrl,
  canonicalSelfPortraitImageKey,
  formatGarmentMeasurements
};
