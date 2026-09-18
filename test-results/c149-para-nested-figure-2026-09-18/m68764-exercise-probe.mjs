import fs from 'fs';
import { renderExercise, _loadBookConfigForTest } from '/home/siggi/dev/repos/namsbokasafn-efni/tools/cnxml-render.js';
import { extractElements } from '/home/siggi/dev/repos/namsbokasafn-efni/tools/lib/cnxml-parser.js';

_loadBookConfigForTest('efnafraedi-2e');
const src = fs.readFileSync('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/01-source/ch10/m68764.cnxml','utf8');
const ex = extractElements(src, 'exercise').find((e) => e.id === 'fs-idm82765632');
console.log('exercise found:', !!ex, ex && ex.id);
const ctx = { lang:'is', chapter:10, moduleId:'m68764', moduleSections:{}, equations:{}, undispatchedBlocks:[] };
const html = renderExercise(ex, ctx);
console.log('--- rendered ---');
console.log(html);
console.log('--- probes ---');
// ⚠️ The first draft of this line was `/<p[^>]*>[\s\S]*<figure/` — GREEDY, so it
// matched a <figure> that came AFTER </p> and reported the defect as still present
// on the FIXED output. The scan must not cross a </p>.
console.log('raw <figure inside <p>?  ', /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<figure/.test(html));
console.log('<figure> after </p>?     ', /<\/p>[\s\S]*?<figure/.test(html));
console.log('raw <caption> present?   ', html.includes('<caption'));
console.log('<figcaption> present?    ', html.includes('<figcaption'));
console.log('undispatchedBlocks:', JSON.stringify(ctx.undispatchedBlocks));
