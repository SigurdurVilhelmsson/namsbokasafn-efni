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

/**
 * composedHash directly after renderHash — the order applyApprovedFigureEdits writes.
 *
 * 🔴 THE `continue` IS THE WHOLE FIX, AND IT WAS A SHIPPED BUG (register §C138).
 * Without it the loop stamped the new hash on reaching `renderHash` and then walked on
 * to the sidecar's OWN pre-existing `composedHash` key, copying the STALE value back
 * over the stamp. The returned object is built elsewhere and stayed correct, so the
 * defect was observable only on disk: a re-publish never completed the correction loop
 * and every later `--stale` query re-selected the same figure for ever.
 *
 * Skipping in the loop — rather than re-assigning after it — is what keeps the key in
 * its canonical position when the file on disk had it BEFORE `renderHash`.
 */
function withComposedHash(sidecar, composedHash) {
  const out = {};
  for (const [k, v] of Object.entries(sidecar)) {
    if (k === 'composedHash') continue; // re-inserted below, at the canonical position
    out[k] = v;
    if (k === 'renderHash') out.composedHash = composedHash;
  }
  if (!('composedHash' in out)) out.composedHash = composedHash;
  return out;
}

/**
 * 🔴 CONTAINMENT, AS A PREDICATE WITH ONE OWNER. `outputName` arrives from a committed JSON data
 * file, so it is data, not a literal — and `path.join` happily resolves `../` out of `media/`
 * and into `01-source/`, which holds the legally load-bearing OpenStax CNXML whose licence is
 * fixed at the date the copy was obtained. A provenance audit proved both arms on 2026-09-05:
 * the traversal wrote into the licensed tree AND the call still returned ok:true.
 *
 * A published figure is a FLAT file directly in media/, so the test is the strict one — same
 * directory, not merely "somewhere underneath". That also refuses an absolute path, which
 * `path.join` would otherwise treat as a plain segment.
 *
 * ⚠️ EXPORTED because `tools/figure-run.js`'s pre-flight must ask the same question BEFORE the
 * money, and the rule may not have two implementations: a second copy here is exactly how a
 * pre-flight and a publisher come to disagree about what is safe.
 *
 * @returns {boolean} true when publishing `outputName` would write outside `<bookDir>/media/`
 */
export function escapesMediaDir(bookDir, outputName) {
  const mediaDir = path.resolve(bookDir, 'media');
  return path.dirname(path.resolve(mediaDir, outputName)) !== mediaDir;
}

/**
 * Publish one composed figure.
 *
 * ORDER IS LOAD-BEARING, as it is in resolveFigureRequest: everything that can
 * refuse does so before a single byte is written, so a refusal always leaves the
 * tree exactly as it was.
 *
 * 🔴 `expectedRenderHash` IS THE COMPOSE VINTAGE, AND IT IS DETECTED BY THE KEY'S
 * PRESENCE — `null` is a real expectation ("the sidecar I composed from had no
 * renderHash"), while omitting the key entirely means "do not check". Only a
 * caller that ran the composer knows which blocks the SVG was drawn from, so the
 * hand-run CLI below omits it and keeps its existing behaviour; `figure-run.js`
 * always supplies it.
 *
 * @param {{sidecarPath:string, svgPath:string, metaPath:string,
 *          expectedRenderHash?:string|null}} options
 * @returns {{ok:true, book, basename, outputName, path, replaced, composedHash:string|null}
 *          |{ok:false, reason:string, message:string}}
 */
export function publishFigureSvg(options = {}) {
  const { sidecarPath, svgPath, metaPath, expectedRenderHash } = options;
  const checkVintage = Object.prototype.hasOwnProperty.call(options, 'expectedRenderHash');
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

  // 🔴 THE SECOND CROSS-CHECK, AND IT IS ABOUT VINTAGE RATHER THAN IDENTITY. The read
  // above happens AFTER the caller composed, so anything that rewrote this file in
  // between — `applyApprovedFigureEdits`, i.e. a head editor pressing approve on the
  // figure being recomposed — would have the stamp below certify blocks the SVG was
  // never drawn from. `composedHash` would then equal `renderHash`, `effectiveState`
  // would read 'approved', the renderer would emit no badge and `isStale` would be
  // false, so the reader kept the PRE-correction artwork permanently and only
  // `--force` ever revisited it. The sidecar is self-consistent throughout, which is
  // why no check in the repo could see it.
  //
  // ⚠️ THE RE-READ ITSELF IS CORRECT AND STAYS. `withComposedHash` MERGES into the file
  // as it now stands; a publisher handed the caller's in-memory copy would write that
  // copy back wholesale and destroy the concurrent approval outright — strictly worse
  // than the race it would close. So the fix is to REFUSE, not to stop re-reading.
  //
  // ⚠️ COMPARED AS STORED VALUES, NEVER AS A HASH RECOMPUTED FROM `blocks`. A
  // hand-written sidecar whose stored hash disagrees with its own blocks is legal here
  // (`isStale` is what re-hashes, for the composer-version case); recomputing would
  // refuse such a figure on every run for ever. `|| null` normalises the two spellings
  // of "no hash" so a legacy sidecar with neither side set still publishes.
  if (checkVintage && (sidecar.renderHash || null) !== (expectedRenderHash || null)) {
    return {
      ok: false,
      reason: 'sidecar-moved',
      message:
        `${basename} was composed from renderHash ${expectedRenderHash || '(none)'} but its ` +
        `sidecar now carries ${sidecar.renderHash || '(none)'}: it was rewritten while the ` +
        `composer was running. The SVG in out/ describes the EARLIER text, so publishing it ` +
        `would stamp a hash it was never composed from. Nothing was written; re-run to ` +
        `compose from the current blocks.`,
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

  // CONTAINMENT, BEFORE THE WRITE — see `escapesMediaDir` above, which owns the rule and which
  // figure-run.js's pre-flight asks the same question of before any money is spent.
  const target = path.resolve(bookDir, 'media', entry.outputName);
  if (escapesMediaDir(bookDir, entry.outputName)) {
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

  // Copied, never computed — see the header.
  //
  // ⚠️ CORRECTED 2026-09-07 (M5 Task 6b). This used to say a sidecar with no renderHash was
  // "the ORDINARY case". It is not any more: `tools/figure-run.js` mints every sidecar with a
  // renderHash and NO `state`, so the ordinary case is now a stamp that lands on an unapproved
  // figure — which is exactly what makes the stamp the publish-success marker the driver's
  // staleness test reads. A sidecar WITHOUT a renderHash is now the exception: hand-written, or
  // from before the driver existed. What has not changed is that `state` is irrelevant here and
  // `effectiveState` reads mt-preview until an editor approves the blocks.
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
    // ⚠️ NO `expectedRenderHash` KEY, DELIBERATELY. Here a human ran the composer by hand and
    // this process cannot know which blocks it was given; the vintage check belongs to
    // `figure-run.js`, which composed and publishes in one breath. Omitting the key is what
    // turns the check off — passing `null` would assert "it had no renderHash".
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
