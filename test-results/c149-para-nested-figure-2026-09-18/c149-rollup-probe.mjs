/**
 * §C149 — drive the REAL chapter-exercises ROLLUP renderer, not just renderExercise.
 * This is the third column of `emitted -> injected -> RENDERED`: m68764's exercise
 * reaches readers ONLY through this page, and renderCnxmlToHtml never builds it.
 * exercisesByType is constructed from 01-source (the gold), in the exact shape
 * extractSectionExercises produces.
 */
import fs from 'fs';
import {
  renderCompiledExercises,
  _loadBookConfigForTest,
} from '/home/siggi/dev/repos/namsbokasafn-efni/tools/cnxml-render.js';
import { extractSegments, formatSegmentsMarkdown } from '/home/siggi/dev/repos/namsbokasafn-efni/tools/cnxml-extract.js';
import { buildCnxml, parseSegments } from '/home/siggi/dev/repos/namsbokasafn-efni/tools/cnxml-inject.js';

_loadBookConfigForTest('efnafraedi-2e');
const src = fs.readFileSync(
  '/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/01-source/ch10/m68764.cnxml',
  'utf8'
);
const section = /<section\s+[^>]*class="exercises"[^>]*>[\s\S]*?<\/section>/.exec(src);
console.log('exercises section found:', !!section, 'bytes:', section && section[0].length);

const exercisesByType = {
  exercises: [
    {
      moduleId: 'm68764',
      sectionNumber: '10.2',
      sectionTitle: 'Properties of Liquids',
      exercisesContent: section[0],
      exerciseClass: 'exercises',
    },
  ],
};
// Numbering map keyed as the real run keys it, so no NaN appears.
const nums = new Map([['m68764:fs-idm82765632', 23]]);
const html = renderCompiledExercises(10, exercisesByType, nums, {
  lang: 'is',
  chapter: 10,
  moduleId: '10-exercises',
  moduleSections: {},
  equations: {},
});

const FIGURE_INSIDE_P = /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<figure/;
console.log('--- ROLLUP PAGE PROBES ---');
console.log('bytes:                      ', html.length);
console.log('<figure> inside a <p>?      ', FIGURE_INSIDE_P.test(html));
console.log('<figure> after a </p>?      ', /<\/p>[\s\S]*?<figure/.test(html));
console.log('raw <caption> present?      ', html.includes('<caption'));
console.log('<figcaption> present?       ', html.includes('<figcaption'));
console.log('question prose present?     ', html.includes('a steel needle or paper clip'));
console.log('credit text occurrences:    ', (html.match(/Cory Zanker/g) || []).length);


// --- ARM 2: the same page built from an EXTRACT -> INJECT round-trip ---------
// Arm 1 renders 01-source directly, so it cannot show §C149 ②, whose duplication is
// introduced at EXTRACT (the figure's caption prose flattened into the paragraph's own
// segment). Running the round-trip separates "render duplicates it" from "extract does".
const { segments, structure, equations, inlineAttrs } = extractSegments(src);
const parsed = parseSegments(formatSegmentsMarkdown(segments));
const rt = buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).cnxml;
const rtSection = /<section\s+[^>]*class="exercises"[^>]*>[\s\S]*?<\/section>/.exec(rt);
const html2 = renderCompiledExercises(
  10,
  { exercises: [{ moduleId: 'm68764', sectionNumber: '10.2', sectionTitle: 'x', exercisesContent: rtSection[0], exerciseClass: 'exercises' }] },
  nums,
  { lang: 'is', chapter: 10, moduleId: '10-exercises', moduleSections: {}, equations: {} }
);
console.log('--- ARM 2: extract -> inject -> rollup render ---');
console.log('<figure> inside a <p>?      ', FIGURE_INSIDE_P.test(html2));
console.log('<figcaption> present?       ', html2.includes('<figcaption'));
console.log('credit text occurrences:    ', (html2.match(/Cory Zanker/g) || []).length, '(2 => §C149 ② is an EXTRACT-side duplication, not a render one)');
