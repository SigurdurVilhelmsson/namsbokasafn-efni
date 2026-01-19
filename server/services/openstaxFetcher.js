/**
 * OpenStax Fetcher Service
 *
 * Fetches book structure (chapters, modules) from OpenStax GitHub repositories.
 * This allows automatic registration of books without maintaining local JSON files.
 */

const https = require('https');

// Known OpenStax book repositories
const BOOK_REPOS = {
  'chemistry-2e': {
    repo: 'openstax/osbooks-chemistry-bundle',
    collection: 'chemistry-2e.collection.xml'
  },
  'chemistry-atoms-first-2e': {
    repo: 'openstax/osbooks-chemistry-bundle',
    collection: 'chemistry-atoms-first-2e.collection.xml'
  },
  'biology-2e': {
    repo: 'openstax/osbooks-biology-bundle',
    collection: 'biology-2e.collection.xml'
  },
  'physics': {
    repo: 'openstax/osbooks-physics',
    collection: 'physics.collection.xml'
  },
  'college-algebra': {
    repo: 'openstax/osbooks-college-algebra-bundle',
    collection: 'college-algebra.collection.xml'
  },
  'calculus-volume-1': {
    repo: 'openstax/osbooks-calculus-bundle',
    collection: 'calculus-volume-1.collection.xml'
  }
};

/**
 * Fetch raw content from GitHub
 */
function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'namsbokasafn-pipeline'
      }
    };

    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchRaw(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Parse collection.xml to extract chapters and module IDs
 */
function parseCollectionXml(xml) {
  const chapters = [];
  const standaloneModules = [];

  // Match subcollections (chapters)
  const subcollectionRegex = /<col:subcollection[^>]*>([\s\S]*?)<\/col:subcollection>/g;
  const titleRegex = /<md:title>([^<]+)<\/md:title>/;
  const moduleRegex = /<col:module\s+document="([^"]+)"/g;

  let match;
  let chapterNum = 0;

  while ((match = subcollectionRegex.exec(xml)) !== null) {
    const subcollectionContent = match[1];
    const titleMatch = subcollectionContent.match(titleRegex);

    if (titleMatch) {
      chapterNum++;
      const chapter = {
        chapter: chapterNum,
        title: titleMatch[1].trim(),
        modules: []
      };

      // Extract module IDs from this chapter
      let moduleMatch;
      const moduleRegexLocal = /<col:module\s+document="([^"]+)"/g;
      while ((moduleMatch = moduleRegexLocal.exec(subcollectionContent)) !== null) {
        chapter.modules.push(moduleMatch[1]);
      }

      chapters.push(chapter);
    }
  }

  // Also find standalone modules before first subcollection (like preface)
  // and after all subcollections (like appendices)
  const beforeFirstChapter = xml.split('<col:subcollection')[0];
  const afterLastChapter = xml.split('</col:subcollection>').pop();

  // Preface module (usually the first standalone module)
  const prefaceMatch = beforeFirstChapter.match(/<col:module\s+document="([^"]+)"/);
  const preface = prefaceMatch ? prefaceMatch[1] : null;

  // Appendix modules (standalone modules after chapters)
  const appendixModules = [];
  let appendixMatch;
  const appendixRegex = /<col:module\s+document="([^"]+)"/g;
  while ((appendixMatch = appendixRegex.exec(afterLastChapter)) !== null) {
    appendixModules.push(appendixMatch[1]);
  }

  return { chapters, preface, appendixModules };
}

/**
 * Fetch module title from CNXML file
 */
async function fetchModuleTitle(repo, moduleId) {
  const url = `https://raw.githubusercontent.com/${repo}/main/modules/${moduleId}/index.cnxml`;

  try {
    const cnxml = await fetchRaw(url);
    const titleMatch = cnxml.match(/<title>([^<]+)<\/title>/);
    return titleMatch ? titleMatch[1].trim() : moduleId;
  } catch (error) {
    console.warn(`Could not fetch title for module ${moduleId}: ${error.message}`);
    return moduleId;
  }
}

/**
 * Determine section number from module position in chapter
 * First module is typically "intro", rest are numbered
 */
function determineSectionNumber(chapterNum, moduleIndex, totalModules) {
  if (moduleIndex === 0) {
    return 'intro';
  }
  return `${chapterNum}.${moduleIndex}`;
}

/**
 * Fetch complete book structure from OpenStax
 *
 * @param {string} bookSlug - The OpenStax book slug (e.g., 'chemistry-2e')
 * @returns {Promise<Object>} Book structure with chapters and modules
 */
async function fetchBookStructure(bookSlug) {
  const bookConfig = BOOK_REPOS[bookSlug];
  if (!bookConfig) {
    throw new Error(`Unknown book: ${bookSlug}. Available: ${Object.keys(BOOK_REPOS).join(', ')}`);
  }

  const { repo, collection } = bookConfig;

  console.log(`Fetching collection from ${repo}...`);
  const collectionUrl = `https://raw.githubusercontent.com/${repo}/main/collections/${collection}`;
  const collectionXml = await fetchRaw(collectionUrl);

  console.log('Parsing collection structure...');
  const { chapters, preface, appendixModules } = parseCollectionXml(collectionXml);

  console.log(`Found ${chapters.length} chapters, fetching module titles...`);

  // Fetch all module titles in parallel (with some rate limiting)
  const allModules = [];

  // Collect all modules to fetch
  for (const chapter of chapters) {
    for (const moduleId of chapter.modules) {
      allModules.push({ chapter, moduleId });
    }
  }

  // Batch fetch titles (10 at a time to avoid rate limiting)
  const batchSize = 10;
  for (let i = 0; i < allModules.length; i += batchSize) {
    const batch = allModules.slice(i, i + batchSize);
    const titles = await Promise.all(
      batch.map(({ moduleId }) => fetchModuleTitle(repo, moduleId))
    );

    batch.forEach((item, idx) => {
      item.title = titles[idx];
    });

    // Small delay between batches
    if (i + batchSize < allModules.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Build final structure
  const chaptersWithTitles = chapters.map(chapter => {
    const modulesWithTitles = chapter.modules.map((moduleId, idx) => {
      const moduleInfo = allModules.find(m => m.moduleId === moduleId && m.chapter === chapter);
      return {
        id: moduleId,
        section: determineSectionNumber(chapter.chapter, idx, chapter.modules.length),
        title: moduleInfo ? moduleInfo.title : moduleId
      };
    });

    return {
      chapter: chapter.chapter,
      title: chapter.title,
      titleIs: null, // Will be filled in during registration if available
      modules: modulesWithTitles
    };
  });

  // Handle appendices as additional chapters
  const appendices = [];
  if (appendixModules.length > 0) {
    console.log(`Fetching ${appendixModules.length} appendix titles...`);

    for (let i = 0; i < appendixModules.length; i += batchSize) {
      const batch = appendixModules.slice(i, i + batchSize);
      const titles = await Promise.all(
        batch.map(moduleId => fetchModuleTitle(repo, moduleId))
      );

      batch.forEach((moduleId, idx) => {
        appendices.push({
          id: moduleId,
          title: titles[idx]
        });
      });

      if (i + batchSize < appendixModules.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  return {
    book: bookSlug,
    repo,
    preface,
    chapters: chaptersWithTitles,
    appendices,
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Get list of available books that can be fetched
 */
function getAvailableBooks() {
  return Object.keys(BOOK_REPOS);
}

/**
 * Check if a book can be fetched from OpenStax
 */
function isBookAvailable(bookSlug) {
  return bookSlug in BOOK_REPOS;
}

module.exports = {
  fetchBookStructure,
  getAvailableBooks,
  isBookAvailable,
  BOOK_REPOS
};
