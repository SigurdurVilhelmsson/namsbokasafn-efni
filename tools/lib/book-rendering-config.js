/**
 * book-rendering-config.js
 *
 * Per-book rendering configuration for cnxml-render.js.
 * Each book (Chemistry, Biology, Microbiology) has different note types,
 * end-of-chapter section structures, and image naming conventions.
 *
 * Shared config is inherited by all books; book-specific config overrides.
 */

// =====================================================================
// SHARED CONFIG (all OpenStax books)
// =====================================================================

const SHARED_NOTE_LABELS = {
  'link-to-learning': 'Tengill til náms',
  interactive: 'Gagnvirkt',
  default: null,
};

const SHARED_TITLE_TRANSLATIONS = {
  'Answer:': 'Svar:',
  Answer: 'Svar',
  Solution: 'Lausn',
  'Check Your Learning': 'Prófaðu þekkingu þína',
  'CHECK YOUR LEARNING': 'Prófaðu þekkingu þína',
};

const SHARED_END_OF_CHAPTER = {
  summary: {
    titleIs: 'Samantekt',
    titleEn: 'Key Concepts and Summary',
    slug: 'summary',
    compiled: true, // Compiled from all modules
  },
  glossary: {
    titleIs: 'Lykilhugtök',
    titleEn: 'Key Terms',
    slug: 'key-terms',
    compiled: true,
  },
};

// =====================================================================
// CHEMISTRY 2e (efnafraedi-2e)
// =====================================================================

const CHEMISTRY_CONFIG = {
  noteTypeLabels: {
    ...SHARED_NOTE_LABELS,
    'chemistry everyday-life': 'Efnafræði í daglegu lífi',
    'everyday-life': 'Efnafræði í daglegu lífi',
    'sciences-interconnect': 'Hvernig vísindagreinar tengjast',
    'chemist-portrait': 'Efnafræðingur í brennidepli',
    'chem-connections': 'Tengsl við efnafræði',
    'green-chemistry': 'Græn efnafræði',
    'safety-hazard': 'Öryggisviðvörun',
    'lab-equipment': 'Tilraunabúnaður',
  },

  titleTranslations: {
    ...SHARED_TITLE_TRANSLATIONS,
    'Solution: Using the Equation': 'Lausn: Notkun jöfnunnar',
    'Solution: Supporting Why the General Equation Is Valid':
      'Lausn: Rökstuðningur fyrir almennri jöfnu',
  },

  endOfChapterSections: {
    ...SHARED_END_OF_CHAPTER,
    'key-equations': {
      titleIs: 'Lykiljöfnur',
      titleEn: 'Key Equations',
      slug: 'key-equations',
      compiled: false, // Extracted from last module
    },
    exercises: {
      titleIs: 'Dæmi í lok kafla',
      titleEn: 'End of Chapter Exercises',
      slug: 'exercises',
      exerciseType: true,
      compiled: true,
    },
  },

  // Section classes to exclude from main body rendering
  // (they get their own standalone pages)
  excludedSectionClasses: ['summary', 'key-equations', 'exercises'],

  specialModules: {
    m68859: 'periodic-table',
  },
};

// =====================================================================
// BIOLOGY 2e (liffraedi-2e)
// =====================================================================

const BIOLOGY_CONFIG = {
  noteTypeLabels: {
    ...SHARED_NOTE_LABELS,
    'visual-connection': 'Sjónræn tenging',
    evolution: 'Þróun',
    career: 'Starfsferill',
  },

  titleTranslations: {
    ...SHARED_TITLE_TRANSLATIONS,
  },

  endOfChapterSections: {
    ...SHARED_END_OF_CHAPTER,
    'multiple-choice': {
      titleIs: 'Fjölvalsspurningar',
      titleEn: 'Multiple Choice',
      slug: 'exercises',
      exerciseType: true,
      compiled: true,
    },
    'critical-thinking': {
      titleIs: 'Gagnrýnin hugsun',
      titleEn: 'Critical Thinking',
      slug: 'exercises',
      exerciseType: true,
      compiled: true,
    },
    'visual-exercise': {
      titleIs: 'Sjónrænar æfingar',
      titleEn: 'Visual Exercise',
      slug: 'exercises',
      exerciseType: true,
      compiled: true,
    },
  },

  excludedSectionClasses: ['summary', 'multiple-choice', 'critical-thinking', 'visual-exercise'],

  specialModules: {},
};

// =====================================================================
// MICROBIOLOGY (orverufraedi)
// =====================================================================

const MICROBIOLOGY_CONFIG = {
  noteTypeLabels: {
    ...SHARED_NOTE_LABELS,
    'microbiology check-your-understanding': 'Prófaðu skilning þinn',
    'microbiology clinical-focus': 'Klínísk sjónarmið',
    'microbiology link-to-learning': 'Tengill til náms',
    'microbiology micro-connection': 'Tengsl við örverufræði',
    'microbiology disease-profile': 'Sjúkdómslýsing',
    'microbiology eye-on-ethics': 'Siðfræðilegt sjónarhorn',
    'microbiology case-in-point': 'Dæmi úr veruleikanum',
  },

  titleTranslations: {
    ...SHARED_TITLE_TRANSLATIONS,
  },

  endOfChapterSections: {
    ...SHARED_END_OF_CHAPTER,
    'multiple-choice': {
      titleIs: 'Fjölvalsspurningar',
      titleEn: 'Multiple Choice',
      slug: 'multiple-choice',
      exerciseType: true,
      compiled: true,
    },
    'fill-in-the-blank': {
      titleIs: 'Fylltu í eyðurnar',
      titleEn: 'Fill in the Blank',
      slug: 'fill-in-the-blank',
      exerciseType: true,
      compiled: true,
    },
    'short-answer': {
      titleIs: 'Stuttsvörun',
      titleEn: 'Short Answer',
      slug: 'short-answer',
      exerciseType: true,
      compiled: true,
    },
    'critical-thinking': {
      titleIs: 'Gagnrýnin hugsun',
      titleEn: 'Critical Thinking',
      slug: 'critical-thinking',
      exerciseType: true,
      compiled: true,
    },
    'true-false': {
      titleIs: 'Rétt eða rangt',
      titleEn: 'True/False',
      slug: 'true-false',
      exerciseType: true,
      compiled: true,
    },
    matching: {
      titleIs: 'Pörun',
      titleEn: 'Matching',
      slug: 'matching',
      exerciseType: true,
      compiled: true,
    },
  },

  excludedSectionClasses: [
    'summary',
    'multiple-choice',
    'fill-in-the-blank',
    'short-answer',
    'critical-thinking',
    'true-false',
    'matching',
  ],

  specialModules: {},
};

// =====================================================================
// ORGANIC CHEMISTRY (lifraen-efnafraedi)
// =====================================================================

const ORGANIC_CHEMISTRY_CONFIG = {
  noteTypeLabels: {
    ...SHARED_NOTE_LABELS,
    // Organic Chemistry notes use <title> rather than class attributes;
    // the fallback label generator handles these automatically.
  },

  titleTranslations: {
    ...SHARED_TITLE_TRANSLATIONS,
  },

  endOfChapterSections: {
    ...SHARED_END_OF_CHAPTER,
    'section-exercises': {
      titleIs: 'Æfingar',
      titleEn: 'Exercises',
      slug: 'exercises',
      exerciseType: true,
      compiled: true,
    },
    'additional-problems': {
      titleIs: 'Viðbótardæmi',
      titleEn: 'Additional Problems',
      slug: 'additional-problems',
      exerciseType: true,
      compiled: true,
    },
    'chemistry-matters': {
      titleIs: 'Efnafræði skiptir máli',
      titleEn: 'Chemistry Matters',
      slug: 'chemistry-matters',
      compiled: true,
    },
  },

  excludedSectionClasses: [
    'summary',
    'key-terms',
    'section-exercises',
    'additional-problems',
    'chemistry-matters',
  ],

  specialModules: {},
};

// =====================================================================
// COLLEGE PHYSICS 2e (edlisfraedi-2e)
// =====================================================================

const COLLEGE_PHYSICS_CONFIG = {
  noteTypeLabels: {
    ...SHARED_NOTE_LABELS,
    interactive: 'Gagnvirkt',
    // Physics notes for misconceptions, take-home experiments, etc. use
    // <title> without class — handled by fallback label generator.
  },

  titleTranslations: {
    ...SHARED_TITLE_TRANSLATIONS,
  },

  endOfChapterSections: {
    ...SHARED_END_OF_CHAPTER,
    'section-summary': {
      titleIs: 'Samantekt',
      titleEn: 'Section Summary',
      slug: 'summary',
      compiled: true,
    },
    'conceptual-questions': {
      titleIs: 'Hugtakaspurningar',
      titleEn: 'Conceptual Questions',
      slug: 'conceptual-questions',
      exerciseType: true,
      compiled: true,
    },
    'problems-exercises': {
      titleIs: 'Verkefni og dæmi',
      titleEn: 'Problems & Exercises',
      slug: 'problems-exercises',
      exerciseType: true,
      compiled: true,
    },
    'ap-test-prep': {
      titleIs: 'AP prófundirbúningur',
      titleEn: 'AP Test Prep',
      slug: 'ap-test-prep',
      exerciseType: true,
      compiled: true,
    },
  },

  excludedSectionClasses: [
    'summary',
    'section-summary',
    'conceptual-questions',
    'problems-exercises',
    'ap-test-prep',
  ],

  specialModules: {},
};

// =====================================================================
// BOOK REGISTRY
// =====================================================================

const BOOK_CONFIGS = {
  'efnafraedi-2e': CHEMISTRY_CONFIG,
  'liffraedi-2e': BIOLOGY_CONFIG,
  orverufraedi: MICROBIOLOGY_CONFIG,
  'lifraen-efnafraedi': ORGANIC_CHEMISTRY_CONFIG,
  'edlisfraedi-2e': COLLEGE_PHYSICS_CONFIG,
};

/**
 * Get rendering config for a book.
 * Falls back to a sensible default for unknown books.
 *
 * @param {string} bookSlug - Book identifier (e.g., 'efnafraedi-2e')
 * @returns {object} Book rendering configuration
 */
function getBookRenderConfig(bookSlug) {
  const config = BOOK_CONFIGS[bookSlug];
  if (config) return config;

  // Fallback config for unknown books
  console.warn(`Warning: No rendering config for book "${bookSlug}", using defaults`);
  return {
    noteTypeLabels: { ...SHARED_NOTE_LABELS },
    titleTranslations: { ...SHARED_TITLE_TRANSLATIONS },
    endOfChapterSections: { ...SHARED_END_OF_CHAPTER },
    excludedSectionClasses: ['summary'],
    specialModules: {},
  };
}

/**
 * Generate a readable fallback label from a CSS class name.
 * E.g., 'clinical-focus' → 'Clinical Focus'
 *
 * @param {string} className - CSS class name
 * @returns {string} Human-readable label
 */
function generateFallbackLabel(className) {
  if (!className) return '';
  // Remove book prefix (e.g., "microbiology " from "microbiology clinical-focus")
  const words = className
    .replace(/^(chemistry|biology|microbiology)\s+/i, '')
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(' ');
}

/**
 * Get the list of exercise-type section classes for a book.
 * These are end-of-chapter sections marked with exerciseType: true.
 *
 * @param {string} bookSlug - Book identifier
 * @returns {string[]} Array of exercise section class names
 */
function getExerciseSectionClasses(bookSlug) {
  const config = getBookRenderConfig(bookSlug);
  return Object.entries(config.endOfChapterSections)
    .filter(([, cfg]) => cfg.exerciseType)
    .map(([cls]) => cls);
}

export {
  getBookRenderConfig,
  generateFallbackLabel,
  getExerciseSectionClasses,
  SHARED_NOTE_LABELS,
  SHARED_TITLE_TRANSLATIONS,
};
