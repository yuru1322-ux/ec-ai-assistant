const VIVIENNE_HOST = 'www.viviennewestwood.com';
const HIGH_RES_WARNING_WIDTH = 2000;

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
  extractVivienneWestwoodImages,
  toVivienneHighQualityUrl,
  canonicalVivienneImageKey
};
