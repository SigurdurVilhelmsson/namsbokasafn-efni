/**
 * §C140 ⑭ — render every translated figure SVG in Chromium, Firefox and WebKit, the way a
 * reader gets it: an SVG served as `image/svg+xml` over HTTP and loaded through `<img>`.
 *
 *   node browser-sweep.mjs --out <dir> [--engines chromium,firefox,webkit] [--book efnafraedi-2e]
 *        [--only <basename,...>] [--variant full|nofont] [--max-width 800] [--dsf 1]
 *        [--timeout-ms 90000] [--no-controls]
 *
 * WHY THIS EXISTS: until 2026-09-29 only Chromium had ever rendered a composed figure. iPads are
 * WebKit, and cairo's blend emulation references in-document elements from <feImage>, which
 * Firefox was believed (never measured) not to support. `render-check.mjs` answers "what does
 * Chromium paint"; this answers "does every engine paint the same thing", for the whole corpus.
 *
 * WHAT IT WRITES (all under --out, nothing in the repo):
 *   rows.jsonl       one row per (engine, variant, figure); LAST line is {"done":true,...}
 *   png/<engine>/<variant>/<basename>.png
 * A run is complete only if the terminal line is present. A killed run leaves no terminal line,
 * and its rows must not be read as "no difference" (CLAUDE.md: judge a run by a terminal marker,
 * never by an exit code a wrapper reports).
 *
 * OUTCOMES per row: `rendered` | `broken` (the <img> reports naturalWidth 0: the engine could not
 * parse or rasterise the SVG) | `timeout` | `error`. A figure an engine never paints is a FINDING,
 * never an absence of one.
 *
 * VARIANTS:
 *   full    the file as published.
 *   nofont  the same file with every @font-face rule removed, served on the fly. It is the
 *           control for "is the embedded font actually used in this engine?": a figure with text
 *           whose `full` and `nofont` renders are pixel-identical in some engine is drawing its
 *           labels in a fallback font there.
 *
 * CONTROLS (written into --out/controls/ and swept like figures, unless --no-controls):
 *   ctl-plain          shapes only. NEGATIVE control: every engine should paint it the same.
 *   ctl-feimage        visible content ONLY through <feImage href="#id">. POSITIVE control for
 *                      the in-document feImage question.
 *   ctl-blend-chain    cairo's own blend shape: feImage "source" + feImage "destination" + feBlend.
 *   ctl-mix-blend      the same picture drawn with CSS mix-blend-mode (a remedy candidate).
 *
 * Exit: 0 only when every engine ran to its terminal line; 1 otherwise (including a crash before
 * any verdict); 2 on a usage error. The exit code is NOT a verdict on the figures: the rows are.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

const FLAGS = new Map([
  ['--out', true],
  ['--engines', true],
  ['--book', true],
  ['--dir', true],
  ['--only', true],
  ['--variant', true],
  ['--max-width', true],
  ['--dsf', true],
  ['--timeout-ms', true],
  ['--no-controls', false],
]);
const ENGINES = ['chromium', 'firefox', 'webkit'];
const VARIANTS = ['full', 'nofont', 'notext'];

class UsageError extends Error {}

/** Strict: an unknown flag or a missing value is an error, never a silent no-op. */
export function parseCli(argv) {
  const a = {
    engines: ENGINES,
    book: 'efnafraedi-2e',
    dir: null,
    only: null,
    variant: 'full',
    maxWidth: 800,
    dsf: 1,
    timeoutMs: 90000,
    controls: true,
    out: null,
  };
  let bookGiven = false;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    const eq = tok.indexOf('=');
    const name = eq > 0 ? tok.slice(0, eq) : tok;
    if (!FLAGS.has(name)) throw new UsageError(`unknown argument ${JSON.stringify(tok)}`);
    let val = null;
    if (FLAGS.get(name)) {
      val = eq > 0 ? tok.slice(eq + 1) : argv[++i];
      if (val === undefined || val === '' || (eq < 0 && val.startsWith('--'))) {
        throw new UsageError(`${name} needs a value`);
      }
    }
    switch (name) {
      case '--out':
        a.out = path.resolve(val);
        break;
      case '--engines': {
        const es = val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const e of es) if (!ENGINES.includes(e)) throw new UsageError(`unknown engine ${e}`);
        if (!es.length) throw new UsageError('--engines is empty');
        a.engines = es;
        break;
      }
      case '--book':
        a.book = val;
        bookGiven = true;
        break;
      case '--dir':
        a.dir = path.resolve(val);
        break;
      case '--only':
        a.only = new Set(
          val
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        );
        break;
      case '--variant':
        if (!VARIANTS.includes(val)) throw new UsageError(`--variant must be one of ${VARIANTS}`);
        a.variant = val;
        break;
      case '--max-width':
        a.maxWidth = positive(name, val);
        break;
      case '--dsf':
        a.dsf = positive(name, val);
        break;
      case '--timeout-ms':
        a.timeoutMs = positive(name, val);
        break;
      case '--no-controls':
        a.controls = false;
        break;
      default:
        throw new UsageError(`unhandled ${name}`);
    }
  }
  if (!a.out) throw new UsageError('--out is required');
  if (a.dir && bookGiven) throw new UsageError('give --dir or --book, not both');
  return a;
}

function positive(name, v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new UsageError(`${name} must be a positive number`);
  return n;
}

/**
 * The first `<svg ...>` open tag, scanned respecting quoted values: a bare '>' is legal inside an
 * attribute value, so `<svg[^>]*>` could truncate it (CLAUDE.md, the TAG_ATTR_SPAN rule).
 */
export function svgOpenTag(text) {
  const start = text.search(/<svg\b/i);
  if (start < 0) return null;
  let q = null;
  for (let i = start + 4; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      continue;
    }
    if (c === '>') return text.slice(start, i + 1);
  }
  return null;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? (m[1] ?? m[2]) : null;
}

const UNIT_PX = { '': 1, px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };

function lengthPx(v) {
  if (v == null) return null;
  const m = String(v)
    .trim()
    .match(/^([0-9]*\.?[0-9]+(?:e[-+]?\d+)?)\s*(px|pt|pc|in|cm|mm)?$/i);
  if (!m) return null;
  return Number(m[1]) * UNIT_PX[(m[2] || '').toLowerCase()];
}

/** Intrinsic CSS size of an SVG from its open tag: width/height, else the viewBox. */
export function intrinsicSize(tag) {
  let w = lengthPx(attr(tag, 'width'));
  let h = lengthPx(attr(tag, 'height'));
  const vb = attr(tag, 'viewBox');
  if ((w == null || h == null) && vb) {
    const p = vb
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) {
      if (w == null && h == null) {
        w = p[2];
        h = p[3];
      } else if (w == null) w = (h * p[2]) / p[3];
      else h = (w * p[3]) / p[2];
    }
  }
  return w && h ? { w, h } : null;
}

/** Display size: intrinsic, scaled down (never up) to maxWidth, aspect kept. */
export function displaySize(size, maxWidth) {
  const k = size.w > maxWidth ? maxWidth / size.w : 1;
  return { w: size.w * k, h: size.h * k };
}

/** Remove every @font-face rule (the `nofont` control). */
export function stripFontFaces(svgText) {
  return svgText.replace(/@font-face\s*\{[^}]*\}/g, '');
}

/**
 * The composed figure WITHOUT its text layer (the `notext` variant): everything before the LAST <style>, closed.
 * svgout.write_svg appends `<style>…</style>\n<g …>…</g>\n</svg>\n` to the artwork, and this is exactly
 * figparts.split()'s contract (evidence/2026-09-17-c4-build/instruments/figparts.py). A file without that framing is
 * not a composed figure — a June figure, say — and gets null, never a guess at where its artwork ends.
 * Why it exists: engines antialias TEXT differently (Chromium colour-fringed, Firefox grayscale), and that noise
 * swamped a real artwork defect covering 0.7 % of one figure. Without the text there is no text noise.
 */
export function artworkOnly(svgText) {
  const i = svgText.lastIndexOf('<style>');
  if (i < 0) return null;
  const j = svgText.indexOf('</style>', i);
  if (j < 0) return null;
  const rest = svgText.slice(j + '</style>'.length);
  if (!rest.startsWith('\n<g') || !rest.endsWith('</g>\n</svg>\n')) return null;
  return `${svgText.slice(0, i)}</svg>\n`;
}

const CONTROLS = {
  'ctl-plain': `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
<rect x="10" y="10" width="100" height="100" fill="#1f77b4"/><circle cx="170" cy="60" r="45" fill="#ff7f0e"/>
<path d="M10 115 L230 115" stroke="#000" stroke-width="3"/></svg>`,
  'ctl-feimage': `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="240" height="120" viewBox="0 0 240 120">
<defs><g id="src"><rect x="10" y="10" width="100" height="100" fill="#d62728"/><circle cx="170" cy="60" r="45" fill="#2ca02c"/></g>
<filter id="f" x="0" y="0" width="240" height="120" filterUnits="userSpaceOnUse">
<feImage xlink:href="#src" x="0" y="0" width="240" height="120"/></filter></defs>
<rect x="0" y="0" width="240" height="120" fill="#fff" filter="url(#f)"/></svg>`,
  'ctl-blend-chain': `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="240" height="120" viewBox="0 0 240 120">
<defs><g id="dst"><rect x="0" y="0" width="240" height="120" fill="#fff"/><rect x="20" y="20" width="120" height="80" fill="#ffd700"/></g>
<g id="srcg"><circle cx="140" cy="60" r="50" fill="#1e90ff"/></g>
<filter id="blend" x="0%" y="0%" width="100%" height="100%">
<feImage xlink:href="#srcg" result="source" x="0" y="0" width="240" height="120"/>
<feImage xlink:href="#dst" result="destination" x="0" y="0" width="240" height="120"/>
<feBlend in="source" in2="destination" mode="multiply" color-interpolation-filters="sRGB"/></filter></defs>
<g filter="url(#blend)"><rect x="0" y="0" width="240" height="120" fill="#000"/></g></svg>`,
  'ctl-mix-blend': `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
<rect x="0" y="0" width="240" height="120" fill="#fff"/><rect x="20" y="20" width="120" height="80" fill="#ffd700"/>
<circle cx="140" cy="60" r="50" fill="#1e90ff" style="mix-blend-mode:multiply"/></svg>`,
};

/**
 * The figures to sweep: a book's published `*_IS.svg` (named without the suffix, as the census names them), or — with
 * --dir — every `*.svg` in a directory, named by its basename (for an A/B of two composer outputs).
 */
export function listFigures(args) {
  const media = args.dir || path.join(REPO_ROOT, 'books', args.book, 'media');
  const suffix = args.dir ? '.svg' : '_IS.svg';
  const out = [];
  for (const name of fs.readdirSync(media).sort()) {
    if (!name.endsWith(suffix)) continue;
    const basename = name.slice(0, -suffix.length);
    if (args.only && !args.only.has(basename)) continue;
    out.push({ basename, file: path.join(media, name), kind: 'figure' });
  }
  if (args.only) {
    const seen = new Set(out.map((f) => f.basename));
    const missing = [...args.only].filter((b) => !seen.has(b));
    if (missing.length) throw new UsageError(`--only names no such figure: ${missing.join(', ')}`);
  }
  return out;
}

function head(file, n = 65536) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(n);
    const got = fs.readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, got).toString('utf-8');
  } finally {
    fs.closeSync(fd);
  }
}

/** The static server: /svg/<id> (as published or font-stripped) and /host/<id> (the <img> page). */
function startServer(items, variant) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const [, kind, id] = u.pathname.split('/');
    const it = byId.get(decodeURIComponent(id || ''));
    if (!it) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (kind === 'svg') {
      let body = fs.readFileSync(it.file);
      if (variant === 'nofont') body = Buffer.from(stripFontFaces(body.toString('utf-8')), 'utf-8');
      // A control has no text layer; it is served as-is and stays the positive control of the artwork comparison.
      if (variant === 'notext' && it.kind === 'figure')
        body = Buffer.from(artworkOnly(body.toString('utf-8')), 'utf-8');
      res.writeHead(200, {
        'content-type': 'image/svg+xml',
        'content-length': body.length,
        'cache-control': 'no-store',
      });
      res.end(body);
      return;
    }
    if (kind === 'host') {
      const { w, h } = it.display;
      const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}
img{display:block;width:${w}px;height:${h}px}</style><img id="f" src="/svg/${encodeURIComponent(it.id)}">`;
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(html);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function loadPlaywright() {
  const candidates = [
    path.join(REPO_ROOT, 'node_modules', 'playwright', 'index.mjs'),
    path.join(REPO_ROOT, 'server', 'node_modules', 'playwright', 'index.mjs'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return import(pathToFileURL(c).href);
  throw new Error(`playwright is not installed; looked for:\n  ${candidates.join('\n  ')}`);
}

function withTimeout(p, ms, what) {
  let t;
  return Promise.race([
    p,
    new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`TIMEOUT ${what} after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(t));
}

async function renderOne(page, base, it, args) {
  const clip = { x: 0, y: 0, width: Math.ceil(it.display.w), height: Math.ceil(it.display.h) };
  await page.setViewportSize({
    width: Math.max(clip.width, 16),
    height: Math.max(clip.height, 16),
  });
  await page.goto(`${base}/host/${encodeURIComponent(it.id)}`, {
    waitUntil: 'load',
    timeout: args.timeoutMs,
  });
  const st = await page.evaluate(async () => {
    const i = document.getElementById('f');
    let decodeErr = null;
    try {
      await i.decode();
    } catch (e) {
      decodeErr = String(e);
    }
    return { nw: i.naturalWidth, nh: i.naturalHeight, complete: i.complete, decodeErr };
  });
  let prev = await page.screenshot({ clip, timeout: args.timeoutMs });
  let stable = false;
  let iters = 1;
  for (; iters < 8; iters++) {
    await page.waitForTimeout(250);
    const cur = await page.screenshot({ clip, timeout: args.timeoutMs });
    if (cur.equals(prev)) {
      stable = true;
      break;
    }
    prev = cur;
  }
  return { st, png: prev, stable, iters };
}

async function sweepEngine(pw, engine, items, base, args, emit) {
  const outPng = path.join(args.out, 'png', engine, args.variant);
  fs.mkdirSync(outPng, { recursive: true });
  let browser = null;
  let page = null;
  const fresh = async () => {
    if (browser) await withTimeout(browser.close(), 20000, 'close').catch(() => {});
    browser = await pw[engine].launch();
    const ctx = await browser.newContext({ deviceScaleFactor: args.dsf });
    page = await ctx.newPage();
  };
  await fresh();
  const version = browser.version();
  let n = 0;
  for (const it of items) {
    const t0 = Date.now();
    const row = {
      engine,
      version,
      variant: args.variant,
      dsf: args.dsf,
      id: it.id,
      kind: it.kind,
      bytes: it.bytes,
      w: it.display.w,
      h: it.display.h,
    };
    try {
      const r = await withTimeout(renderOne(page, base, it, args), args.timeoutMs * 2, it.id);
      const png = path.join(outPng, `${it.id}.png`);
      fs.writeFileSync(png, r.png);
      Object.assign(row, {
        status: r.st.nw > 0 && !r.st.decodeErr ? 'rendered' : 'broken',
        nw: r.st.nw,
        nh: r.st.nh,
        decodeErr: r.st.decodeErr,
        stable: r.stable,
        iters: r.iters,
        png,
      });
    } catch (e) {
      row.status = /TIMEOUT/.test(String(e)) ? 'timeout' : 'error';
      row.error = String(e.message || e)
        .split('\n')[0]
        .slice(0, 300);
      // A page stuck in paint can wedge the whole browser: start again from a fresh process.
      try {
        await fresh();
      } catch (e2) {
        row.relaunchError = String(e2).slice(0, 200);
      }
    }
    row.ms = Date.now() - t0;
    emit(row);
    n++;
    if (n % 50 === 0) console.log(`  ${engine}: ${n}/${items.length}`);
  }
  await withTimeout(browser.close(), 20000, 'close').catch(() => {});
  return { engine, version, n };
}

export async function main(argv) {
  // Failure default: a run that never reaches its verdict must not exit 0 (CLAUDE.md, the
  // never-settling promise rule). Set HERE, not at module level: importing this file (its tests
  // do) must not change the importing process's exit code.
  process.exitCode = 1;
  let args;
  try {
    args = parseCli(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`browser-sweep: ${e.message}`);
      process.exitCode = 2;
      return;
    }
    throw e;
  }
  fs.mkdirSync(args.out, { recursive: true });
  const items = [];
  if (args.controls) {
    const cdir = path.join(args.out, 'controls');
    fs.mkdirSync(cdir, { recursive: true });
    for (const [id, svg] of Object.entries(CONTROLS)) {
      const file = path.join(cdir, `${id}.svg`);
      fs.writeFileSync(file, svg);
      items.push({ id, file, kind: 'control' });
    }
  }
  for (const f of listFigures(args)) items.push({ id: f.basename, file: f.file, kind: 'figure' });
  const skipped = [];
  const unframed = [];
  for (const it of items) {
    it.bytes = fs.statSync(it.file).size;
    const tag = svgOpenTag(head(it.file));
    const size = tag && intrinsicSize(tag);
    if (!size) {
      skipped.push(it.id);
      continue;
    }
    // notext only exists for a composed figure; a June figure has no composer text layer to remove, and is recorded as
    // `no-framing` rather than rendered whole under a variant name that would misdescribe it.
    if (
      args.variant === 'notext' &&
      it.kind === 'figure' &&
      artworkOnly(fs.readFileSync(it.file, 'utf-8')) === null
    ) {
      unframed.push(it.id);
      continue;
    }
    it.display = displaySize(size, args.maxWidth);
  }
  const usable = items.filter((it) => it.display).sort((a, b) => a.bytes - b.bytes);
  const rowsPath = path.join(args.out, `rows.${args.variant}.jsonl`);
  const fd = fs.openSync(rowsPath, 'a');
  const emit = (row) => fs.writeSync(fd, `${JSON.stringify(row)}\n`);
  for (const id of skipped) emit({ id, status: 'no-size', variant: args.variant });
  for (const id of unframed) emit({ id, status: 'no-framing', variant: args.variant });
  const pw = await loadPlaywright();
  const server = await startServer(usable, args.variant);
  const base = `http://127.0.0.1:${server.address().port}`;
  const done = [];
  try {
    for (const engine of args.engines) {
      console.log(`${engine}: ${usable.length} item(s), variant ${args.variant}`);
      done.push(await sweepEngine(pw, engine, usable, base, args, emit));
    }
  } finally {
    server.close();
  }
  emit({
    done: true,
    engines: done,
    variant: args.variant,
    items: usable.length,
    skippedNoSize: skipped.length,
  });
  fs.closeSync(fd);
  console.log(`done: ${rowsPath}`);
  process.exitCode = 0;
}

/* c8 ignore start -- CLI wiring */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`browser-sweep: ${e.stack || e}`);
    process.exitCode = 1;
  });
}
/* c8 ignore stop */
