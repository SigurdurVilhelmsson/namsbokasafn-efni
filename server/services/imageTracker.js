/**
 * Image Tracking Service
 *
 * Tracks image translation status across chapters.
 * Images are stored in OneDrive (editable source) and GitHub (web-ready exports).
 *
 * Workflow:
 * 1. Auto-inventory: Pipeline extracts image references from CNXML source
 * 2. Dashboard shows: "Chapter 1: 12 images, 8 done, 4 pending"
 * 3. Editor clicks pending: Links to OneDrive editable source
 * 4. Editor exports: PNG, under 500KB, correct dimensions
 * 5. Editor uploads: Via dashboard creates PR to images/ folder
 */

const fs = require('fs');
const path = require('path');

// Status values for images
const IMAGE_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  TRANSLATED: 'translated',
  APPROVED: 'approved',
  NOT_NEEDED: 'not-needed',
};

// OneDrive base paths (configurable)
const ONEDRIVE_CONFIG = {
  baseUrl: process.env.ONEDRIVE_BASE_URL || 'onedrive://Namsbokasafn',
  sharePointUrl: process.env.SHAREPOINT_URL || null,
};

/**
 * Extract image references from CNXML content
 */
function extractImagesFromCnxml(cnxmlContent, _options = {}) {
  const images = [];

  // Match image tags
  const imageRegex = /<image\s+[^>]*src="([^"]+)"[^>]*(?:mime-type="([^"]+)")?[^>]*>/gi;
  let match;

  while ((match = imageRegex.exec(cnxmlContent)) !== null) {
    const src = match[1];
    const mimeType = match[2] || 'image/jpeg';

    images.push({
      id: generateImageId(src),
      originalSrc: src,
      mimeType,
      type: getImageType(mimeType),
      containsText: detectTextInImage(cnxmlContent, src),
      position: match.index,
    });
  }

  // Match media tags with images
  const mediaRegex = /<media[^>]*>\s*<image\s+[^>]*src="([^"]+)"[^>]*>/gi;
  while ((match = mediaRegex.exec(cnxmlContent)) !== null) {
    const src = match[1];
    if (!images.find((i) => i.originalSrc === src)) {
      images.push({
        id: generateImageId(src),
        originalSrc: src,
        mimeType: 'image/jpeg',
        type: 'figure',
        containsText: true,
        position: match.index,
      });
    }
  }

  return images;
}

/**
 * Generate image ID from source path
 */
function generateImageId(src) {
  const filename = path.basename(src, path.extname(src));
  return filename.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
}

/**
 * Determine image type from MIME type
 */
function getImageType(mimeType) {
  if (mimeType.includes('svg')) return 'vector';
  if (mimeType.includes('gif')) return 'animation';
  return 'raster';
}

/**
 * Detect if image likely contains text that needs translation
 */
function detectTextInImage(content, src) {
  const srcIndex = content.indexOf(src);
  const context = content.substring(Math.max(0, srcIndex - 200), srcIndex + 200);

  const textIndicators = [
    'figure',
    'diagram',
    'chart',
    'graph',
    'table',
    'label',
    'equation',
    'formula',
    'legend',
  ];

  return textIndicators.some((indicator) => context.toLowerCase().includes(indicator));
}

/**
 * Load image tracking data for a chapter
 */
function loadImageData(book, chapter) {
  const chapterStr = String(chapter).padStart(2, '0');
  const dataPath = path.join(
    __dirname,
    '..',
    '..',
    'books',
    book,
    'chapters',
    'ch' + chapterStr,
    'images.json'
  );

  if (fs.existsSync(dataPath)) {
    try {
      return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    } catch (err) {
      console.error('Error loading image data: ' + err.message);
    }
  }

  return { images: {}, lastUpdated: null };
}

/**
 * Save image tracking data for a chapter
 */
function saveImageData(book, chapter, data) {
  const chapterStr = String(chapter).padStart(2, '0');
  const dataDir = path.join(__dirname, '..', '..', 'books', book, 'chapters', 'ch' + chapterStr);
  const dataPath = path.join(dataDir, 'images.json');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

/**
 * Get OneDrive link for editable source
 */
function getEditableSourceLink(book, chapter, imageId, extension) {
  extension = extension || '.pdf';
  const chapterStr = String(chapter).padStart(2, '0');
  const onedrivePath =
    ONEDRIVE_CONFIG.baseUrl +
    '/' +
    book +
    '/images-editable/ch' +
    chapterStr +
    '/' +
    imageId +
    extension;

  if (ONEDRIVE_CONFIG.sharePointUrl) {
    return {
      onedrive: onedrivePath,
      sharepoint:
        ONEDRIVE_CONFIG.sharePointUrl +
        '/' +
        book +
        '/images-editable/ch' +
        chapterStr +
        '/' +
        imageId +
        extension,
    };
  }

  return {
    onedrive: onedrivePath,
    sharepoint: null,
  };
}

/**
 * Get GitHub path for translated image
 */
function getTranslatedImagePath(book, chapter, imageId) {
  const chapterStr = String(chapter).padStart(2, '0');
  return 'books/' + book + '/05-publication/images/ch' + chapterStr + '/' + imageId + '.png';
}

/**
 * Update image status
 */
function updateImageStatus(book, chapter, imageId, status, metadata) {
  metadata = metadata || {};
  const data = loadImageData(book, chapter);

  if (!data.images[imageId]) {
    data.images[imageId] = {
      id: imageId,
      createdAt: new Date().toISOString(),
    };
  }

  data.images[imageId] = {
    ...data.images[imageId],
    status: status,
    ...metadata,
    updatedAt: new Date().toISOString(),
  };

  saveImageData(book, chapter, data);

  return data.images[imageId];
}

/**
 * Get image statistics for a chapter
 */
function getChapterImageStats(book, chapter) {
  const data = loadImageData(book, chapter);
  const images = Object.values(data.images);

  return {
    total: images.length,
    pending: images.filter((i) => i.status === IMAGE_STATUS.PENDING).length,
    inProgress: images.filter((i) => i.status === IMAGE_STATUS.IN_PROGRESS).length,
    translated: images.filter((i) => i.status === IMAGE_STATUS.TRANSLATED).length,
    approved: images.filter((i) => i.status === IMAGE_STATUS.APPROVED).length,
    notNeeded: images.filter((i) => i.status === IMAGE_STATUS.NOT_NEEDED).length,
    withText: images.filter((i) => i.containsText).length,
    lastUpdated: data.lastUpdated,
  };
}

/**
 * Get image statistics for a book
 */
function getBookImageStats(book) {
  const bookPath = path.join(__dirname, '..', '..', 'books', book, 'chapters');

  if (!fs.existsSync(bookPath)) {
    return { chapters: [], totals: {} };
  }

  const chapters = fs
    .readdirSync(bookPath)
    .filter((d) => d.startsWith('ch'))
    .map((d) => parseInt(d.replace('ch', '')))
    .sort((a, b) => a - b);

  const chapterStats = chapters.map((ch) => ({
    chapter: ch,
    ...getChapterImageStats(book, ch),
  }));

  // Calculate totals
  const totals = {
    chapters: chapters.length,
    total: chapterStats.reduce((sum, ch) => sum + ch.total, 0),
    pending: chapterStats.reduce((sum, ch) => sum + ch.pending, 0),
    inProgress: chapterStats.reduce((sum, ch) => sum + ch.inProgress, 0),
    translated: chapterStats.reduce((sum, ch) => sum + ch.translated, 0),
    approved: chapterStats.reduce((sum, ch) => sum + ch.approved, 0),
    notNeeded: chapterStats.reduce((sum, ch) => sum + ch.notNeeded, 0),
  };

  const doneCount = totals.translated + totals.approved + totals.notNeeded;
  totals.percentComplete = totals.total > 0 ? Math.round((doneCount / totals.total) * 100) : 0;

  return {
    chapters: chapterStats,
    totals: totals,
  };
}

/**
 * Initialize image tracking from CNXML source
 */
function initializeFromCnxml(book, chapter, cnxmlContent) {
  const extractedImages = extractImagesFromCnxml(cnxmlContent);
  const existingData = loadImageData(book, chapter);

  const data = {
    images: { ...existingData.images },
    sourceExtractedAt: new Date().toISOString(),
  };

  // Add new images, preserve existing status
  for (const img of extractedImages) {
    if (!data.images[img.id]) {
      data.images[img.id] = {
        ...img,
        status: IMAGE_STATUS.PENDING,
        source: getEditableSourceLink(book, chapter, img.id),
        targetPath: getTranslatedImagePath(book, chapter, img.id),
        createdAt: new Date().toISOString(),
      };
    } else {
      // Update source info without changing status
      data.images[img.id] = {
        ...data.images[img.id],
        ...img,
        source: getEditableSourceLink(book, chapter, img.id),
        targetPath: getTranslatedImagePath(book, chapter, img.id),
      };
    }
  }

  saveImageData(book, chapter, data);

  return {
    extracted: extractedImages.length,
    newImages: extractedImages.length - Object.keys(existingData.images).length,
    existing: Object.keys(existingData.images).length,
  };
}

module.exports = {
  IMAGE_STATUS: IMAGE_STATUS,
  extractImagesFromCnxml: extractImagesFromCnxml,
  loadImageData: loadImageData,
  saveImageData: saveImageData,
  getEditableSourceLink: getEditableSourceLink,
  getTranslatedImagePath: getTranslatedImagePath,
  updateImageStatus: updateImageStatus,
  getChapterImageStats: getChapterImageStats,
  getBookImageStats: getBookImageStats,
  initializeFromCnxml: initializeFromCnxml,
};
