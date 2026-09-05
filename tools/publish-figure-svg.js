#!/usr/bin/env node
/**
 * ⑰ — publish a composed figure into the tree readers actually load.
 *
 *     node tools/publish-figure-svg.js --sidecar books/<slug>/figure-text/<basename>.is.json
 *                                     [--svg experiments/figure-text-translation/out/translated.svg]
 *                                     [--meta experiments/figure-text-translation/out/meta.json]
 *
 * `compose.py` writes `out/translated.svg`. Nothing carried it to
 * `books/<slug>/media/<basename>_IS.svg` — which is what `cnxml-inject` swaps
 * into the CNXML and what a reader loads — so the sidecar's `composedHash`
 * described a file no reader would ever see. This closes that.
 *
 * 🔴 WHY THIS IS JS AND NOT A FEW LINES INSIDE compose.py. It keeps two rules at
 * one owner each rather than guarding a second copy of them:
 *   - the translated filename comes from `image-mapping.json` through
 *     `loadImageBasenameMap`, so `DEFAULT_SUFFIX` is never restated;
 *   - `computeRenderHash` is JS, so with the stamp here there is NO hashing in
 *     the Python tree at all. "The composer must copy, never compute" stops
 *     being a rule a test has to enforce and becomes a fact about the code.
 *
 * ⚠️ THIS REPLACES PUBLISHED, READER-VISIBLE ARTWORK, AND THAT IS INTENDED. The
 * figures in `books/<slug>/media/` came from a June test run that had no editorial
 * surface and shipped as MT preview. Replacing them with output an editor can
 * review — badged `mt-preview` by the renderer until approved — is the point of
 * the pipeline. Every one of them is git-tracked, so `git checkout` is the
 * restore; this tool writes no `.bak` and deliberately keeps no second copy.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { loadImageBasenameMap } from './lib/image-basename-map.cjs';

const require = createRequire(import.meta.url);
const { readSidecar, writeSidecar } = require('./lib/figure-text-sidecar.cjs');

/**
 * `<anything>/books/<slug>/figure-text/<basename>.is.json` → its parts.
 *
 * The path IS the context: it carries the book and the figure, so the tool
 * needs no --book/--basename flags that could disagree with it. Anything else
 * is refused rather than guessed — a sidecar somewhere unexpected means the
 * caller is not doing what this tool is for.
 */
export function parseSidecarPath(sidecarPath) {
  const abs = path.resolve(sidecarPath);
  const dir = path.dirname(abs);
  const file = path.basename(abs);
  if (path.basename(dir) !== 'figure-text' || !file.endsWith('.is.json')) return null;
  const bookDir = path.dirname(dir);
  if (path.basename(path.dirname(bookDir)) !== 'books') return null;
  return { bookDir, book: path.basename(bookDir), basename: file.slice(0, -'.is.json'.length) };
}

/**
 * The figure `out/` currently holds, from the source PDF extract.py recorded.
 * Returns null when meta.json is absent or malformed — the caller treats that
 * as "cannot verify", never as "verified".
 */
export function basenameFromMeta(metaPath) {
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    if (!meta || typeof meta.source !== 'string') return null;
    return path.basename(meta.source, path.extname(meta.source));
  } catch {
    return null;
  }
}

/** composedHash directly after renderHash — the order applyApprovedFigureEdits writes. */
function withComposedHash(sidecar, composedHash) {
  const out = {};
  for (const [k, v] of Object.entries(sidecar)) {
    out[k] = v;
    if (k === 'renderHash') out.composedHash = composedHash;
  }
  if (!('composedHash' in out)) out.composedHash = composedHash;
  return out;
}

/**
 * Publish one composed figure.
 *
 * ORDER IS LOAD-BEARING, as it is in resolveFigureRequest: everything that can
 * refuse does so before a single byte is written, so a refusal always leaves the
 * tree exactly as it was.
 *
 * @returns {{ok:true, book, basename, outputName, path, replaced, composedHash:string|null}
 *          |{ok:false, reason:string, message:string}}
 */
export function publishFigureSvg({ sidecarPath, svgPath, metaPath }) {
  const parts = parseSidecarPath(sidecarPath);
  if (!parts) {
    return {
      ok: false,
      reason: 'bad-sidecar-path',
      message: `Not a books/<slug>/figure-text/<basename>.is.json path: ${sidecarPath}`,
    };
  }
  const { bookDir, book, basename } = parts;

  const sidecar = readSidecar(bookDir, basename);
  if (!sidecar) {
    return {
      ok: false,
      reason: 'no-sidecar',
      message: `Sidecar missing or malformed: ${sidecarPath}`,
    };
  }

  // 🔴 THE CROSS-CHECK. `out/` holds whatever figure was extracted LAST, and the
  // sidecar says which figure the TEXT is for. Publishing without comparing them
  // puts figure A's artwork on the page under figure B's translations — a
  // correct-looking translation of the wrong picture, which is the same class of
  // silent error sources.py's edition precedence exists to prevent one stage
  // earlier. Neither side can catch it alone.
  const composed = basenameFromMeta(metaPath);
  if (composed !== basename) {
    return {
      ok: false,
      reason: 'basename-mismatch',
      message:
        `out/ holds ${composed || '(unreadable meta.json)'} but the sidecar is for ${basename}. ` +
        `Re-run extract.py + compose.py for ${basename}, or point --sidecar at the right figure.`,
    };
  }

  // The mapped name is the ONLY source of the published filename. Building one
  // from a suffix here would restate DEFAULT_SUFFIX, whose owner is
  // tools/generate-image-mapping.js and whose test pins it against the corpus.
  const entry = loadImageBasenameMap(bookDir).find((e) => e.originalImage === basename);
  if (!entry) {
    return {
      ok: false,
      reason: 'unmapped',
      message: `No image-mapping.json entry for ${basename} in ${book}; run generate-image-mapping.js first.`,
    };
  }

  if (!fs.existsSync(svgPath)) {
    return { ok: false, reason: 'no-svg', message: `Composed SVG not found: ${svgPath}` };
  }

  // 🔴 CONTAINMENT, BEFORE THE WRITE. `outputName` arrives from a committed JSON data
  // file, so it is data, not a literal — and `path.join` happily resolves `../` out of
  // `media/` and into `01-source/`, which holds the legally load-bearing OpenStax CNXML
  // whose licence is fixed at the date the copy was obtained. A provenance audit proved
  // both arms on 2026-09-05: the traversal wrote into the licensed tree AND the call
  // still returned ok:true.
  //
  // A published figure is a FLAT file directly in media/, so the check is the strict
  // one: same directory, not merely "somewhere underneath". That also refuses an
  // absolute path, which `path.join` would otherwise treat as a plain segment.
  const mediaDir = path.resolve(bookDir, 'media');
  const target = path.resolve(mediaDir, entry.outputName);
  if (path.dirname(target) !== mediaDir) {
    return {
      ok: false,
      reason: 'unsafe-output-name',
      message:
        `image-mapping.json entry for ${basename} names an outputName that escapes ` +
        `media/: ${JSON.stringify(entry.outputName)}. A published figure is a flat file ` +
        `in the book's media/ directory; nothing may be written outside it.`,
    };
  }
  const replaced = fs.existsSync(target);
  fs.copyFileSync(svgPath, target);

  // Copied, never computed — see the header. A sidecar nobody has approved has
  // no renderHash, and that is the ORDINARY case under the current plan
  // (publish the MT, review it afterwards): there is simply no approval to
  // record, and effectiveState reads mt-preview either way.
  const composedHash = sidecar.renderHash || null;
  if (composedHash && sidecar.composedHash !== composedHash) {
    writeSidecar(bookDir, basename, withComposedHash(sidecar, composedHash));
  }

  return {
    ok: true,
    book,
    basename,
    outputName: entry.outputName,
    path: target,
    replaced,
    composedHash,
  };
}

/* c8 ignore start -- CLI wiring; the behaviour above is what the tests drive. */
function parseArgv(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const args = parseArgv(process.argv.slice(2));
  if (!args.sidecar) {
    console.error('usage: publish-figure-svg.js --sidecar <path> [--svg <path>] [--meta <path>]');
    process.exitCode = 2;
  } else {
    const expDir = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      '..',
      'experiments',
      'figure-text-translation',
      'out'
    );
    const res = publishFigureSvg({
      sidecarPath: args.sidecar,
      svgPath: args.svg || path.join(expDir, 'translated.svg'),
      metaPath: args.meta || path.join(expDir, 'meta.json'),
    });
    if (!res.ok) {
      console.error(`REFUSED (${res.reason}): ${res.message}`);
      process.exitCode = 1;
    } else {
      console.log(
        `${res.replaced ? 'replaced' : 'wrote'} ${res.path}` +
          (res.composedHash ? `  composedHash=${res.composedHash}` : '  (no approval to stamp)')
      );
    }
  }
}
/* c8 ignore stop */
