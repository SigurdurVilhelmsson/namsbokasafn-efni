#!/usr/bin/env node

/**
 * restore-links.js
 *
 * Post-MT processing script that restores markdown links from MT-safe syntax.
 *
 * The cnxml-to-md.js script converts links to {}-attribute syntax to survive
 * machine translation (Erlendur strips URLs from standard markdown links).
 *
 * This script converts them back to standard markdown:
 *   [text]{url="http://..."} → [text](http://...)
 *   [text]{ref="ID"}         → [text](#ID)
 *   [text]{doc="moduleId"}   → [text](/book/kafli/chapter/section)
 *
 * Usage:
 *   node tools/restore-links.js <input.md> [--output <output.md>]
 *   node tools/restore-links.js <input.md> --in-place
 *   cat input.md | node tools/restore-links.js > output.md
 *
 * Options:
 *   --output <file>   Write to specified file (default: stdout)
 *   --in-place        Modify the input file in place
 *   --book <slug>     Book slug for document cross-references (default: efnafraedi)
 *   --verbose         Show processing details
 *   -h, --help        Show help message
 */

import fs from 'fs';
import path from 'path';

// Module ID to chapter/section mapping (from OpenStax Chemistry 2e)
// This maps module IDs to the URL path structure used in namsbokasafn-vefur
const CHEMISTRY_2E_MODULES = {
  // Chapter 1: Essential Ideas
  'm68663': { chapter: '01', section: '1-0-introduction' },
  'm68664': { chapter: '01', section: '1-1-chemistry-in-context' },
  'm68667': { chapter: '01', section: '1-2-phases-and-classification-of-matter' },
  'm68670': { chapter: '01', section: '1-3-physical-and-chemical-properties' },
  'm68674': { chapter: '01', section: '1-4-measurements' },
  'm68690': { chapter: '01', section: '1-5-measurement-uncertainty-accuracy-and-precision' },
  'm68683': { chapter: '01', section: '1-6-mathematical-treatment-of-measurement-results' },
  // Chapter 2: Atoms, Molecules, and Ions
  'm68684': { chapter: '02', section: '2-0-introduction' },
  'm68685': { chapter: '02', section: '2-1-early-ideas-in-atomic-theory' },
  'm68687': { chapter: '02', section: '2-2-evolution-of-atomic-theory' },
  'm68692': { chapter: '02', section: '2-3-atomic-structure-and-symbolism' },
  'm68693': { chapter: '02', section: '2-4-chemical-formulas' },
  'm68695': { chapter: '02', section: '2-5-the-periodic-table' },
  'm68696': { chapter: '02', section: '2-6-ionic-and-molecular-compounds' },
  'm68698': { chapter: '02', section: '2-7-chemical-nomenclature' },
  // Chapter 3: Composition of Substances and Solutions
  'm68699': { chapter: '03', section: '3-0-introduction' },
  'm68700': { chapter: '03', section: '3-1-formula-mass-and-the-mole-concept' },
  'm68702': { chapter: '03', section: '3-2-determining-empirical-and-molecular-formulas' },
  'm68703': { chapter: '03', section: '3-3-molarity' },
  'm68704': { chapter: '03', section: '3-4-other-units-for-solution-concentrations' },
  // Chapter 4: Stoichiometry of Chemical Reactions
  'm68730': { chapter: '04', section: '4-0-introduction' },
  'm68709': { chapter: '04', section: '4-1-writing-and-balancing-chemical-equations' },
  'm68710': { chapter: '04', section: '4-2-classifying-chemical-reactions' },
  'm68713': { chapter: '04', section: '4-3-reaction-stoichiometry' },
  'm68714': { chapter: '04', section: '4-4-reaction-yields' },
  'm68716': { chapter: '04', section: '4-5-quantitative-chemical-analysis' },
  // Chapter 5: Thermochemistry
  'm68723': { chapter: '05', section: '5-0-introduction' },
  'm68724': { chapter: '05', section: '5-1-energy-basics' },
  'm68726': { chapter: '05', section: '5-2-calorimetry' },
  'm68727': { chapter: '05', section: '5-3-enthalpy' },
  // Chapter 6: Electronic Structure and Periodic Properties
  'm68728': { chapter: '06', section: '6-0-introduction' },
  'm68729': { chapter: '06', section: '6-1-electromagnetic-energy' },
  'm68732': { chapter: '06', section: '6-2-the-bohr-model' },
  'm68733': { chapter: '06', section: '6-3-development-of-quantum-theory' },
  'm68734': { chapter: '06', section: '6-4-electronic-structure-of-atoms' },
  'm68735': { chapter: '06', section: '6-5-periodic-variations-in-element-properties' },
  // Chapter 7: Chemical Bonding and Molecular Geometry
  'm68736': { chapter: '07', section: '7-0-introduction' },
  'm68737': { chapter: '07', section: '7-1-ionic-bonding' },
  'm68738': { chapter: '07', section: '7-2-covalent-bonding' },
  'm68739': { chapter: '07', section: '7-3-lewis-symbols-and-structures' },
  'm68740': { chapter: '07', section: '7-4-formal-charges-and-resonance' },
  'm68741': { chapter: '07', section: '7-5-strengths-of-ionic-and-covalent-bonds' },
  'm68742': { chapter: '07', section: '7-6-molecular-structure-and-polarity' },
  // Chapter 8: Advanced Theories of Covalent Bonding
  'm68743': { chapter: '08', section: '8-0-introduction' },
  'm68744': { chapter: '08', section: '8-1-valence-bond-theory' },
  'm68745': { chapter: '08', section: '8-2-hybrid-atomic-orbitals' },
  'm68746': { chapter: '08', section: '8-3-multiple-bonds' },
  'm68747': { chapter: '08', section: '8-4-molecular-orbital-theory' },
  // Chapter 9: Gases
  'm68748': { chapter: '09', section: '9-0-introduction' },
  'm68750': { chapter: '09', section: '9-1-gas-pressure' },
  'm68751': { chapter: '09', section: '9-2-relating-pressure-volume-amount-and-temperature' },
  'm68752': { chapter: '09', section: '9-3-stoichiometry-of-gaseous-substances-mixtures-and-reactions' },
  'm68754': { chapter: '09', section: '9-4-effusion-and-diffusion-of-gases' },
  'm68758': { chapter: '09', section: '9-5-the-kinetic-molecular-theory' },
  'm68759': { chapter: '09', section: '9-6-non-ideal-gas-behavior' },
  // Chapter 10: Liquids and Solids
  'm68760': { chapter: '10', section: '10-0-introduction' },
  'm68761': { chapter: '10', section: '10-1-intermolecular-forces' },
  'm68764': { chapter: '10', section: '10-2-properties-of-liquids' },
  'm68768': { chapter: '10', section: '10-3-phase-transitions' },
  'm68769': { chapter: '10', section: '10-4-phase-diagrams' },
  'm68770': { chapter: '10', section: '10-5-the-solid-state-of-matter' },
  'm68773': { chapter: '10', section: '10-6-lattice-structures-in-crystalline-solids' },
  // Chapter 11: Solutions and Colloids
  'm68776': { chapter: '11', section: '11-0-introduction' },
  'm68778': { chapter: '11', section: '11-1-the-dissolution-process' },
  'm68781': { chapter: '11', section: '11-2-electrolytes' },
  'm68782': { chapter: '11', section: '11-3-solubility' },
  'm68783': { chapter: '11', section: '11-4-colligative-properties' },
  'm68784': { chapter: '11', section: '11-5-colloids' },
  // Chapter 12: Kinetics
  'm68785': { chapter: '12', section: '12-0-introduction' },
  'm68786': { chapter: '12', section: '12-1-chemical-reaction-rates' },
  'm68787': { chapter: '12', section: '12-2-factors-affecting-reaction-rates' },
  'm68789': { chapter: '12', section: '12-3-rate-laws' },
  'm68791': { chapter: '12', section: '12-4-integrated-rate-laws' },
  'm68793': { chapter: '12', section: '12-5-collision-theory' },
  'm68794': { chapter: '12', section: '12-6-reaction-mechanisms' },
  'm68795': { chapter: '12', section: '12-7-catalysis' },
  // Chapter 13: Fundamental Equilibrium Concepts
  'm68796': { chapter: '13', section: '13-0-introduction' },
  'm68797': { chapter: '13', section: '13-1-chemical-equilibria' },
  'm68798': { chapter: '13', section: '13-2-equilibrium-constants' },
  'm68799': { chapter: '13', section: '13-3-shifting-equilibria-le-chateliers-principle' },
  'm68801': { chapter: '13', section: '13-4-equilibrium-calculations' },
  // Chapter 14: Acid-Base Equilibria
  'm68802': { chapter: '14', section: '14-0-introduction' },
  'm68803': { chapter: '14', section: '14-1-bronsted-lowry-acids-and-bases' },
  'm68804': { chapter: '14', section: '14-2-ph-and-poh' },
  'm68805': { chapter: '14', section: '14-3-relative-strengths-of-acids-and-bases' },
  'm68806': { chapter: '14', section: '14-4-hydrolysis-of-salts' },
  'm68807': { chapter: '14', section: '14-5-polyprotic-acids' },
  'm68808': { chapter: '14', section: '14-6-buffers' },
  'm68809': { chapter: '14', section: '14-7-acid-base-titrations' },
  // Chapter 15: Equilibria of Other Reaction Classes
  'm68810': { chapter: '15', section: '15-0-introduction' },
  'm68811': { chapter: '15', section: '15-1-precipitation-and-dissolution' },
  'm68813': { chapter: '15', section: '15-2-lewis-acids-and-bases' },
  'm68814': { chapter: '15', section: '15-3-coupled-equilibria' },
  // Chapter 16: Thermodynamics
  'm68815': { chapter: '16', section: '16-0-introduction' },
  'm68816': { chapter: '16', section: '16-1-spontaneity' },
  'm68817': { chapter: '16', section: '16-2-entropy' },
  'm68818': { chapter: '16', section: '16-3-the-second-and-third-laws-of-thermodynamics' },
  'm68819': { chapter: '16', section: '16-4-free-energy' },
  // Chapter 17: Electrochemistry
  'm68820': { chapter: '17', section: '17-0-introduction' },
  'm68821': { chapter: '17', section: '17-1-review-of-redox-chemistry' },
  'm68822': { chapter: '17', section: '17-2-galvanic-cells' },
  'm68823': { chapter: '17', section: '17-3-electrode-and-cell-potentials' },
  'm68824': { chapter: '17', section: '17-4-potential-free-energy-and-equilibrium' },
  'm68825': { chapter: '17', section: '17-5-batteries-and-fuel-cells' },
  'm68826': { chapter: '17', section: '17-6-corrosion' },
  'm68827': { chapter: '17', section: '17-7-electrolysis' },
  // Chapter 18: Representative Metals, Metalloids, and Nonmetals
  'm68828': { chapter: '18', section: '18-0-introduction' },
  'm68829': { chapter: '18', section: '18-1-periodicity' },
  'm68830': { chapter: '18', section: '18-2-occurrence-and-preparation-of-the-representative-metals' },
  'm68831': { chapter: '18', section: '18-3-structure-and-general-properties-of-the-metalloids' },
  'm68832': { chapter: '18', section: '18-4-structure-and-general-properties-of-the-nonmetals' },
  'm68833': { chapter: '18', section: '18-5-occurrence-preparation-and-compounds-of-hydrogen' },
  'm68834': { chapter: '18', section: '18-6-occurrence-preparation-and-properties-of-carbonates' },
  'm68835': { chapter: '18', section: '18-7-occurrence-preparation-and-properties-of-nitrogen' },
  'm68836': { chapter: '18', section: '18-8-occurrence-preparation-and-properties-of-phosphorus' },
  'm68837': { chapter: '18', section: '18-9-occurrence-preparation-and-compounds-of-oxygen' },
  'm68838': { chapter: '18', section: '18-10-occurrence-preparation-and-properties-of-sulfur' },
  'm68839': { chapter: '18', section: '18-11-occurrence-preparation-and-properties-of-halogens' },
  'm68840': { chapter: '18', section: '18-12-occurrence-preparation-and-properties-of-the-noble-gases' },
  // Chapter 19: Transition Metals and Coordination Chemistry
  'm68841': { chapter: '19', section: '19-0-introduction' },
  'm68842': { chapter: '19', section: '19-1-occurrence-preparation-and-properties-of-transition-metals-and-their-compounds' },
  'm68843': { chapter: '19', section: '19-2-coordination-chemistry-of-transition-metals' },
  'm68844': { chapter: '19', section: '19-3-spectroscopic-and-magnetic-properties-of-coordination-compounds' },
  // Chapter 20: Organic Chemistry
  'm68845': { chapter: '20', section: '20-0-introduction' },
  'm68846': { chapter: '20', section: '20-1-hydrocarbons' },
  'm68847': { chapter: '20', section: '20-2-alcohols-and-ethers' },
  'm68848': { chapter: '20', section: '20-3-aldehydes-ketones-carboxylic-acids-and-esters' },
  'm68849': { chapter: '20', section: '20-4-amines-and-amides' },
  // Chapter 21: Nuclear Chemistry
  'm68850': { chapter: '21', section: '21-0-introduction' },
  'm68851': { chapter: '21', section: '21-1-nuclear-structure-and-stability' },
  'm68852': { chapter: '21', section: '21-2-nuclear-equations' },
  'm68854': { chapter: '21', section: '21-3-radioactive-decay' },
  'm68856': { chapter: '21', section: '21-4-transmutation-and-nuclear-energy' },
  'm68857': { chapter: '21', section: '21-5-uses-of-radioisotopes' },
  'm68858': { chapter: '21', section: '21-6-biological-effects-of-radiation' },
  // Appendices (not in main book - keep as text references)
  'm68860': { chapter: 'appendix', section: 'appendix-b' },
  'm68863': { chapter: 'appendix', section: 'appendix-e' },
  'm68865': { chapter: 'appendix', section: 'appendix-g' },
  'm68866': { chapter: 'appendix', section: 'appendix-h' },
  'm68870': { chapter: 'appendix', section: 'appendix-l' },
};

function parseArgs(args) {
  const result = {
    input: null,
    output: null,
    inPlace: false,
    book: 'efnafraedi',
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--in-place') result.inPlace = true;
    else if (arg === '--output' && args[i + 1]) result.output = args[++i];
    else if (arg === '--book' && args[i + 1]) result.book = args[++i];
    else if (!arg.startsWith('-') && !result.input) result.input = arg;
  }
  return result;
}

function printHelp() {
  console.log(`
restore-links.js - Convert MT-safe link syntax back to standard markdown

After machine translation, this script converts:
  [text]{url="http://..."}  → [text](http://...)
  [text]{ref="ID"}          → [text](#ID)
  [text]{doc="moduleId"}    → [text](/book/kafli/chapter/section)

Usage:
  node tools/restore-links.js <input.md> [options]
  cat input.md | node tools/restore-links.js > output.md

Options:
  --output <file>   Write to specified file (default: stdout)
  --in-place        Modify the input file in place
  --book <slug>     Book slug for document refs (default: efnafraedi)
  --verbose         Show processing details
  -h, --help        Show this help message

Examples:
  node tools/restore-links.js translated.md --output restored.md
  node tools/restore-links.js translated.md --in-place
  node tools/restore-links.js translated.md --book efnafraedi
`);
}

function restoreLinks(content, bookSlug, verbose) {
  let urlCount = 0;
  let refCount = 0;
  let docCount = 0;
  let unknownDocCount = 0;
  let imageCount = 0;
  let attrCount = 0;
  let bracketCount = 0;
  let equationCount = 0;
  let latexFixCount = 0;

  // ============================================================================
  // STEP 1: Unescape MT-escaped characters FIRST (before pattern matching)
  // Erlendur MT escapes brackets with backslashes: \[ \] → [ ]
  // This must happen before link patterns can match
  // ============================================================================

  // Unescape brackets in link patterns: \[text\]{url="..."} → [text]{url="..."}
  // Also handles ref and doc patterns
  content = content.replace(/\\(\[)([^\]\\]*(?:\\.[^\]\\]*)*)\\(\])\{(url|ref|doc)=/g, (match, ob, text, cb, type) => {
    bracketCount += 2;
    // Also unescape any brackets inside the text
    const cleanText = text.replace(/\\([\[\]])/g, '$1');
    return `[${cleanText}]{${type}=`;
  });

  // Unescape equation placeholders: \[\[EQ:N\]\] → [[EQ:N]]
  content = content.replace(/\\\[\\\[EQ:(\d+)\\\]\\\]/g, (match, num) => {
    equationCount++;
    return `[[EQ:${num}]]`;
  });

  // Also handle equation with attributes: \[\[EQ:N\]\]{id="..."} → [[EQ:N]]{id="..."}
  content = content.replace(/\\\[\\\[EQ:(\d+)\\\]\\\](\{[^}]+\})/g, (match, num, attrs) => {
    equationCount++;
    return `[[EQ:${num}]]${attrs}`;
  });

  // Unescape LaTeX content within math blocks
  // Fix escaped underscores: \_ → _ (for subscripts like K_{eq})
  // Fix escaped brackets inside math: \[ \] → [ ] (for concentration notation [A])
  content = content.replace(/\$\$([^$]+)\$\$/g, (match, mathContent) => {
    const fixed = mathContent
      .replace(/\\_/g, '_')
      .replace(/\\\[/g, '[')
      .replace(/\\\]/g, ']');
    if (fixed !== mathContent) {
      latexFixCount++;
    }
    return `$$${fixed}$$`;
  });

  content = content.replace(/\$([^$\n]+)\$/g, (match, mathContent) => {
    const fixed = mathContent
      .replace(/\\_/g, '_')
      .replace(/\\\[/g, '[')
      .replace(/\\\]/g, ']');
    if (fixed !== mathContent) {
      latexFixCount++;
    }
    return `$${fixed}$`;
  });

  // Unescape isotope notation outside math: \_{6}^{14}C → _{6}^{14}C
  content = content.replace(/\\_\{(\d+)\}\^/g, (match, num) => {
    latexFixCount++;
    return `_{${num}}^`;
  });

  // ============================================================================
  // STEP 2: Restore link syntax (now works because brackets are unescaped)
  // ============================================================================

  // Restore external URLs: [text]{url="http://..."} → [text](http://...)
  content = content.replace(/\[([^\]]*)\]\{url="([^"]*)"\}/g, (match, text, url) => {
    urlCount++;
    return `[${text}](${url})`;
  });

  // Restore internal references: [text]{ref="ID"} → [text](#ID)
  content = content.replace(/\[([^\]]*)\]\{ref="([^"]*)"\}/g, (match, text, refId) => {
    refCount++;
    return `[${text}](#${refId})`;
  });

  // Restore document cross-references: [text]{doc="moduleId"} → [text](/book/kafli/chapter/section)
  // Also handle combined doc + target-id if present
  content = content.replace(/\[([^\]]*)\]\{doc="([^"]*)"\}/g, (match, text, moduleId) => {
    docCount++;

    const moduleInfo = CHEMISTRY_2E_MODULES[moduleId];
    if (moduleInfo) {
      if (moduleInfo.chapter === 'appendix') {
        // Appendices are external - keep as text reference
        return text;
      }
      const path = `/${bookSlug}/kafli/${moduleInfo.chapter}/${moduleInfo.section}`;
      return `[${text}](${path})`;
    } else {
      // Unknown module ID - keep the original syntax for manual review
      unknownDocCount++;
      if (verbose) {
        console.error(`Warning: Unknown module ID: ${moduleId}`);
      }
      return match;
    }
  });

  // Restore image attributes: ![](file){id="..." class="..." alt="..."} → ![alt](file){#id .class}
  content = content.replace(/!\[\]\(([^)]+)\)\{([^}]+)\}/g, (match, src, attrs) => {
    imageCount++;
    // Parse attributes
    const idMatch = attrs.match(/id="([^"]*)"/);
    const classMatch = attrs.match(/class="([^"]*)"/);
    const altMatch = attrs.match(/alt="([^"]*)"/);

    const id = idMatch ? idMatch[1] : '';
    const className = classMatch ? classMatch[1] : '';
    const alt = altMatch ? altMatch[1] : '';

    // Build Pandoc-style attribute string
    const pandocAttrs = [];
    if (id) pandocAttrs.push(`#${id}`);
    if (className) pandocAttrs.push(`.${className}`);

    const attrStr = pandocAttrs.length > 0 ? `{${pandocAttrs.join(' ')}}` : '';
    return `![${alt}](${src})${attrStr}`;
  });

  // Restore term/figure caption IDs: **term**{id="..."} → **term**{#...}
  // Also handles: *Figure 1.1: caption*{id="..."} → *Figure 1.1: caption*{#...}
  content = content.replace(/(\*[^*]+\*|\*\*[^*]+\*\*)\{id="([^"]*)"\}/g, (match, text, id) => {
    attrCount++;
    return `${text}{#${id}}`;
  });

  // Restore standalone attribute blocks (for tables): {id="..." summary="..."} → {#id}
  // Keep on separate lines (after tables)
  content = content.replace(/^\{id="([^"]*)"[^}]*\}$/gm, (match, id) => {
    attrCount++;
    return `{#${id}}`;
  });

  // ============================================================================
  // STEP 3: Final cleanup - catch any remaining escaped brackets
  // ============================================================================

  // Catch any remaining escaped brackets not caught by specific patterns
  const remainingBrackets = (content.match(/\\[\[\]]/g) || []).length;
  content = content.replace(/\\([\[\]])/g, '$1');
  bracketCount += remainingBrackets;

  if (verbose) {
    console.error(`MT escape fixes: ${bracketCount} brackets, ${equationCount} equations, ${latexFixCount} LaTeX`);
    console.error(`Restored links: ${urlCount} URLs, ${refCount} refs, ${docCount} docs`);
    console.error(`Restored attributes: ${imageCount} images, ${attrCount} IDs`);
    if (unknownDocCount > 0) {
      console.error(`Warning: ${unknownDocCount} unknown document references`);
    }
  }

  return content;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  let content;

  if (args.input) {
    if (!fs.existsSync(args.input)) {
      console.error(`Error: File not found: ${args.input}`);
      process.exit(1);
    }
    content = fs.readFileSync(args.input, 'utf-8');
  } else if (!process.stdin.isTTY) {
    content = await readStdin();
  } else {
    console.error('Error: No input provided. Use --help for usage.');
    process.exit(1);
  }

  const restored = restoreLinks(content, args.book, args.verbose);

  if (args.inPlace && args.input) {
    fs.writeFileSync(args.input, restored);
    if (args.verbose) {
      console.error(`Updated: ${args.input}`);
    }
  } else if (args.output) {
    const outputDir = path.dirname(args.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(args.output, restored);
    if (args.verbose) {
      console.error(`Written to: ${args.output}`);
    }
  } else {
    console.log(restored);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
