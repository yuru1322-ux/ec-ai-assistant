const TESSABIT_HOSTS = new Set(['tessabit.com', 'www.tessabit.com']);
const HIGH_RES_WARNING_WIDTH = 1000;

function isTessabitUrl(url) {
  try {
    const parsed = new URL(url);
    return TESSABIT_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

async function extractTessabitImages(page) {
  const candidates = await page.evaluate(() => {
    const absoluteUrl = (value) => {
      if (!value) return '';
      try {
        return new URL(value, location.href).href;
      } catch (_) {
        return '';
      }
    };

    return Array.from(document.querySelectorAll('.multimedia--image-original span.js-zoom-image[data-zoom]'))
      .map((span, index) => {
        const altSource = span.closest('[alt]');
        return {
          order: index + 1,
          alt: (altSource && altSource.getAttribute('alt')) || '',
          sourceUrl: absoluteUrl(span.getAttribute('data-zoom')),
          selector: '.multimedia--image-original span.js-zoom-image[data-zoom]'
        };
      })
      .filter((item) => item.sourceUrl);
  });

  const seen = new Set();
  return candidates
    .map((candidate) => ({
      ...candidate,
      url: candidate.sourceUrl,
      canonicalKey: canonicalTessabitImageKey(candidate.sourceUrl),
      role: candidate.order === 1 ? 'main' : 'sub',
      warningWidth: HIGH_RES_WARNING_WIDTH
    }))
    .filter((candidate) => {
      if (seen.has(candidate.canonicalKey)) return false;
      seen.add(candidate.canonicalKey);
      return true;
    });
}

function canonicalTessabitImageKey(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    parsed.search = '';
    return parsed.href;
  } catch (_) {
    return String(imageUrl || '').split('?')[0];
  }
}

module.exports = {
  HIGH_RES_WARNING_WIDTH,
  isTessabitUrl,
  extractTessabitImages,
  canonicalTessabitImageKey
};
