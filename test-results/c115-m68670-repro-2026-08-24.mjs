/** Repro: does extract→inject on m68670 produce well-formed CNXML? */
import fs from 'node:fs';
import path from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
const ROOT = path.resolve(import.meta.dirname, '..');
const { extractSegments, formatSegmentsMarkdown } = await import(path.join(ROOT,'tools/cnxml-extract.js'));
const { buildCnxml, parseSegments } = await import(path.join(ROOT,'tools/cnxml-inject.js'));
const f = path.join(ROOT,'books/efnafraedi-2e/01-source/ch01/m68670.cnxml');
const src = fs.readFileSync(f,'utf8');
const { segments, structure, equations, inlineAttrs } = extractSegments(src);
const parsed = parseSegments(formatSegmentsMarkdown(segments));
const out = buildCnxml(structure, parsed, equations, src, {}, inlineAttrs).cnxml;
const bad = [];
new DOMParser({ onError:(lvl,msg)=>{ if(String(lvl)!=='warning') bad.push(String(msg).replace(/\s+/g,' ').slice(0,110)); } })
  .parseFromString(out,'text/xml');
console.log(`injected=${out.length} bytes | segments=${segments.length} | PARSE ERRORS: ${bad.length}`);
for (const b of [...new Set(bad)].slice(0,4)) console.log('   ', b);
