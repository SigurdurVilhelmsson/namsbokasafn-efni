#!/usr/bin/env node

/**
 * test-glossary-comparison.js — Compare translations with and without inline glossary
 *
 * Tests whether the server-side glossary (activated in the Málstaður web UI)
 * produces identical term translations as sending the inline glossary with each request.
 *
 * Sends the same test segments twice:
 *   1. Without inline glossary (relying on server-side glossary)
 *   2. With inline glossary (617 approved chemistry terms)
 *
 * Compares: term usage, __term__ marker handling, and overall translation consistency.
 *
 * Usage:
 *   MALSTADUR_API_KEY=xxx node tools/test-glossary-comparison.js
 *   MALSTADUR_API_KEY=xxx node tools/test-glossary-comparison.js --verbose
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from './lib/malstadur-api.js';
import { loadEnvFile, loadGlossary } from './api-translate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ─── Test Segments ──────────────────────────────────────────────────

// Mix of real segments and crafted sentences to test glossary coverage
const TEST_SEGMENTS = [
  {
    id: 'T1-basic-terms',
    name: 'Basic chemistry terms',
    text: 'The molecule has a specific molar mass. An atom bonds with another element to form an acid.',
    expectedTerms: ['sameind', 'mólmass', 'atóm', 'frumefni', 'sýr'],
  },
  {
    id: 'T2-marked-terms',
    name: 'Terms with __term__ markers',
    text: 'Some routes involve a __hypothesis__, a tentative explanation. The __laws__ of science summarize observations. Scientific __theories__ are well-substantiated.',
    expectedTerms: ['tilgát', 'lögmál', 'kenning'],
    checkMarkerPreservation: true,
  },
  {
    id: 'T3-concentration',
    name: 'Solution chemistry terms',
    text: 'The concentration of the solution was measured. The solute dissolved in the solvent to form a homogeneous mixture.',
    expectedTerms: ['styrk', 'lausn', 'leysni'],
  },
  {
    id: 'T4-bonding',
    name: 'Bonding and structure',
    text: 'A covalent bond forms when atoms share electrons. The ionic compound has a crystal lattice structure. Electronegativity determines bond polarity.',
    expectedTerms: ['samgild', 'tengi', 'rafeind', 'jón'],
  },
  {
    id: 'T5-reactions',
    name: 'Reaction types',
    text: 'An oxidation-reduction reaction involves the transfer of electrons. The catalyst increases the reaction rate without being consumed.',
    expectedTerms: ['oxun', 'hvarf', 'rafeind', 'hvataber'],
  },
  {
    id: 'T6-states',
    name: 'States of matter',
    text: 'Matter exists in three states: solid, liquid, and gas. A plasma is a fourth state found in stars.',
    expectedTerms: ['efni', 'fast', 'vökv', 'gas'],
  },
  {
    id: 'T7-measurement',
    name: 'Measurement and units',
    text: 'The density of water is approximately 1.0 g/cm^3^. Temperature is measured in kelvin or degrees Celsius.',
    expectedTerms: ['eðlismass', 'vatn', 'hitastig'],
  },
  {
    id: 'T8-periodic',
    name: 'Periodic table terms',
    text: 'The periodic table organizes elements by atomic number. Alkali metals are in group 1. Noble gases have full electron shells.',
    expectedTerms: ['lotukerfið', 'frumefni', 'sætistala'],
  },
  {
    id: 'T9-complex-segment',
    name: 'Complex segment with mixed markup',
    text: "<!-- SEG:test:para:1 --> The __International System of Units__ or __SI Units__ (from the French, *Le Système International d'Unités*) defines the __meter__ as the base unit of length.",
    checkMarkerPreservation: true,
    expectedTerms: ['alþjóðleg', 'einingakerfi', 'metr'],
  },
  {
    id: 'T10-equilibrium',
    name: 'Equilibrium and thermodynamics',
    text: 'Chemical equilibrium is reached when the rates of the forward and reverse reactions are equal. Enthalpy and entropy determine the spontaneity of a reaction.',
    expectedTerms: ['jafnvæg', 'hvarf'],
  },
];

// ─── Comparison Logic ───────────────────────────────────────────────

function compareTranslations(withGlossary, withoutGlossary, segment) {
  const result = {
    id: segment.id,
    name: segment.name,
    identical: withGlossary === withoutGlossary,
    termMatches: [],
    termMismatches: [],
    markerCheck: null,
  };

  // Check expected terms in both translations
  if (segment.expectedTerms) {
    for (const term of segment.expectedTerms) {
      const inWith = withGlossary.toLowerCase().includes(term.toLowerCase());
      const inWithout = withoutGlossary.toLowerCase().includes(term.toLowerCase());

      if (inWith && inWithout) {
        result.termMatches.push({ term, status: 'both' });
      } else if (inWith && !inWithout) {
        result.termMismatches.push({ term, status: 'only-with-glossary' });
      } else if (!inWith && inWithout) {
        result.termMismatches.push({ term, status: 'only-without-glossary' });
      } else {
        result.termMismatches.push({ term, status: 'neither' });
      }
    }
  }

  // Check __term__ marker preservation
  if (segment.checkMarkerPreservation) {
    const inputMarkers = (segment.text.match(/__[^_]+__/g) || []).length;
    const withMarkers = (withGlossary.match(/__[^_]+__/g) || []).length;
    const withoutMarkers = (withoutGlossary.match(/__[^_]+__/g) || []).length;

    result.markerCheck = {
      input: inputMarkers,
      withGlossary: withMarkers,
      withoutGlossary: withoutMarkers,
      match: withMarkers === withoutMarkers,
    };
  }

  return result;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

  // Load .env
  if (!process.env.MALSTADUR_API_KEY) {
    const envVars = loadEnvFile(path.join(PROJECT_ROOT, '.env'));
    if (envVars.MALSTADUR_API_KEY) {
      process.env.MALSTADUR_API_KEY = envVars.MALSTADUR_API_KEY;
    }
  }

  // Load glossary
  const glossary = loadGlossary(
    path.join(PROJECT_ROOT, 'books/efnafraedi-2e/glossary'),
    'chemistry'
  );

  if (!glossary) {
    console.error('Could not load glossary');
    process.exit(1);
  }

  const client = createClient({ rateDelayMs: 600 });

  console.log('Glossary Comparison Test');
  console.log('═'.repeat(60));
  console.log(`Inline glossary: ${glossary.terms.length} approved terms`);
  console.log(`Test segments: ${TEST_SEGMENTS.length}`);
  console.log('');
  console.log('Translating each segment twice (with and without inline glossary)...');
  console.log('');

  const results = [];

  for (const segment of TEST_SEGMENTS) {
    process.stdout.write(`  ${segment.id}: ${segment.name}... `);

    try {
      // Translate WITHOUT inline glossary (server-side only)
      const withoutResp = await client.translate(segment.text, { targetLanguage: 'is' });

      // Translate WITH inline glossary
      const withResp = await client.translate(segment.text, {
        targetLanguage: 'is',
        glossaries: [glossary],
      });

      const comparison = compareTranslations(withResp.text, withoutResp.text, segment);
      results.push(comparison);

      if (comparison.identical) {
        console.log('IDENTICAL');
      } else if (comparison.termMismatches.length === 0) {
        console.log('DIFFERENT TEXT, SAME TERMS');
      } else {
        console.log(`TERM DIFFERENCES: ${comparison.termMismatches.length}`);
      }

      if (verbose || !comparison.identical) {
        if (!comparison.identical) {
          console.log(`    Without glossary: ${withoutResp.text.slice(0, 120)}...`);
          console.log(`    With glossary:    ${withResp.text.slice(0, 120)}...`);
        }
        if (comparison.termMismatches.length > 0) {
          for (const m of comparison.termMismatches) {
            console.log(`    Term "${m.term}": ${m.status}`);
          }
        }
        if (comparison.markerCheck && !comparison.markerCheck.match) {
          console.log(
            `    Markers: input=${comparison.markerCheck.input} with=${comparison.markerCheck.withGlossary} without=${comparison.markerCheck.withoutGlossary}`
          );
        }
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({ id: segment.id, name: segment.name, error: err.message });
    }
  }

  // Summary
  const usage = client.getUsage();
  console.log('');
  console.log('═'.repeat(60));
  console.log('SUMMARY');
  console.log('─'.repeat(60));

  const identicalCount = results.filter((r) => r.identical).length;
  const differentCount = results.filter((r) => r.identical === false).length;
  const errorCount = results.filter((r) => r.error).length;

  const allTermMatches = results.flatMap((r) => r.termMatches || []);
  const allTermMismatches = results.flatMap((r) => r.termMismatches || []);
  const markerChecks = results.filter((r) => r.markerCheck);

  console.log(`Identical translations:   ${identicalCount}/${TEST_SEGMENTS.length}`);
  console.log(`Different translations:   ${differentCount}/${TEST_SEGMENTS.length}`);
  console.log(`Errors:                   ${errorCount}/${TEST_SEGMENTS.length}`);
  console.log('');
  console.log(`Term checks:`);
  console.log(
    `  Matching in both:       ${allTermMatches.filter((m) => m.status === 'both').length}`
  );
  console.log(
    `  Only with glossary:     ${allTermMismatches.filter((m) => m.status === 'only-with-glossary').length}`
  );
  console.log(
    `  Only without glossary:  ${allTermMismatches.filter((m) => m.status === 'only-without-glossary').length}`
  );
  console.log(
    `  In neither:             ${allTermMismatches.filter((m) => m.status === 'neither').length}`
  );

  if (markerChecks.length > 0) {
    const markerMatch = markerChecks.filter((r) => r.markerCheck.match).length;
    console.log(`  __term__ marker count:  ${markerMatch}/${markerChecks.length} matching`);
  }

  console.log('');
  console.log(
    `API usage: ${usage.totalChars.toLocaleString()} chars, ~${usage.estimatedISK.toFixed(0)} ISK`
  );

  // Verdict
  console.log('');
  if (allTermMismatches.filter((m) => m.status === 'only-with-glossary').length > 0) {
    console.log('⚠️  SOME TERMS ONLY CORRECT WITH INLINE GLOSSARY — keep sending it');
  } else if (differentCount > 0 && allTermMismatches.length === 0) {
    console.log('✅ TERM USAGE IDENTICAL — text phrasing differs but terms match');
    console.log('   Server-side glossary is sufficient. --no-glossary is safe.');
  } else if (identicalCount === TEST_SEGMENTS.length) {
    console.log('✅ ALL TRANSLATIONS IDENTICAL — server-side glossary is fully equivalent');
    console.log('   --no-glossary is safe. Inline glossary is redundant.');
  } else {
    console.log('⚠️  MIXED RESULTS — review details above');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
