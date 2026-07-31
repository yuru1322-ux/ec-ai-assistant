const crypto = require('crypto');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getImageMetadata(buffer, contentType = '') {
  const type = detectType(buffer, contentType);
  const dimensions = getDimensions(buffer, type);
  return {
    type,
    extension: extensionForType(type),
    width: dimensions.width || 0,
    height: dimensions.height || 0,
    bytes: buffer.length,
    hash: sha256(buffer)
  };
}

function detectType(buffer, contentType) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
  if (buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a') return 'png';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  return 'jpg';
}

function extensionForType(type) {
  if (type === 'png') return '.png';
  if (type === 'webp') return '.webp';
  return '.jpg';
}

function getDimensions(buffer, type) {
  if (type === 'png') {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  }

  if (type === 'webp') {
    return getWebpDimensions(buffer);
  }

  return getJpegDimensions(buffer);
}

function getJpegDimensions(buffer) {
  let offset = 2;

  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);

    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }

    offset += 2 + length;
  }

  return {};
}

function getWebpDimensions(buffer) {
  const chunkType = buffer.slice(12, 16).toString('ascii');

  if (chunkType === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }

  if (chunkType === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }

  if (chunkType === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }

  return {};
}

module.exports = { getImageMetadata, sha256 };
