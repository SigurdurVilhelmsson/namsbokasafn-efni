/**
 * The figure config's three tables, checked against the repo (§C140 ㊵, spec D11).
 *
 * Run by `npm test` (tools/__tests__/figure-config-validate.test.js), and run LOCALLY before any
 * pin's buy: CI only sees a pin after the money is spent, because a pin lands in the commit that
 * runs its buy (spec D1). The Python resolver fails closed per figure at run time; these are the
 * rules it cannot check, plus the cross-table ones.
 *
 * ⚠️ A RETIRED FIGURE'S PUBLISHED COPIES AND REFERENCES ARE NOT CHECKED HERE, ON PURPOSE: they
 * legitimately remain until ②'s whole-book re-render (spec D14). After `--prune`, re-running the
 * retire tool as a dry run is the census: it reports what still references each figure.
 */
import fs from 'fs';
import path from 'path';
import { normkey } from './figure-text-config.js';
import { DEFAULT_SUFFIX, indexBookSourceBasenames } from '../generate-image-mapping.js';
import { readMappingOrRefuse, topLevelTranslatedCopies } from './translated-figure-refs.js';

const TABLES = ['supersededArtwork', 'retiredFigures', 'artworkPins'];
const PIN_KINDS = new Set(['alias', 'override']);
const MIN_REASON = 40;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {object} cfg  the parsed figure config
 * @param {{suffix:string, basenamesByBook:Object<string,Set<string>>,
 *          retiredState:Object<string,{rows:number, translatedCopies:string[]}>}} corpus
 * @returns {string[]} problems; empty when the config is valid
 */
export function validateFigureConfig(cfg, corpus) {
  const problems = [];
  const tables = {};
  for (const name of TABLES) {
    // Only an ABSENT table is empty. `?? {}` would also read a null one as empty, and the tools
    // throw on a null table (retiredFigureNames), so the validator must refuse it, not pass it.
    const t = cfg[name] === undefined ? {} : cfg[name];
    if (!isPlainObject(t)) problems.push(`${name} must be an object`);
    tables[name] = t;
  }
  if (problems.length) return problems;

  // No two keys within one table fold together: the resolver would keep only one of them.
  for (const name of TABLES) {
    const seen = new Map();
    for (const k of Object.keys(tables[name])) {
      const f = normkey(k);
      if (seen.has(f)) problems.push(`${name}: ${seen.get(f)} and ${k} fold to the same key`);
      else seen.set(f, k);
    }
  }

  // A pin shares no key with the other two tables: either would refuse the figure first.
  const foldedKeys = (t) => new Map(Object.keys(t).map((k) => [normkey(k), k]));
  for (const other of ['supersededArtwork', 'retiredFigures']) {
    const keys = foldedKeys(tables[other]);
    for (const k of Object.keys(tables.artworkPins)) {
      if (keys.has(normkey(k))) {
        problems.push(
          `artworkPins.${k} is also in ${other} (${keys.get(normkey(k))}) — that pin can never apply`
        );
      }
    }
  }

  // Every key is EXACTLY the basename of an image in exactly one book's source.
  const books = Object.entries(corpus.basenamesByBook);
  for (const name of TABLES) {
    for (const k of Object.keys(tables[name])) {
      const owners = books.filter(([, set]) => set.has(k)).map(([b]) => b);
      if (owners.length !== 1) {
        problems.push(
          `${name}.${k} names an image in ${owners.length} books' source (${owners.join(', ') || 'none'}); it must be exactly one`
        );
      }
    }
  }

  // Every entry carries a substantive reason.
  const reasonOf = (name, v) =>
    name === 'artworkPins' ? (isPlainObject(v) ? v.reason : undefined) : v;
  for (const name of TABLES) {
    for (const [k, v] of Object.entries(tables[name])) {
      const r = reasonOf(name, v);
      if (typeof r !== 'string' || r.trim().length <= MIN_REASON) {
        problems.push(`${name}.${k} needs a reason of over ${MIN_REASON} characters`);
      }
    }
  }

  // Each pin names one valid file, no other pin names it, and it is no other figure's artwork.
  const allBasenames = new Map();
  for (const [, set] of books) for (const b of set) allBasenames.set(normkey(b), b);
  const targets = new Map();
  for (const [k, pin] of Object.entries(tables.artworkPins)) {
    if (!isPlainObject(pin)) {
      problems.push(`artworkPins.${k} must be an object`);
      continue;
    }
    if (!PIN_KINDS.has(pin.kind))
      problems.push(
        `artworkPins.${k}.kind must be alias or override, got ${JSON.stringify(pin.kind)}`
      );
    if (!(cfg.editionPrecedence || []).includes(pin.edition)) {
      problems.push(
        `artworkPins.${k}.edition ${JSON.stringify(pin.edition)} is not in editionPrecedence`
      );
    }
    const file = pin.file;
    if (typeof file !== 'string' || !file.trim()) {
      problems.push(`artworkPins.${k}.file must be a non-empty string`);
      continue;
    }
    if (
      file.startsWith('/') ||
      /^[A-Za-z]:/.test(file) ||
      file.includes('\\') ||
      file === '.' ||
      file.split('/').includes('..')
    ) {
      problems.push(
        `artworkPins.${k}.file ${JSON.stringify(file)} must be a relative path inside its tree`
      );
    }
    const ext = path.posix.extname(file);
    const stem = path.posix.basename(file, ext);
    if (stem.toLowerCase().endsWith(corpus.suffix.toLowerCase())) {
      problems.push(
        `artworkPins.${k}.file ${JSON.stringify(file)} is one of our own translated files (its stem ends in the translated suffix)`
      );
    }
    const owner = allBasenames.get(normkey(stem));
    if (owner !== undefined && normkey(owner) !== normkey(k)) {
      problems.push(
        `artworkPins.${k}.file ${JSON.stringify(file)} is the artwork of another figure, ${owner}`
      );
    }
    const target = `${pin.edition}:${path.posix.normalize(file)}`;
    if (targets.has(target))
      problems.push(
        `artworkPins.${k} and artworkPins.${targets.get(target)} name the same file ${target}`
      );
    else targets.set(target, k);
  }

  // A retired figure has no row and no translated copy: what --retire removes.
  for (const k of Object.keys(tables.retiredFigures)) {
    const s = corpus.retiredState[k];
    if (!s) continue; // the exactly-one-book rule above already names it
    if (s.rows)
      problems.push(
        `retiredFigures.${k} still has ${s.rows} image-mapping row(s) — run tools/retire-translated-figure.js --retire`
      );
    for (const f of s.translatedCopies)
      problems.push(`retiredFigures.${k} still has a translated copy: media/${f}`);
  }
  return problems;
}

/**
 * The corpus the validator needs, read from the repo. No git: this runs in CI.
 * @returns {{suffix:string, basenamesByBook:Object<string,Set<string>>, retiredState:Object}}
 */
export function buildValidatorCorpus(repoRoot, cfg) {
  const booksDir = path.join(repoRoot, 'books');
  const basenamesByBook = {};
  for (const b of fs.readdirSync(booksDir).sort()) {
    const bookDir = path.join(booksDir, b);
    if (fs.statSync(bookDir).isDirectory()) basenamesByBook[b] = indexBookSourceBasenames(bookDir);
  }
  const retiredState = {};
  for (const k of Object.keys(cfg.retiredFigures ?? {})) {
    const owners = Object.keys(basenamesByBook).filter((b) => basenamesByBook[b].has(k));
    if (owners.length !== 1) continue;
    const bookDir = path.join(booksDir, owners[0]);
    const rows = readMappingOrRefuse(path.join(bookDir, 'media', 'image-mapping.json'), {
      allowMissing: true,
    });
    retiredState[k] = {
      rows: rows.filter((r) => r.originalImage === k).length,
      translatedCopies: topLevelTranslatedCopies(bookDir, k, DEFAULT_SUFFIX),
    };
  }
  return { suffix: DEFAULT_SUFFIX, basenamesByBook, retiredState };
}
