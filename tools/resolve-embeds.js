#!/usr/bin/env node
/**
 * resolve-embeds.js
 *
 * Producer of `books/<book>/embed-mapping.json`, consumed by cnxml-render.js.
 * Scans a book's 01-source CNXML for <iframe src="...openstax.org/l/..."> embeds,
 * follows each redirect to its embeddable final URL (the /l/ redirector itself
 * sends X-Frame-Options: DENY, so the original src cannot be framed), and records
 * the resolved URL + framing status. This is the ONLY networked pipeline step;
 * extract/inject/render stay offline and read the committed mapping.
 *
 * Usage: node tools/resolve-embeds.js --book <slug> [--dry-run] [--verbose]
 */
import fs from 'fs';
import path from 'path';
import { parseArgs, BOOK_OPTION, requireBook } from './lib/parseArgs.js';
import { resolveEmbeds } from './lib/embed-resolve.js';

const DRY_RUN_OPTION = { name: 'dryRun', flags: ['--dry-run'], type: 'boolean', default: false };
const VERBOSE_OPTION = { name: 'verbose', flags: ['--verbose'], type: 'boolean', default: false };

const IFRAME_SRC = /<iframe\b[^>]*\bsrc="([^"]+)"/g;

function collectSrcs(sourceDir) {
  const srcs = new Set();
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) walk(p);
      else if (name.endsWith('.cnxml')) {
        const text = fs.readFileSync(p, 'utf8');
        let m;
        IFRAME_SRC.lastIndex = 0;
        while ((m = IFRAME_SRC.exec(text)) !== null) srcs.add(m[1]);
      }
    }
  };
  walk(sourceDir);
  return [...srcs].sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2), [BOOK_OPTION, DRY_RUN_OPTION, VERBOSE_OPTION]);
  requireBook(args);
  const bookDir = path.join('books', args.book);
  const sourceDir = path.join(bookDir, '01-source');
  const srcs = collectSrcs(sourceDir);
  console.log(`Found ${srcs.length} distinct iframe src(s) in ${args.book}`);

  const mapping = await resolveEmbeds(srcs);

  const blocked = Object.entries(mapping).filter(([, v]) => v.status !== 'ok');
  if (blocked.length) {
    console.error(`WARNING: ${blocked.length} embed(s) did not resolve to a framable target:`);
    for (const [src, v] of blocked) console.error(`  [${v.status}] ${src}`);
  }
  if (args.verbose) {
    for (const [src, v] of Object.entries(mapping))
      console.log(`  ${src} -> ${v.resolved} (${v.kind}, ${v.status})`);
  }

  const outPath = path.join(bookDir, 'embed-mapping.json');
  if (args.dryRun) {
    console.log(JSON.stringify(mapping, null, 2));
    console.log('(dry-run: nothing written)');
    return;
  }
  fs.writeFileSync(outPath, JSON.stringify(mapping, null, 2) + '\n');
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
