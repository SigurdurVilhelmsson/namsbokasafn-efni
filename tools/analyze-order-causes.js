#!/usr/bin/env node

/**
 * analyze-order-causes.js — Diagnostic (NOT a gate).
 *
 * For each module, build fresh inject output in memory and compare element
 * document-order to source (compareElementOrder). Classify every out-of-order
 * ("moved") id by its SOURCE element tag, so the residual reorders are bucketed
 * by cause (equation / term / media / note / table / figure / para / …).
 *
 * Read-only, in-memory. Writes nothing under books/.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSegments, formatSegmentsMarkdown } from './cnxml-extract.js';
import { buildCnxml, parseSegments } from './cnxml-inject.js';
import { compareElementOrder } from './cnxml-fidelity-check.js';
import {
  parseArgs,
  BOOK_OPTION,
  CHAPTER_OPTION,
  MODULE_OPTION,
  requireBook,
} from './lib/parseArgs.js';

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Map each moved id to the source element tag carrying it.
 * @param {string} sourceCnxml
 * @param {string[]} movedIds
 * @returns {{ counts: Record<string, number>, unresolved: string[] }}
 */
export function classifyMovedIds(sourceCnxml, movedIds) {
  const counts = {};
  const unresolved = [];
  for (const id of movedIds) {
    // Match the opening tag whose id attribute is exactly this id.
    // (?<![\w-]) ensures `id="` is a real attribute, NOT the tail of
    // `target-id="` (the CNXML xref attribute) — a plain \b would match there
    // because `-` is a non-word char, misattributing xref'd elements to `link`.
    const re = new RegExp(`<([\\w:-]+)\\b[^>]*(?<![\\w-])id="${escapeRegExp(id)}"`);
    const m = sourceCnxml.match(re);
    if (m) {
      const tag = m[1];
      counts[tag] = (counts[tag] || 0) + 1;
    } else {
      unresolved.push(id);
    }
  }
  return { counts, unresolved };
}

/**
 * Fresh-build one module in memory and classify its element-order drift vs source.
 * @param {string} sourceCnxml
 * @returns {{ moved: string[], counts: Record<string, number>, unresolved: string[] }}
 */
export function analyzeModuleOrder(sourceCnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(sourceCnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  const { cnxml: fresh } = buildCnxml(structure, parsed, equations, sourceCnxml, {}, inlineAttrs);
  const order = compareElementOrder(sourceCnxml, fresh);
  const { counts, unresolved } = classifyMovedIds(sourceCnxml, order.moved);
  return { moved: order.moved, counts, unresolved };
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function discoverChapters(bookDir) {
  const srcRoot = path.join(bookDir, '01-source');
  if (!fs.existsSync(srcRoot)) return [];
  return fs
    .readdirSync(srcRoot)
    .filter((d) => /^ch\d+$/.test(d) || d === 'appendices')
    .sort((a, b) =>
      a === 'appendices'
        ? 1
        : b === 'appendices'
          ? -1
          : a.localeCompare(b, undefined, { numeric: true })
    );
}

function discoverModules(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^m\d+\.cnxml$/.test(f))
    .sort()
    .map((f) => ({ moduleId: f.replace('.cnxml', ''), filename: f }));
}

function main() {
  const args = parseArgs(process.argv.slice(2), [
    BOOK_OPTION,
    CHAPTER_OPTION,
    MODULE_OPTION,
    { name: 'json', flags: ['--json'], type: 'boolean', default: false },
  ]);
  requireBook(args);
  const bookDir = path.join(REPO_ROOT, 'books', args.book);

  const fmtCh = (c) => (c === 'appendices' ? 'appendices' : `ch${String(c).padStart(2, '0')}`);
  const chapters = args.chapter ? [fmtCh(args.chapter)] : discoverChapters(bookDir);

  const perCause = {}; // tag -> { modules: Set, movedIds: number }
  const perModule = []; // { moduleId, moved, counts, unresolved }
  const cleanModules = [];
  const unresolvedAll = [];

  for (const ch of chapters) {
    const srcDir = path.join(bookDir, '01-source', ch);
    let modules = discoverModules(srcDir);
    if (args.module) modules = modules.filter((m) => m.moduleId === args.module);
    for (const mod of modules) {
      const source = fs.readFileSync(path.join(srcDir, mod.filename), 'utf8');
      let res;
      try {
        res = analyzeModuleOrder(source);
      } catch (err) {
        console.error(`ERROR building ${mod.moduleId}: ${err.message}`);
        process.exit(2);
      }
      if (res.moved.length === 0) {
        cleanModules.push(mod.moduleId);
        continue;
      }
      perModule.push({
        moduleId: mod.moduleId,
        moved: res.moved.length,
        counts: res.counts,
        unresolved: res.unresolved,
      });
      for (const [tag, n] of Object.entries(res.counts)) {
        perCause[tag] = perCause[tag] || { modules: new Set(), movedIds: 0 };
        perCause[tag].modules.add(mod.moduleId);
        perCause[tag].movedIds += n;
      }
      if (res.unresolved.length)
        unresolvedAll.push({ moduleId: mod.moduleId, ids: res.unresolved });
    }
  }

  const causeRows = Object.entries(perCause)
    .map(([tag, v]) => ({ tag, modules: v.modules.size, movedIds: v.movedIds }))
    .sort((a, b) => b.movedIds - a.movedIds);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          book: args.book,
          cleanModuleCount: cleanModules.length,
          causeRows,
          perModule,
          unresolved: unresolvedAll,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`\nOrder-cause breakdown — ${args.book} (fresh in-memory build)\n${'═'.repeat(56)}`);
  console.log(`Clean modules (moved=0): ${cleanModules.length}`);
  console.log(`Modules with residual reorder: ${perModule.length}\n`);
  console.log(`Cause (element tag)      | modules | moved ids`);
  console.log(`-------------------------|---------|----------`);
  for (const r of causeRows) {
    console.log(
      `${r.tag.padEnd(24)} | ${String(r.modules).padStart(7)} | ${String(r.movedIds).padStart(8)}`
    );
  }
  if (unresolvedAll.length) {
    console.log(`\nUNRESOLVED ids (tag not found in source) — investigate:`);
    for (const u of unresolvedAll) console.log(`  ${u.moduleId}: ${u.ids.join(', ')}`);
  }
  console.log(`\nPer-module (residual only):`);
  for (const m of perModule.sort((a, b) => b.moved - a.moved)) {
    const by = Object.entries(m.counts)
      .map(([t, n]) => `${t}:${n}`)
      .join(' ');
    console.log(`  ${m.moduleId.padEnd(8)} moved=${String(m.moved).padStart(3)}  ${by}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
