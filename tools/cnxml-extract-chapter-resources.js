#!/usr/bin/env node

/**
 * cnxml-extract-chapter-resources.js
 *
 * Extract chapter-level resources from translated CNXML files:
 *   - Glossary (Key Terms with definitions)
 *   - Key Equations
 *   - Exercises
 *   - Answer Key (solutions to odd-numbered exercises)
 *
 * Usage:
 *   node tools/cnxml-extract-chapter-resources.js --book <book> --chapter <num> [options]
 *
 * Options:
 *   --book <name>      Book slug (e.g., efnafraedi)
 *   --chapter <num>    Chapter number
 *   --resource <type>  Resource type: glossary, equations, exercises, answers, all (default: all)
 *   --track <name>     Publication track: mt-preview, faithful (default: mt-preview)
 *   --format <fmt>     Output format: html, json (default: html)
 *   --verbose          Show detailed progress
 *   -h, --help         Show this help
 */

import fs from 'fs';
import path from 'path';
import katex from 'katex';
import { fileURLToPath } from 'url';
import { convertMathMLToLatex } from './lib/mathml-to-latex.js';
import { escapeAttr } from './lib/cnxml-elements.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// =====================================================================
// CONFIGURATION
// =====================================================================

const CONFIG = {
  sourceDir: (book) => path.join(REPO_ROOT, 'books', book, '01-source'),
  translatedDir: (book) => path.join(REPO_ROOT, 'books', book, '03-translated'),
  outputDir: (book, track) =>
    path.join(REPO_ROOT, 'books', book, '05-publication', track, 'chapters'),
};

// Module to section mapping for chapter 5 (will need to be generalized)
const MODULE_SECTIONS = {
  efnafraedi: {
    5: {
      m68723: { section: '5.0', title: 'Introduction' },
      m68724: { section: '5.1', title: 'Energy Basics' },
      m68726: { section: '5.2', title: 'Calorimetry' },
      m68727: { section: '5.3', title: 'Enthalpy' },
    },
  },
};

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================

/**
 * Render LaTeX to KaTeX HTML.
 */
function renderLatex(latex, displayMode = true) {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: true,
    });
  } catch (err) {
    return `<span class="katex-error" data-latex="${escapeAttr(latex)}">[Math]</span>`;
  }
}

/**
 * Process content with MathML, converting to KaTeX.
 */
function processContent(content, context = {}) {
  if (!content) return '';

  let result = content;

  // Convert MathML to KaTeX
  result = result.replace(/<m:math[^>]*>[\s\S]*?<\/m:math>/g, (mathml) => {
    const latex = convertMathMLToLatex(mathml);
    const katexHtml = renderLatex(latex, false);
    return `<span class="katex" data-latex="${escapeAttr(latex)}">${katexHtml}</span>`;
  });

  // Convert emphasis
  result = result.replace(
    /<emphasis\s+effect="([^"]*)"[^>]*>([\s\S]*?)<\/emphasis>/g,
    (match, effect, inner) => {
      const tag = effect === 'bold' ? 'strong' : effect === 'underline' ? 'u' : 'em';
      return `<${tag}>${processContent(inner, context)}</${tag}>`;
    }
  );

  // Convert sub/sup
  result = result.replace(/<sub>([\s\S]*?)<\/sub>/g, '<sub>$1</sub>');
  result = result.replace(/<sup>([\s\S]*?)<\/sup>/g, '<sup>$1</sup>');

  // Strip remaining CNXML/MathML tags (namespaced only)
  result = result.replace(/<[a-z]+:[^>]*\/>/gi, '');
  result = result.replace(/<\/?[a-z]+:[^>]*>/gi, '');

  return result;
}

/**
 * Extract text content, stripping all tags.
 */
function stripTags(content) {
  return content.replace(/<[^>]+>/g, '').trim();
}

/**
 * Get list of module files for a chapter.
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @param {string} source - 'translated' or 'source'
 */
function getModuleFiles(book, chapter, source = 'translated') {
  const chapterStr = String(chapter).padStart(2, '0');
  const baseDir = source === 'source' ? CONFIG.sourceDir(book) : CONFIG.translatedDir(book);
  const dir = path.join(baseDir, `ch${chapterStr}`);

  if (!fs.existsSync(dir)) {
    throw new Error(`Chapter directory not found: ${dir}`);
  }

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.cnxml'))
    .map((f) => path.join(dir, f))
    .sort();
}

/**
 * Get module info (section number, title) for a module.
 */
function getModuleInfo(book, chapter, moduleId) {
  const chapterModules = MODULE_SECTIONS[book]?.[chapter];
  if (chapterModules && chapterModules[moduleId]) {
    return chapterModules[moduleId];
  }
  // Fallback: use module ID
  return { section: moduleId, title: moduleId };
}

// =====================================================================
// GLOSSARY EXTRACTION
// =====================================================================

/**
 * Extract glossary definitions from a CNXML file.
 */
function extractGlossary(cnxmlContent, moduleId) {
  const definitions = [];

  // Extract glossary section
  const glossaryMatch = cnxmlContent.match(/<glossary>([\s\S]*?)<\/glossary>/);
  if (!glossaryMatch) return definitions;

  const glossaryContent = glossaryMatch[1];

  // Extract each definition
  const defPattern =
    /<definition[^>]*id="([^"]*)"[^>]*>\s*<term>([\s\S]*?)<\/term>\s*<meaning[^>]*>([\s\S]*?)<\/meaning>\s*<\/definition>/g;
  let match;

  while ((match = defPattern.exec(glossaryContent)) !== null) {
    const [, id, termRaw, meaningRaw] = match;
    definitions.push({
      id,
      moduleId,
      term: processContent(termRaw.trim()),
      termText: stripTags(termRaw.trim()),
      meaning: processContent(meaningRaw.trim()),
    });
  }

  return definitions;
}

/**
 * Build glossary HTML page.
 */
function buildGlossaryHtml(definitions, chapter, _book) {
  // Sort definitions alphabetically by term text
  const sorted = [...definitions].sort((a, b) =>
    a.termText.toLowerCase().localeCompare(b.termText.toLowerCase(), 'is')
  );

  const lines = [
    '<!DOCTYPE html>',
    '<html lang="is">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `  <title>Kafli ${chapter} - Lykilhugtök</title>`,
    '  <link rel="stylesheet" href="/styles/content.css">',
    '</head>',
    '<body>',
    '  <article class="chapter-resource glossary">',
    '    <header>',
    `      <h1>Lykilhugtök</h1>`,
    '    </header>',
    '    <main>',
    '      <dl class="glossary-list">',
  ];

  for (const def of sorted) {
    lines.push(`        <div class="glossary-entry" id="${escapeAttr(def.id)}">`);
    lines.push(`          <dt>${def.term}</dt>`);
    lines.push(`          <dd>${def.meaning}</dd>`);
    lines.push('        </div>');
  }

  lines.push(
    '      </dl>',
    '    </main>',
    '  </article>',
    '  <script type="application/json" id="page-data">',
    JSON.stringify(
      {
        chapter,
        type: 'glossary',
        termCount: definitions.length,
      },
      null,
      2
    ),
    '  </script>',
    '</body>',
    '</html>'
  );

  return lines.join('\n');
}

// =====================================================================
// KEY EQUATIONS EXTRACTION
// =====================================================================

/**
 * Extract key equations from a CNXML file.
 */
function extractKeyEquations(cnxmlContent, moduleId, moduleInfo) {
  const equations = [];

  // Find key-equations section
  const sectionMatch = cnxmlContent.match(
    /<section[^>]*class="key-equations"[^>]*>([\s\S]*?)<\/section>/
  );
  if (!sectionMatch) return equations;

  const sectionContent = sectionMatch[1];

  // Extract equations from table rows
  const rowPattern = /<row>\s*<entry>([\s\S]*?)<\/entry>\s*<\/row>/g;
  let match;
  let index = 0;

  while ((match = rowPattern.exec(sectionContent)) !== null) {
    const entryContent = match[1].trim();
    index++;

    // Convert MathML to LaTeX and render
    let latex = '';
    let html = '';

    const mathMatch = entryContent.match(/<m:math[^>]*>[\s\S]*?<\/m:math>/);
    if (mathMatch) {
      latex = convertMathMLToLatex(mathMatch[0]);
      html = renderLatex(latex, true);
    } else {
      // Plain text equation
      html = processContent(entryContent);
    }

    equations.push({
      moduleId,
      section: moduleInfo.section,
      sectionTitle: moduleInfo.title,
      index,
      latex,
      html,
    });
  }

  return equations;
}

/**
 * Build key equations HTML page.
 */
function buildEquationsHtml(equations, chapter, _book) {
  // Group equations by section
  const bySection = new Map();
  for (const eq of equations) {
    if (!bySection.has(eq.section)) {
      bySection.set(eq.section, { title: eq.sectionTitle, equations: [] });
    }
    bySection.get(eq.section).equations.push(eq);
  }

  const lines = [
    '<!DOCTYPE html>',
    '<html lang="is">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `  <title>Kafli ${chapter} - Lykiljöfnur</title>`,
    '  <link rel="stylesheet" href="/styles/content.css">',
    '</head>',
    '<body>',
    '  <article class="chapter-resource key-equations">',
    '    <header>',
    `      <h1>Lykiljöfnur</h1>`,
    '    </header>',
    '    <main>',
  ];

  for (const [section, data] of bySection) {
    lines.push(`      <section class="equations-section">`);
    lines.push(`        <h2>${section} ${data.title}</h2>`);
    lines.push('        <div class="equations-list">');

    for (const eq of data.equations) {
      lines.push('          <div class="equation-entry">');
      if (eq.latex) {
        lines.push(
          `            <div class="katex-display" data-latex="${escapeAttr(eq.latex)}">${eq.html}</div>`
        );
      } else {
        lines.push(`            <div class="equation-text">${eq.html}</div>`);
      }
      lines.push('          </div>');
    }

    lines.push('        </div>');
    lines.push('      </section>');
  }

  lines.push(
    '    </main>',
    '  </article>',
    '  <script type="application/json" id="page-data">',
    JSON.stringify(
      {
        chapter,
        type: 'key-equations',
        equationCount: equations.length,
      },
      null,
      2
    ),
    '  </script>',
    '</body>',
    '</html>'
  );

  return lines.join('\n');
}

// =====================================================================
// EXERCISES EXTRACTION
// =====================================================================

/**
 * Extract exercises from a CNXML file.
 */
function extractExercises(cnxmlContent, moduleId, moduleInfo) {
  const exercises = [];

  // Find exercises section
  const sectionMatch = cnxmlContent.match(
    /<section[^>]*class="exercises"[^>]*>([\s\S]*?)<\/section>/
  );
  if (!sectionMatch) return exercises;

  const sectionContent = sectionMatch[1];

  // Extract each exercise
  const exercisePattern = /<exercise[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/exercise>/g;
  let match;
  let index = 0;

  while ((match = exercisePattern.exec(sectionContent)) !== null) {
    const [, id, content] = match;
    index++;

    // Extract problem
    const problemMatch = content.match(/<problem[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/problem>/);
    const problem = problemMatch
      ? {
          id: problemMatch[1],
          content: extractProblemContent(problemMatch[2]),
        }
      : null;

    // Extract solution (if present)
    const solutionMatch = content.match(/<solution[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/solution>/);
    const solution = solutionMatch
      ? {
          id: solutionMatch[1],
          content: extractSolutionContent(solutionMatch[2]),
        }
      : null;

    exercises.push({
      id,
      moduleId,
      section: moduleInfo.section,
      sectionTitle: moduleInfo.title,
      number: index,
      problem,
      solution,
    });
  }

  return exercises;
}

/**
 * Extract and process problem content.
 */
function extractProblemContent(content) {
  // Extract paragraphs
  const paras = [];
  const paraPattern = /<para[^>]*>([\s\S]*?)<\/para>/g;
  let match;

  while ((match = paraPattern.exec(content)) !== null) {
    paras.push(processContent(match[1].trim()));
  }

  // Extract lists
  const lists = [];
  const listPattern = /<list[^>]*>([\s\S]*?)<\/list>/g;

  while ((match = listPattern.exec(content)) !== null) {
    const items = [];
    const itemPattern = /<item>([\s\S]*?)<\/item>/g;
    let itemMatch;

    while ((itemMatch = itemPattern.exec(match[1])) !== null) {
      items.push(processContent(itemMatch[1].trim()));
    }

    lists.push(items);
  }

  return { paras, lists };
}

/**
 * Extract and process solution content.
 */
function extractSolutionContent(content) {
  const paras = [];
  const paraPattern = /<para[^>]*>([\s\S]*?)<\/para>/g;
  let match;

  while ((match = paraPattern.exec(content)) !== null) {
    paras.push(processContent(match[1].trim()));
  }

  // If no paras found, try to get direct content
  if (paras.length === 0) {
    const cleaned = processContent(content.trim());
    if (cleaned) paras.push(cleaned);
  }

  return { paras };
}

/**
 * Build exercises HTML page.
 */
function buildExercisesHtml(exercises, chapter, _book) {
  // Group by section
  const bySection = new Map();
  for (const ex of exercises) {
    if (!bySection.has(ex.section)) {
      bySection.set(ex.section, { title: ex.sectionTitle, exercises: [] });
    }
    bySection.get(ex.section).exercises.push(ex);
  }

  const lines = [
    '<!DOCTYPE html>',
    '<html lang="is">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `  <title>Kafli ${chapter} - Æfingar</title>`,
    '  <link rel="stylesheet" href="/styles/content.css">',
    '</head>',
    '<body>',
    '  <article class="chapter-resource exercises">',
    '    <header>',
    `      <h1>Æfingar</h1>`,
    '    </header>',
    '    <main>',
  ];

  let globalNumber = 0;

  for (const [section, data] of bySection) {
    lines.push(`      <section class="exercises-section">`);
    lines.push(`        <h2>${section} ${data.title}</h2>`);
    lines.push('        <ol class="exercises-list">');

    for (const ex of data.exercises) {
      globalNumber++;
      lines.push(
        `          <li class="exercise" id="${escapeAttr(ex.id)}" value="${globalNumber}">`
      );

      if (ex.problem && ex.problem.content) {
        lines.push('            <div class="problem">');
        if (ex.problem.content.paras && ex.problem.content.paras.length > 0) {
          for (const para of ex.problem.content.paras) {
            lines.push(`              <p>${para}</p>`);
          }
        }
        if (ex.problem.content.lists && ex.problem.content.lists.length > 0) {
          for (const list of ex.problem.content.lists) {
            lines.push('              <ol class="exercise-parts" type="a">');
            for (const item of list) {
              lines.push(`                <li>${item}</li>`);
            }
            lines.push('              </ol>');
          }
        }
        lines.push('            </div>');
      }

      lines.push('          </li>');
    }

    lines.push('        </ol>');
    lines.push('      </section>');
  }

  lines.push(
    '    </main>',
    '  </article>',
    '  <script type="application/json" id="page-data">',
    JSON.stringify(
      {
        chapter,
        type: 'exercises',
        exerciseCount: exercises.length,
      },
      null,
      2
    ),
    '  </script>',
    '</body>',
    '</html>'
  );

  return lines.join('\n');
}

// =====================================================================
// ANSWER KEY EXTRACTION
// =====================================================================

/**
 * Build answer key HTML page (odd-numbered exercises only).
 */
function buildAnswerKeyHtml(exercises, chapter, _book) {
  // Helper to check if exercise has a valid solution
  const hasSolution = (ex) =>
    ex.solution &&
    ex.solution.content &&
    ex.solution.content.paras &&
    ex.solution.content.paras.length > 0;

  // Filter to exercises with solutions (typically odd-numbered)
  const withSolutions = exercises.filter(hasSolution);

  // Group by section
  const bySection = new Map();
  let globalNumber = 0;

  for (const ex of exercises) {
    globalNumber++;
    if (hasSolution(ex)) {
      if (!bySection.has(ex.section)) {
        bySection.set(ex.section, { title: ex.sectionTitle, answers: [] });
      }
      bySection.get(ex.section).answers.push({
        ...ex,
        globalNumber,
      });
    }
  }

  const lines = [
    '<!DOCTYPE html>',
    '<html lang="is">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `  <title>Kafli ${chapter} - Svör við æfingum</title>`,
    '  <link rel="stylesheet" href="/styles/content.css">',
    '</head>',
    '<body>',
    '  <article class="chapter-resource answer-key">',
    '    <header>',
    `      <h1>Svör við æfingum</h1>`,
    '    </header>',
    '    <main>',
  ];

  for (const [section, data] of bySection) {
    lines.push(`      <section class="answers-section">`);
    lines.push(`        <h2>${section} ${data.title}</h2>`);
    lines.push('        <dl class="answers-list">');

    for (const ans of data.answers) {
      lines.push(`          <div class="answer-entry" id="answer-${escapeAttr(ans.id)}">`);
      lines.push(`            <dt>${ans.globalNumber}.</dt>`);
      lines.push('            <dd>');
      if (ans.solution && ans.solution.content && ans.solution.content.paras) {
        for (const para of ans.solution.content.paras) {
          lines.push(`              <p>${para}</p>`);
        }
      }
      lines.push('            </dd>');
      lines.push('          </div>');
    }

    lines.push('        </dl>');
    lines.push('      </section>');
  }

  lines.push(
    '    </main>',
    '  </article>',
    '  <script type="application/json" id="page-data">',
    JSON.stringify(
      {
        chapter,
        type: 'answer-key',
        answerCount: withSolutions.length,
      },
      null,
      2
    ),
    '  </script>',
    '</body>',
    '</html>'
  );

  return lines.join('\n');
}

// =====================================================================
// MAIN
// =====================================================================

function printHelp() {
  console.log(`
Usage: node tools/cnxml-extract-chapter-resources.js --book <book> --chapter <num> [options]

Options:
  --book <name>      Book slug (e.g., efnafraedi)
  --chapter <num>    Chapter number
  --resource <type>  Resource type: glossary, equations, exercises, answers, all (default: all)
  --track <name>     Publication track: mt-preview, faithful (default: mt-preview)
  --format <fmt>     Output format: html, json (default: html)
  --verbose          Show detailed progress
  -h, --help         Show this help

Examples:
  node tools/cnxml-extract-chapter-resources.js --book efnafraedi --chapter 5
  node tools/cnxml-extract-chapter-resources.js --book efnafraedi --chapter 5 --resource glossary
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  // Parse arguments
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  const book = getArg('book') || 'efnafraedi';
  const chapter = parseInt(getArg('chapter') || '5', 10);
  const resource = getArg('resource') || 'all';
  const track = getArg('track') || 'mt-preview';
  const format = getArg('format') || 'html';
  const verbose = args.includes('--verbose');

  if (!chapter) {
    console.error('Error: --chapter is required');
    process.exit(1);
  }

  const chapterStr = String(chapter).padStart(2, '0');
  const outputDir = path.join(CONFIG.outputDir(book, track), chapterStr);

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Get module files from both sources
  // - Translated files for glossary (has translated terms)
  // - Source files for equations/exercises (structure preserved, content is English)
  const translatedFiles = getModuleFiles(book, chapter, 'translated');
  const sourceFiles = getModuleFiles(book, chapter, 'source');

  if (verbose) {
    console.log(`Processing ${translatedFiles.length} modules for chapter ${chapter}`);
    console.log(`  Using translated CNXML for glossary`);
    console.log(`  Using source CNXML for equations/exercises (structure preserved)`);
  }

  // Collect data from all modules
  const allGlossary = [];
  const allEquations = [];
  const allExercises = [];

  // Extract glossary from translated files
  if (resource === 'all' || resource === 'glossary') {
    for (const file of translatedFiles) {
      const moduleId = path.basename(file, '.cnxml');
      const content = fs.readFileSync(file, 'utf8');
      const glossary = extractGlossary(content, moduleId);
      allGlossary.push(...glossary);
      if (verbose) console.log(`  ${moduleId}: ${glossary.length} glossary terms (translated)`);
    }
  }

  // Extract equations and exercises from source files (structure is preserved there)
  for (const file of sourceFiles) {
    const moduleId = path.basename(file, '.cnxml');
    const moduleInfo = getModuleInfo(book, chapter, moduleId);
    const content = fs.readFileSync(file, 'utf8');

    if (resource === 'all' || resource === 'equations') {
      const equations = extractKeyEquations(content, moduleId, moduleInfo);
      allEquations.push(...equations);
      if (verbose) console.log(`  ${moduleId}: ${equations.length} key equations (source)`);
    }

    if (resource === 'all' || resource === 'exercises' || resource === 'answers') {
      const exercises = extractExercises(content, moduleId, moduleInfo);
      allExercises.push(...exercises);
      if (verbose) console.log(`  ${moduleId}: ${exercises.length} exercises (source)`);
    }
  }

  // Generate output files
  if (format === 'html') {
    if (resource === 'all' || resource === 'glossary') {
      const html = buildGlossaryHtml(allGlossary, chapter, book);
      const outPath = path.join(outputDir, `${chapter}-key-terms.html`);
      fs.writeFileSync(outPath, html);
      console.log(`Glossary: ${allGlossary.length} terms → ${outPath}`);
    }

    if (resource === 'all' || resource === 'equations') {
      const html = buildEquationsHtml(allEquations, chapter, book);
      const outPath = path.join(outputDir, `${chapter}-key-equations.html`);
      fs.writeFileSync(outPath, html);
      console.log(`Equations: ${allEquations.length} equations → ${outPath}`);
    }

    if (resource === 'all' || resource === 'exercises') {
      const html = buildExercisesHtml(allExercises, chapter, book);
      const outPath = path.join(outputDir, `${chapter}-exercises.html`);
      fs.writeFileSync(outPath, html);
      console.log(`Exercises: ${allExercises.length} exercises → ${outPath}`);
    }

    if (resource === 'all' || resource === 'answers') {
      const html = buildAnswerKeyHtml(allExercises, chapter, book);
      const outPath = path.join(outputDir, `${chapter}-answer-key.html`);
      fs.writeFileSync(outPath, html);
      const answerCount = allExercises.filter(
        (ex) =>
          ex.solution &&
          ex.solution.content &&
          ex.solution.content.paras &&
          ex.solution.content.paras.length > 0
      ).length;
      console.log(`Answer Key: ${answerCount} answers → ${outPath}`);
    }
  } else if (format === 'json') {
    // JSON output for debugging/inspection
    const data = {
      chapter,
      book,
      glossary: allGlossary,
      equations: allEquations,
      exercises: allExercises,
    };
    const outPath = path.join(outputDir, `${chapter}-resources.json`);
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log(`Resources JSON → ${outPath}`);
  }

  console.log('\nExtraction complete!');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
