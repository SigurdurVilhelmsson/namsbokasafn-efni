#!/usr/bin/env node

/**
 * cnxml-extract-chapter-resources.js
 *
 * Extract chapter-level resources from translated CNXML files:
 *   - Summary (Key Concepts and Summary from each section)
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
 *   --resource <type>  Resource type: summary, glossary, equations, exercises, answers, all (default: all)
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
import { buildModuleSections } from './lib/module-sections.js';

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

// Module sections are built dynamically from structure + segment files
// via buildModuleSections() — see tools/lib/module-sections.js

// =====================================================================
// REFERENCE MAP BUILDER
// =====================================================================

/**
 * Build a map of element IDs to their types and numbers.
 * Scans all CNXML files in the chapter to collect tables, figures, and examples.
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @returns {Map<string, {type: string, number: string, title?: string}>}
 */
function buildReferenceMap(book, chapter) {
  const refMap = new Map();
  const chapterStr = String(chapter).padStart(2, '0');
  const sourceDir = path.join(CONFIG.sourceDir(book), `ch${chapterStr}`);

  if (!fs.existsSync(sourceDir)) {
    return refMap;
  }

  // Get all CNXML files
  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.cnxml'));

  // Counters for each type (reset per chapter, but continuous across modules)
  let tableCounter = 0;
  let figureCounter = 0;
  let exampleCounter = 0;

  for (const file of files) {
    const cnxml = fs.readFileSync(path.join(sourceDir, file), 'utf-8');

    // Extract tables with IDs
    const tablePattern = /<table\s+id="([^"]+)"[^>]*(?:summary="([^"]*)")?[^>]*>/g;
    let match;
    while ((match = tablePattern.exec(cnxml)) !== null) {
      tableCounter++;
      refMap.set(match[1], {
        type: 'table',
        number: `${chapter}.${tableCounter}`,
        title: match[2] || null,
      });
    }

    // Extract figures with IDs
    const figurePattern = /<figure\s+id="([^"]+)"/g;
    while ((match = figurePattern.exec(cnxml)) !== null) {
      figureCounter++;
      refMap.set(match[1], {
        type: 'figure',
        number: `${chapter}.${figureCounter}`,
      });
    }

    // Extract examples with IDs and titles
    const examplePattern = /<example\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/example>/g;
    while ((match = examplePattern.exec(cnxml)) !== null) {
      exampleCounter++;
      const titleMatch = match[2].match(/<title>([^<]+)<\/title>/);
      refMap.set(match[1], {
        type: 'example',
        number: `${chapter}.${exampleCounter}`,
        title: titleMatch ? titleMatch[1] : null,
      });
    }
  }

  return refMap;
}

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
  // Note: KaTeX renderToString already wraps in <span class="katex">, so we use
  // a different wrapper class to avoid nested .katex elements and font-size issues
  result = result.replace(/<m:math[^>]*>[\s\S]*?<\/m:math>/g, (mathml) => {
    const latex = convertMathMLToLatex(mathml);
    const katexHtml = renderLatex(latex, false);
    return `<span class="math-inline" data-latex="${escapeAttr(latex)}">${katexHtml}</span>`;
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

  // Convert links
  // Helper to get link text from reference map
  const getRefLabel = (targetId) => {
    if (context.refMap && context.refMap.has(targetId)) {
      const ref = context.refMap.get(targetId);
      const typeLabels = {
        table: 'Table',
        figure: 'Figure',
        example: 'Example',
      };
      return `${typeLabels[ref.type] || ref.type} ${ref.number}`;
    }
    return null;
  };

  // Self-closing cross-references (e.g., <link target-id="fs-id"/>)
  result = result.replace(/<link\s+target-id="([^"]*)"[^>]*\/>/g, (match, targetId) => {
    const label = getRefLabel(targetId);
    if (label) {
      return `<a href="#${escapeAttr(targetId)}">${label}</a>`;
    }
    return `<a href="#${escapeAttr(targetId)}">[${targetId}]</a>`;
  });

  // Links with content
  result = result.replace(
    /<link\s+target-id="([^"]*)"[^>]*>([\s\S]*?)<\/link>/g,
    (match, targetId, inner) => {
      const text = inner.trim();
      if (text) {
        return `<a href="#${escapeAttr(targetId)}">${processContent(text, context)}</a>`;
      }
      const label = getRefLabel(targetId);
      if (label) {
        return `<a href="#${escapeAttr(targetId)}">${label}</a>`;
      }
      return `<a href="#${escapeAttr(targetId)}">${targetId}</a>`;
    }
  );

  // Document links (cross-module references) - also need to lookup the reference
  result = result.replace(
    /<link\s+document="([^"]*)"[^>]*target-id="([^"]*)"[^>]*>([\s\S]*?)<\/link>/g,
    (match, doc, targetId, inner) => {
      const text = inner.trim();
      if (text) {
        return `<a href="#${escapeAttr(targetId)}">${processContent(text, context)}</a>`;
      }
      // Look up the reference - same chapter, different module
      const label = getRefLabel(targetId);
      if (label) {
        return `<a href="#${escapeAttr(targetId)}">${label}</a>`;
      }
      return `<a href="#${escapeAttr(targetId)}">${doc}#${targetId}</a>`;
    }
  );

  // URL links
  result = result.replace(/<link\s+url="([^"]*)"[^>]*>([\s\S]*?)<\/link>/g, (match, url, inner) => {
    return `<a href="${escapeAttr(url)}">${processContent(inner, context)}</a>`;
  });

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
const _moduleSectionsCache = {};
function getModuleInfo(book, chapter, moduleId) {
  const key = `${book}:${chapter}`;
  if (!_moduleSectionsCache[key]) {
    _moduleSectionsCache[key] = buildModuleSections(book, chapter);
  }
  const info = _moduleSectionsCache[key][moduleId];
  if (info) {
    return { section: `${chapter}.${info.section}`, title: info.titleIs };
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
function extractExercises(cnxmlContent, moduleId, moduleInfo, refMap = new Map()) {
  const exercises = [];
  const context = { refMap };

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
          content: extractProblemContent(problemMatch[2], context),
        }
      : null;

    // Extract solution (if present)
    const solutionMatch = content.match(/<solution[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/solution>/);
    const solution = solutionMatch
      ? {
          id: solutionMatch[1],
          content: extractSolutionContent(solutionMatch[2], context),
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
function extractProblemContent(content, context = {}) {
  // Extract paragraphs
  const paras = [];
  const paraPattern = /<para[^>]*>([\s\S]*?)<\/para>/g;
  let match;

  while ((match = paraPattern.exec(content)) !== null) {
    paras.push(processContent(match[1].trim(), context));
  }

  // Extract lists
  const lists = [];
  const listPattern = /<list[^>]*>([\s\S]*?)<\/list>/g;

  while ((match = listPattern.exec(content)) !== null) {
    const items = [];
    const itemPattern = /<item>([\s\S]*?)<\/item>/g;
    let itemMatch;

    while ((itemMatch = itemPattern.exec(match[1])) !== null) {
      items.push(processContent(itemMatch[1].trim(), context));
    }

    lists.push(items);
  }

  return { paras, lists };
}

/**
 * Extract and process solution content.
 */
function extractSolutionContent(content, context = {}) {
  const paras = [];
  const paraPattern = /<para[^>]*>([\s\S]*?)<\/para>/g;
  let match;

  while ((match = paraPattern.exec(content)) !== null) {
    paras.push(processContent(match[1].trim(), context));
  }

  // If no paras found, try to get direct content
  if (paras.length === 0) {
    const cleaned = processContent(content.trim(), context);
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
// SUMMARY EXTRACTION
// =====================================================================

/**
 * Extract summary content from a CNXML file.
 */
function extractSummary(cnxmlContent, moduleId, moduleInfo) {
  const summaryData = {
    moduleId,
    section: moduleInfo.section,
    sectionTitle: moduleInfo.title,
    paragraphs: [],
  };

  // Find summary section
  const sectionMatch = cnxmlContent.match(
    /<section[^>]*class="summary"[^>]*>([\s\S]*?)<\/section>/
  );
  if (!sectionMatch) return null;

  const sectionContent = sectionMatch[1];

  // Extract paragraphs
  const paraPattern = /<para[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/para>/g;
  let match;

  while ((match = paraPattern.exec(sectionContent)) !== null) {
    const [, id, content] = match;
    summaryData.paragraphs.push({
      id,
      content: processContent(content.trim()),
    });
  }

  return summaryData.paragraphs.length > 0 ? summaryData : null;
}

/**
 * Build summary HTML page.
 */
function buildSummaryHtml(summaries, chapter, _book) {
  const lines = [
    '<!DOCTYPE html>',
    '<html lang="is">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `  <title>Kafli ${chapter} - Samantekt</title>`,
    '  <link rel="stylesheet" href="/styles/content.css">',
    '</head>',
    '<body>',
    '  <article class="chapter-resource summary">',
    '    <header>',
    '      <h1>Samantekt</h1>',
    '    </header>',
    '    <main>',
  ];

  let totalParagraphs = 0;

  for (const summary of summaries) {
    if (!summary) continue;

    lines.push(
      `      <section class="summary-section" id="summary-${escapeAttr(summary.moduleId)}">`
    );
    lines.push(`        <h2>${summary.section} ${summary.sectionTitle}</h2>`);

    for (const para of summary.paragraphs) {
      lines.push(`        <p id="${escapeAttr(para.id)}">${para.content}</p>`);
      totalParagraphs++;
    }

    lines.push('      </section>');
  }

  lines.push(
    '    </main>',
    '  </article>',
    '  <script type="application/json" id="page-data">',
    JSON.stringify(
      {
        chapter,
        type: 'summary',
        sectionCount: summaries.filter(Boolean).length,
        paragraphCount: totalParagraphs,
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
  --resource <type>  Resource type: summary, glossary, equations, exercises, answers, all (default: all)
  --track <name>     Publication track: mt-preview, faithful (default: mt-preview)
  --format <fmt>     Output format: html, json (default: html)
  --verbose          Show detailed progress
  -h, --help         Show this help

Examples:
  node tools/cnxml-extract-chapter-resources.js --book efnafraedi --chapter 5
  node tools/cnxml-extract-chapter-resources.js --book efnafraedi --chapter 5 --resource summary
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
    console.log(`  Using translated CNXML for glossary, summary, exercises`);
    console.log(`  Using source CNXML for equations (MathML structure preserved)`);
  }

  // Build reference map for cross-references (tables, figures, examples)
  const refMap = buildReferenceMap(book, chapter);
  if (verbose) {
    console.log(`  Built reference map with ${refMap.size} entries`);
  }

  // Collect data from all modules
  const allSummaries = [];
  const allGlossary = [];
  const allEquations = [];
  const allExercises = [];

  // Extract summary and glossary from translated files
  for (const file of translatedFiles) {
    const moduleId = path.basename(file, '.cnxml');
    const moduleInfo = getModuleInfo(book, chapter, moduleId);
    const content = fs.readFileSync(file, 'utf8');

    if (resource === 'all' || resource === 'summary') {
      const summary = extractSummary(content, moduleId, moduleInfo);
      if (summary) {
        allSummaries.push(summary);
        if (verbose) {
          console.log(
            `  ${moduleId}: ${summary.paragraphs.length} summary paragraphs (translated)`
          );
        }
      }
    }

    if (resource === 'all' || resource === 'glossary') {
      const glossary = extractGlossary(content, moduleId);
      allGlossary.push(...glossary);
      if (verbose) console.log(`  ${moduleId}: ${glossary.length} glossary terms (translated)`);
    }
  }

  // Extract equations from source files (MathML structure must be preserved from original)
  for (const file of sourceFiles) {
    const moduleId = path.basename(file, '.cnxml');
    const moduleInfo = getModuleInfo(book, chapter, moduleId);
    const content = fs.readFileSync(file, 'utf8');

    if (resource === 'all' || resource === 'equations') {
      const equations = extractKeyEquations(content, moduleId, moduleInfo);
      allEquations.push(...equations);
      if (verbose) console.log(`  ${moduleId}: ${equations.length} key equations (source)`);
    }
  }

  // Extract exercises from translated files (exercises are translated in 03-translated/)
  for (const file of translatedFiles) {
    const moduleId = path.basename(file, '.cnxml');
    const moduleInfo = getModuleInfo(book, chapter, moduleId);
    const content = fs.readFileSync(file, 'utf8');

    if (resource === 'all' || resource === 'exercises' || resource === 'answers') {
      const exercises = extractExercises(content, moduleId, moduleInfo, refMap);
      allExercises.push(...exercises);
      if (verbose) console.log(`  ${moduleId}: ${exercises.length} exercises (translated)`);
    }
  }

  // Generate output files
  if (format === 'html') {
    if (resource === 'all' || resource === 'summary') {
      const html = buildSummaryHtml(allSummaries, chapter, book);
      const outPath = path.join(outputDir, `${chapter}-summary.html`);
      fs.writeFileSync(outPath, html);
      const paragraphCount = allSummaries.reduce((sum, s) => sum + (s?.paragraphs?.length || 0), 0);
      console.log(
        `Summary: ${allSummaries.filter(Boolean).length} sections, ${paragraphCount} paragraphs → ${outPath}`
      );
    }

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
      summaries: allSummaries,
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
