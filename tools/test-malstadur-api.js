#!/usr/bin/env node

/**
 * test-malstadur-api.js — Phase T1: Málstaður API marker survival testing
 *
 * Sends carefully crafted test strings to the Málstaður translation API and
 * generates a report on which content markers survive translation intact.
 *
 * This is the CRITICAL feasibility gate: the results determine whether we
 * need protection (like the web UI) or can send raw segments directly.
 *
 * Usage:
 *   MALSTADUR_API_KEY=xxx node tools/test-malstadur-api.js
 *   MALSTADUR_API_KEY=xxx node tools/test-malstadur-api.js --verbose
 *   MALSTADUR_API_KEY=xxx node tools/test-malstadur-api.js --test T1.2
 *   MALSTADUR_API_KEY=xxx node tools/test-malstadur-api.js --real-segments
 *
 * Options:
 *   --verbose, -v         Show full API responses
 *   --test <id>           Run only a specific test (e.g., T1.3)
 *   --real-segments       Also run T2 tests with real module segments
 *   --output-dir <dir>    Directory for report (default: test-results/)
 *   --rate-delay <ms>     Delay between API calls (default: 500)
 *   -h, --help            Show help
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, formatGlossary } from './lib/malstadur-api.js';
import { parseArgs } from './lib/parseArgs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ─── CLI ────────────────────────────────────────────────────────────

function parseCliArgs(argv) {
  return parseArgs(argv, [
    { name: 'test', flags: ['--test'], type: 'string', default: null },
    { name: 'realSegments', flags: ['--real-segments'], type: 'boolean', default: false },
    {
      name: 'outputDir',
      flags: ['--output-dir'],
      type: 'string',
      default: path.join(PROJECT_ROOT, 'test-results'),
    },
    { name: 'rateDelay', flags: ['--rate-delay'], type: 'number', default: 500 },
  ]);
}

// ─── Test Case Definitions ──────────────────────────────────────────

const TEST_CASES = [
  {
    id: 'T1.1',
    name: 'Plain text baseline',
    input: 'Chemistry is the study of matter and its properties.',
    checks: [
      {
        name: 'Returns Icelandic text',
        test: (input, output) => output.length > 0 && output !== input,
      },
    ],
  },
  {
    id: 'T1.2',
    name: 'HTML comment survival',
    input: '<!-- SEG:m68663:para:1 --> Chemistry is the study of matter.',
    checks: [
      {
        name: '<!-- --> comment survives',
        test: (input, output) => output.includes('<!-- SEG:m68663:para:1 -->'),
      },
      {
        name: 'SEG tag content intact',
        test: (input, output) => output.includes('SEG:m68663:para:1'),
      },
    ],
  },
  {
    id: 'T1.3',
    name: 'Double bracket survival ([[MATH:N]])',
    input: 'The value is [[MATH:1]] times greater than [[MATH:2]] units.',
    checks: [
      { name: '[[MATH:1]] survives', test: (input, output) => output.includes('[[MATH:1]]') },
      { name: '[[MATH:2]] survives', test: (input, output) => output.includes('[[MATH:2]]') },
      { name: 'No backslash escaping', test: (input, output) => !output.includes('\\[\\[') },
      {
        name: 'No single-bracket collapse',
        test: (input, output) => !output.match(/(?<!\[)\[MATH:\d\](?!\])/),
      },
    ],
  },
  {
    id: 'T1.4',
    name: 'Curly bracket survival ({{SEG:...}})',
    input: '{{SEG:m68663:para:1}} Chemistry is the study of matter.',
    checks: [
      {
        name: '{{SEG:...}} survives',
        test: (input, output) => output.includes('{{SEG:m68663:para:1}}'),
      },
      { name: 'No backslash escaping', test: (input, output) => !output.includes('\\{\\{') },
    ],
  },
  {
    id: 'T1.5',
    name: 'Markdown formatting (__term__, *italic*, **bold**)',
    input: 'The __molecule__ has *specific* **properties** in chemistry.',
    checks: [
      { name: '__term__ markers survive', test: (input, output) => /__.+__/.test(output) },
      { name: '*italic* survives', test: (input, output) => /(?<!\*)\*[^*]+\*(?!\*)/.test(output) },
      { name: '**bold** survives', test: (input, output) => /\*\*[^*]+\*\*/.test(output) },
      { name: 'No underscore escaping', test: (input, output) => !output.includes('\\_') },
    ],
  },
  {
    id: 'T1.6',
    name: 'Markdown links ([text](url))',
    input:
      'See [Table 1.1](#fs-idm81346144) for details about [chemistry](http://openstax.org/l/16plasma).',
    checks: [
      {
        name: '[text](#anchor) survives',
        test: (input, output) => /\[[^\]]+\]\(#[^)]+\)/.test(output),
      },
      {
        name: '[text](url) survives',
        test: (input, output) => /\[[^\]]+\]\(http[^)]+\)/.test(output),
      },
      {
        name: 'Anchor #fs-idm81346144 intact',
        test: (input, output) => output.includes('#fs-idm81346144'),
      },
      {
        name: 'URL intact',
        test: (input, output) => output.includes('http://openstax.org/l/16plasma'),
      },
    ],
  },
  {
    id: 'T1.7',
    name: 'Cross-references ([#ref-id])',
    input:
      'The data is shown in [#CNX_Chem_01_02_StatesMatt] and also in [#CNX_Chem_01_02_Plasma].',
    checks: [
      { name: '[#ref] format survives', test: (input, output) => /\[#[^\]]+\]/.test(output) },
      {
        name: 'First ref ID intact',
        test: (input, output) => output.includes('CNX_Chem_01_02_StatesMatt'),
      },
      {
        name: 'Second ref ID intact',
        test: (input, output) => output.includes('CNX_Chem_01_02_Plasma'),
      },
    ],
  },
  {
    id: 'T1.8',
    name: 'Superscript/subscript (^sup^ and ~sub~)',
    input: 'Water is H~2~O and the rate is 10^5^ per second. CO~2~ is also 2.98 × 10^−6^ kg.',
    checks: [
      { name: '~subscript~ survives', test: (input, output) => /~\d+~/.test(output) },
      {
        name: '^superscript^ survives',
        test: (input, output) => /\^\d+\^/.test(output) || /\^−?\d+\^/.test(output),
      },
      { name: 'H~2~O pattern intact', test: (input, output) => output.includes('~2~') },
      {
        name: '10^5^ pattern intact',
        test: (input, output) => output.includes('^5^') || output.includes('10^5^'),
      },
    ],
  },
  {
    id: 'T1.9',
    name: 'Other placeholders ([[BR]], [[SPACE]], [[MEDIA:N]])',
    input: 'First line[[BR]]Second line with [[SPACE]] extra space and [[MEDIA:3]] image.',
    checks: [
      { name: '[[BR]] survives', test: (input, output) => output.includes('[[BR]]') },
      { name: '[[SPACE]] survives', test: (input, output) => output.includes('[[SPACE]]') },
      { name: '[[MEDIA:3]] survives', test: (input, output) => output.includes('[[MEDIA:3]]') },
    ],
  },
  {
    id: 'T1.10',
    name: 'Protected format markers ({{TERM}}, {{LINK:N}}, {{XREF:N}})',
    input:
      'A {{TERM}}molecule{{/TERM}} is described in {{LINK:1}}Table 1{{/LINK}} and {{XREF:2}} shows more.',
    checks: [
      {
        name: '{{TERM}}...{{/TERM}} survives',
        test: (input, output) => /\{\{TERM\}\}.*\{\{\/TERM\}\}/.test(output),
      },
      {
        name: '{{LINK:1}}...{{/LINK}} survives',
        test: (input, output) => /\{\{LINK:1\}\}.*\{\{\/LINK\}\}/.test(output),
      },
      { name: '{{XREF:2}} survives', test: (input, output) => output.includes('{{XREF:2}}') },
    ],
  },
  {
    id: 'T1.11',
    name: 'Mixed real-world segment (complex)',
    input:
      '<!-- SEG:m68674:para:1 --> The mass is 2.98 [[MATH:1]] 10^5^ kg. __Units__ are listed in [#fs-idm81346144]. See [Table 1.1](http://example.com) for the H~2~O data.',
    checks: [
      {
        name: 'SEG comment survives',
        test: (input, output) => output.includes('SEG:m68674:para:1'),
      },
      { name: '[[MATH:1]] survives', test: (input, output) => output.includes('[[MATH:1]]') },
      { name: '^5^ survives', test: (input, output) => output.includes('^5^') },
      { name: '__term__ survives', test: (input, output) => /__.+__/.test(output) },
      { name: '[#ref] survives', test: (input, output) => output.includes('fs-idm81346144') },
      {
        name: '[text](url) survives',
        test: (input, output) => output.includes('http://example.com'),
      },
      { name: '~2~ survives', test: (input, output) => output.includes('~2~') },
    ],
  },
  {
    id: 'T1.12',
    name: 'Glossary effectiveness',
    input:
      'The molecule has a specific molar mass. An atom bonds with another element to form an acid.',
    glossary: [
      { english: 'molecule', icelandic: 'sameind', status: 'approved' },
      { english: 'molar mass', icelandic: 'mólmassi', status: 'approved' },
      { english: 'atom', icelandic: 'atóm', status: 'approved' },
      { english: 'element', icelandic: 'frumefni', status: 'approved' },
      { english: 'acid', icelandic: 'sýra', status: 'approved' },
    ],
    checks: [
      {
        name: '"sameind" used for molecule',
        test: (input, output) => output.toLowerCase().includes('sameind'),
      },
      {
        name: '"mólmassi" used for molar mass',
        test: (input, output) => output.toLowerCase().includes('mólmass'),
      },
      {
        name: '"atóm" used for atom',
        test: (input, output) => output.toLowerCase().includes('atóm'),
      },
      {
        name: '"frumefni" used for element',
        test: (input, output) => output.toLowerCase().includes('frumefni'),
      },
      {
        name: '"sýra" used for acid',
        test: (input, output) => output.toLowerCase().includes('sýr'),
      },
    ],
  },
  {
    id: 'T1.13',
    name: 'Multi-paragraph segment with SEG tags',
    input: `<!-- SEG:m68664:title:auto-1 -->
Chemistry in Context

<!-- SEG:m68664:abstract:auto-2 -->
By the end of this section, you will be able to:

<!-- SEG:m68664:abstract-item:abstract-item-1 -->
Outline the historical development of chemistry

<!-- SEG:m68664:para:fs-idp77567568 -->
Throughout human history, people have tried to convert matter into more useful forms.`,
    checks: [
      {
        name: 'All 4 SEG tags survive',
        test: (input, output) => {
          const segCount = (output.match(/SEG:m68664/g) || []).length;
          return segCount === 4;
        },
      },
      { name: 'Paragraph structure preserved', test: (input, output) => output.includes('\n') },
      {
        name: 'Title SEG tag present',
        test: (input, output) => output.includes('SEG:m68664:title:auto-1'),
      },
      {
        name: 'Para SEG tag present',
        test: (input, output) => output.includes('SEG:m68664:para:fs-idp77567568'),
      },
    ],
  },
];

// ─── Test Runner ────────────────────────────────────────────────────

async function runTest(client, testCase, _verbose) {
  const result = {
    id: testCase.id,
    name: testCase.name,
    input: testCase.input,
    output: null,
    error: null,
    checks: [],
    passed: 0,
    failed: 0,
    usage: null,
  };

  try {
    const translateOpts = { targetLanguage: 'is' };

    if (testCase.glossary) {
      translateOpts.glossaries = [formatGlossary(testCase.glossary, { approvedOnly: false })];
    }

    const response = await client.translate(testCase.input, translateOpts);
    result.output = response.text;
    result.usage = response.usage;

    // Run checks
    for (const check of testCase.checks) {
      try {
        const pass = check.test(testCase.input, result.output);
        result.checks.push({ name: check.name, pass });
        if (pass) result.passed++;
        else result.failed++;
      } catch (checkErr) {
        result.checks.push({ name: check.name, pass: false, error: checkErr.message });
        result.failed++;
      }
    }
  } catch (err) {
    result.error = err.message;
    result.failed = testCase.checks.length;
    for (const check of testCase.checks) {
      result.checks.push({ name: check.name, pass: false, error: 'API call failed' });
    }
  }

  return result;
}

// ─── Real Segment Tests (T2) ────────────────────────────────────────

function loadRealSegmentTests() {
  const tests = [];
  const modules = [
    {
      id: 'm68663',
      chapter: 'ch01',
      complexity: 'simple',
      desc: 'Introduction (title, abstract, plain paragraphs)',
    },
    {
      id: 'm68674',
      chapter: 'ch01',
      complexity: 'medium',
      desc: 'Measurements (math, links, terms, tables)',
    },
    {
      id: 'm68664',
      chapter: 'ch01',
      complexity: 'medium',
      desc: 'Chemistry in Context (terms, links, cross-refs)',
    },
  ];

  for (const mod of modules) {
    const segPath = path.join(
      PROJECT_ROOT,
      'books/efnafraedi-2e/02-for-mt',
      mod.chapter,
      `${mod.id}-segments.en.md`
    );

    if (!fs.existsSync(segPath)) {
      console.warn(`  Skipping T2 test for ${mod.id}: file not found at ${segPath}`);
      continue;
    }

    const content = fs.readFileSync(segPath, 'utf8');

    // Extract individual segments
    const segments = [];
    const parts = content.split(/(?=<!-- SEG:)/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 0 && trimmed.startsWith('<!-- SEG:')) {
        segments.push(trimmed);
      }
    }

    // Test first 3 segments individually (to stay under 10K char limit per call)
    const testSegments = segments.slice(0, 3);
    for (let i = 0; i < testSegments.length; i++) {
      const seg = testSegments[i];
      const segIdMatch = seg.match(/<!-- SEG:([^ ]+)/);
      const segId = segIdMatch ? segIdMatch[1] : `segment-${i}`;

      tests.push({
        id: `T2.${mod.id}.${i + 1}`,
        name: `Real segment: ${segId} (${mod.complexity})`,
        input: seg,
        checks: [
          {
            name: 'SEG tag survives',
            test: (input, output) => {
              const inputMatch = input.match(/SEG:[^\s>}]+/);
              return inputMatch && output.includes(inputMatch[0]);
            },
          },
          {
            name: 'Output is Icelandic',
            test: (input, output) => output !== input && output.length > 0,
          },
          {
            name: 'No marker corruption',
            test: (input, output) => {
              // Check that any markers in the input that appear in output are intact
              const markers = input.match(/\[\[MATH:\d+\]\]/g) || [];
              return markers.every((m) => output.includes(m));
            },
          },
        ],
      });
    }
  }

  return tests;
}

// ─── Report Generator ───────────────────────────────────────────────

function generateReport(results, usageStats) {
  const lines = [];
  const now = new Date().toISOString();

  lines.push('# Málstaður API Marker Survival Report');
  lines.push('');
  lines.push(`**Generated:** ${now}`);
  lines.push(`**API Base:** https://api.malstadur.is`);
  lines.push('');

  // Summary
  const totalChecks = results.reduce((s, r) => s + r.checks.length, 0);
  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const apiErrors = results.filter((r) => r.error).length;

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Tests run | ${results.length} |`);
  lines.push(`| Total checks | ${totalChecks} |`);
  lines.push(`| Passed | ${totalPassed} |`);
  lines.push(`| Failed | ${totalFailed} |`);
  lines.push(`| API errors | ${apiErrors} |`);
  lines.push(
    `| Pass rate | ${totalChecks > 0 ? ((totalPassed / totalChecks) * 100).toFixed(1) : 0}% |`
  );

  if (usageStats) {
    lines.push(`| Characters translated | ${usageStats.totalChars.toLocaleString()} |`);
    lines.push(`| Estimated cost | ${usageStats.estimatedISK.toFixed(0)} ISK |`);
    lines.push(`| Elapsed time | ${(usageStats.elapsedMs / 1000).toFixed(1)}s |`);
  }
  lines.push('');

  // Marker survival matrix
  lines.push('## Marker Survival Matrix');
  lines.push('');
  lines.push('| Marker Type | Survives? | Notes |');
  lines.push('|-------------|-----------|-------|');

  const markerResults = extractMarkerSurvival(results);
  for (const [marker, data] of Object.entries(markerResults)) {
    const icon = data.survives === true ? '✅' : data.survives === false ? '❌' : '⚠️';
    lines.push(
      `| ${marker} | ${icon} ${data.survives === true ? 'Yes' : data.survives === false ? 'No' : 'Partial'} | ${data.notes} |`
    );
  }
  lines.push('');

  // Recommendation
  lines.push('## Recommended Approach');
  lines.push('');
  const allSurvive = Object.values(markerResults).every((d) => d.survives === true);
  const noneSurvive = Object.values(markerResults).every((d) => d.survives === false);

  if (allSurvive) {
    lines.push('**Approach A: Direct segment translation (no protection needed)**');
    lines.push('');
    lines.push('All markers survive the API intact. Segments can be sent directly without');
    lines.push('the protect/unprotect cycle used for the web UI.');
  } else if (noneSurvive) {
    lines.push('**Approach B: Full protection required (similar to web UI)**');
    lines.push('');
    lines.push('The API damages markers similarly to the web UI. The existing protect/unprotect');
    lines.push('pipeline should be adapted for API use.');
  } else {
    lines.push('**Approach C: Hybrid (selective protection)**');
    lines.push('');
    lines.push('Some markers survive, others do not. A lighter protection step is needed,');
    lines.push('protecting only the marker types that get damaged.');
    lines.push('');
    lines.push('Markers that need protection:');
    for (const [marker, data] of Object.entries(markerResults)) {
      if (data.survives !== true) {
        lines.push(`- ${marker}: ${data.notes}`);
      }
    }
  }
  lines.push('');

  // Detailed results
  lines.push('## Detailed Test Results');
  lines.push('');

  for (const result of results) {
    const icon = result.failed === 0 && !result.error ? '✅' : '❌';
    lines.push(`### ${icon} ${result.id}: ${result.name}`);
    lines.push('');

    if (result.error) {
      lines.push(`**ERROR:** ${result.error}`);
      lines.push('');
      continue;
    }

    lines.push('**Input:**');
    lines.push('```');
    lines.push(result.input);
    lines.push('```');
    lines.push('');
    lines.push('**Output:**');
    lines.push('```');
    lines.push(result.output);
    lines.push('```');
    lines.push('');

    if (result.usage) {
      lines.push(
        `**Usage:** ${result.usage.units} ${result.usage.unitType}, cost: ${result.usage.cost}`
      );
      lines.push('');
    }

    lines.push('**Checks:**');
    lines.push('');
    for (const check of result.checks) {
      const checkIcon = check.pass ? '✅' : '❌';
      const errorNote = check.error ? ` (${check.error})` : '';
      lines.push(`- ${checkIcon} ${check.name}${errorNote}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function extractMarkerSurvival(results) {
  const markers = {};

  // Map test IDs to marker types
  const markerMap = {
    'T1.2': { key: 'HTML comments (<!-- -->)', checks: [0] },
    'T1.3': { key: 'Double brackets ([[MATH:N]])', checks: [0, 1] },
    'T1.4': { key: 'Curly brackets ({{SEG:...}})', checks: [0] },
    'T1.5': { key: 'Term markers (__term__)', checks: [0] },
    'T1.6': { key: 'Markdown links ([text](url))', checks: [0, 1] },
    'T1.7': { key: 'Cross-references ([#ref-id])', checks: [0] },
    'T1.8': { key: 'Super/subscript (^sup^, ~sub~)', checks: [0, 1] },
    'T1.9': { key: 'Other placeholders ([[BR]], [[SPACE]], [[MEDIA]])', checks: [0, 1, 2] },
    'T1.10': { key: 'Protected markers ({{TERM}}, {{LINK}}, {{XREF}})', checks: [0, 1, 2] },
  };

  for (const [testId, info] of Object.entries(markerMap)) {
    const result = results.find((r) => r.id === testId);
    if (!result) continue;

    if (result.error) {
      markers[info.key] = { survives: null, notes: 'API error — could not test' };
      continue;
    }

    const relevantChecks = info.checks.map((i) => result.checks[i]).filter(Boolean);
    const allPass = relevantChecks.every((c) => c.pass);
    const somePass = relevantChecks.some((c) => c.pass);

    let notes = '';
    if (allPass) {
      notes = 'Intact';
    } else if (somePass) {
      const failedNames = relevantChecks
        .filter((c) => !c.pass)
        .map((c) => c.name)
        .join(', ');
      notes = `Partial: ${failedNames}`;
    } else {
      // Try to describe what happened
      if (result.output) {
        notes = 'Damaged or stripped by API';
      } else {
        notes = 'No output';
      }
    }

    markers[info.key] = { survives: allPass ? true : somePass ? 'partial' : false, notes };
  }

  return markers;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`
test-malstadur-api.js — Málstaður API marker survival testing

Sends test strings to the API and generates a marker survival report.
This determines which implementation approach to use for automated MT.

Usage:
  MALSTADUR_API_KEY=xxx node tools/test-malstadur-api.js [options]

Options:
  --verbose, -v         Show full API responses
  --test <id>           Run only a specific test (e.g., T1.3)
  --real-segments       Also test with real module segments (T2 tests)
  --output-dir <dir>    Report directory (default: test-results/)
  --rate-delay <ms>     Delay between API calls (default: 500)
  -h, --help            Show this help
`);
    process.exit(0);
  }

  // Create API client
  let client;
  try {
    client = createClient({ rateDelayMs: args.rateDelay });
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  console.log('🔬 Málstaður API Marker Survival Test');
  console.log('═'.repeat(50));
  console.log('');

  // Collect test cases
  let tests = [...TEST_CASES];

  if (args.realSegments) {
    console.log('Loading real segment tests (T2)...');
    const realTests = loadRealSegmentTests();
    tests = tests.concat(realTests);
    console.log(`  Added ${realTests.length} real segment tests`);
    console.log('');
  }

  // Filter if --test specified
  if (args.test) {
    tests = tests.filter((t) => t.id === args.test || t.id.startsWith(args.test));
    if (tests.length === 0) {
      console.error(`No tests found matching "${args.test}"`);
      process.exit(1);
    }
  }

  console.log(`Running ${tests.length} test(s)...`);
  console.log('');

  // Run tests
  const results = [];
  for (const testCase of tests) {
    process.stdout.write(`  ${testCase.id}: ${testCase.name}... `);

    const result = await runTest(client, testCase, args.verbose);
    results.push(result);

    if (result.error) {
      console.log(`❌ ERROR: ${result.error}`);
    } else if (result.failed === 0) {
      console.log(`✅ ${result.passed}/${result.checks.length} checks passed`);
    } else {
      console.log(`❌ ${result.passed}/${result.checks.length} passed, ${result.failed} failed`);
      // Show failed checks
      for (const check of result.checks) {
        if (!check.pass) {
          console.log(`     ↳ FAIL: ${check.name}`);
        }
      }
    }

    if (args.verbose && result.output) {
      console.log(
        `     Input:  ${result.input.slice(0, 100)}${result.input.length > 100 ? '...' : ''}`
      );
      console.log(
        `     Output: ${result.output.slice(0, 100)}${result.output.length > 100 ? '...' : ''}`
      );
    }
  }

  // Usage summary
  const usageStats = client.getUsage();
  console.log('');
  console.log('─'.repeat(50));
  console.log(
    `API Usage: ${usageStats.totalChars.toLocaleString()} chars, ~${usageStats.estimatedISK.toFixed(0)} ISK, ${(usageStats.elapsedMs / 1000).toFixed(1)}s`
  );

  // Generate report
  const report = generateReport(results, usageStats);

  // Write report
  if (!fs.existsSync(args.outputDir)) {
    fs.mkdirSync(args.outputDir, { recursive: true });
  }

  const reportPath = path.join(args.outputDir, 'api-marker-survival.md');
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`\n📄 Report written to: ${reportPath}`);

  // Final summary
  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const totalChecks = totalPassed + totalFailed;

  console.log('');
  if (totalFailed === 0) {
    console.log(`✅ ALL CHECKS PASSED (${totalPassed}/${totalChecks})`);
    console.log('   → Approach A recommended: direct segment translation');
  } else {
    console.log(`⚠️  ${totalPassed}/${totalChecks} checks passed, ${totalFailed} failed`);
    console.log('   → Review the report to determine the best approach');
  }
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
