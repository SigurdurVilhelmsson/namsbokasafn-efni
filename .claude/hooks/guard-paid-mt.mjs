#!/usr/bin/env node
/**
 * PreToolUse(Bash) guard — force a confirmation before a PAID Málstaður run,
 * and say whether the English it is about to buy is stale.
 *
 * Why a hook and not a permission rule. MEASURED 2026-09-20: a
 * `permissions.ask` entry for `Bash(node tools/api-translate.js:*)` in the
 * project settings does NOT prompt, because `.claude/settings.local.json`
 * allowlists the broad `Bash(node:*)` and that allow outranks the ask. The
 * same command under a `deny` entry in the same file WAS blocked, so the file
 * is read and the rule syntax is right — `ask` simply loses to a higher-
 * precedence `allow`. A PreToolUse hook does not lose: it returns
 * `permissionDecision: "ask"` and the prompt appears regardless.
 *
 * What it checks beyond cost. CLAUDE.md, "api-translate --force ALONE CANNOT
 * REPAIR AN EXTRACTION DEFECT, AND IT REPORTS SUCCESS": api-translate reads
 * its English from the GENERATED `02-for-mt/`, never from `01-source`, and it
 * spawns no extractor. So after any fix that changes what extraction emits, a
 * bare `--force` re-translates the OLD English, reproduces the defect exactly,
 * and exits 0. Comparing `02-for-mt` against `01-source` cannot see that —
 * `01-source` is read-only and never moves. The signal that does is the
 * EXTRACTOR's own mtime: if the tooling is newer than the English it produced,
 * re-extract before spending.
 *
 * It never blocks outright. Buying a chapter is the point of this repo; the
 * hook asks, and reports what it knows, so the decision is made with the
 * staleness in view rather than after the invoice.
 *
 * `--dry-run` and `--help` cost nothing and pass straight through.
 */

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const PAID_TOOLS = /tools\/(api-translate|translate-chapter-titles)\.js\b/;
const FREE_FLAGS = /(^|\s)(--dry-run|-n|--help|-h)(\s|$)/;

const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd();

/**
 * Newest mtime across the extractor's own TRANSITIVE import graph.
 *
 * MEASURED 2026-09-20: taking the max over all of `tools/lib` instead marked
 * a freshly re-extracted chapter as stale, because an unrelated file edited
 * that morning (`chapter-term-plan.js`, part of the pre-buy term scan) set the
 * maximum. A dependency the extractor never loads cannot make its output
 * stale, and a check that says otherwise gets ignored within a week. Following
 * the imports keeps the set correct as the code moves, with no list to update.
 */
function extractorMtime() {
  const entry = join(repo, 'tools/cnxml-extract.js');
  const seen = new Set();
  let newest = 0;

  const visit = (file) => {
    if (seen.has(file) || seen.size > 200) return;
    seen.add(file);

    let src;
    try {
      src = readFileSync(file, 'utf8');
      newest = Math.max(newest, statSync(file).mtimeMs);
    } catch {
      return;
    }

    // Relative imports only — node builtins and node_modules cannot go stale
    // in a way a re-extraction would fix.
    for (const m of src.matchAll(/(?:from|import|require)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
      visit(resolve(dirname(file), m[1]));
    }
  };

  visit(entry);
  return newest;
}

/**
 * How much of the generated English in scope predates the extractor.
 *
 * Deliberately a COUNT WITH ITS DENOMINATOR, not an oldest-file verdict. This
 * corpus is of mixed vintage on purpose, so "the oldest file in the book is
 * older than the extractor" is true essentially always and would make the
 * warning permanent — an alarm that fires every time is one you stop reading.
 * Scoped to the chapter or module actually being bought, "N of M" is a fact a
 * person can act on.
 */
function stalenessInScope(book, chapter, module, tool) {
  let root = join(repo, 'books', book, '02-for-mt');
  if (chapter) {
    const dir = /^\d+$/.test(chapter) ? `ch${String(chapter).padStart(2, '0')}` : chapter;
    root = join(root, dir);
  }

  let stale = 0;
  let total = 0;
  const oldest = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('-segments.en.md')) {
        if (module && !e.name.startsWith(module)) continue;
        try {
          total += 1;
          if (statSync(p).mtimeMs < tool) {
            stale += 1;
            if (oldest.length < 3) oldest.push(e.name);
          }
        } catch {
          /* skip */
        }
      }
    }
  };
  walk(root);
  return { stale, total, oldest };
}

const flag = (command, name) => {
  const m = command.match(new RegExp(`--${name}[=\\s]+(\\S+)`));
  return m ? m[1] : null;
};

/** @returns {string|null} the reason to ask, or null to stay out of the way. */
export function inspect(command) {
  if (!PAID_TOOLS.test(command)) return null;
  if (FREE_FLAGS.test(command)) return null;

  const book = flag(command, 'book') || 'efnafraedi-2e';
  const chapter = flag(command, 'chapter');
  const module = flag(command, 'module');
  const scope = `books/${book}/02-for-mt${chapter ? `/ch${String(chapter).padStart(2, '0')}` : ''}${module ? ` (${module})` : ''}`;

  const parts = [
    `This spends money: ${command.includes('translate-chapter-titles') ? 'translate-chapter-titles' : 'api-translate'} calls the paid Málstaður API.`,
  ];

  const tool = extractorMtime();
  const { stale, total, oldest } = stalenessInScope(book, chapter, module, tool);

  if (!tool) {
    // Could not read the extractor at all — almost certainly a wrong repo root.
    // Saying "0 of N predate" here would be a fail-open to the REASSURING
    // answer: nothing can predate a timestamp of zero, so a broken check would
    // read as a clean bill of health. Report the incapacity instead.
    parts.push(
      `⚠ FRESHNESS UNKNOWN: could not read tools/cnxml-extract.js under ${repo}, ` +
        `so staleness was not checked at all — this is not a clean result. ` +
        `Re-extract before buying, or fix CLAUDE_PROJECT_DIR.`
    );
  } else if (total === 0) {
    parts.push(`No generated English found in ${scope} — re-extract first, or this buys nothing.`);
  } else if (stale > 0) {
    parts.push(
      `⚠ STALE ENGLISH: ${stale} of ${total} segment file(s) in ${scope} predate the extractor ` +
        `(e.g. ${oldest.join(', ')}). api-translate reads 02-for-mt, never 01-source, and spawns ` +
        `no extractor — so this may re-translate old English, reproduce an already-fixed defect, ` +
        `and exit 0. Re-extract before buying.`
    );
  } else {
    parts.push(`Freshness: 0 of ${total} segment file(s) in ${scope} predate the extractor.`);
  }

  if (/(^|\s)--force(\s|$)/.test(command)) {
    parts.push(
      `--force is set: it overwrites committed MT. Check whether a human hand-repaired 02-mt-output first.`
    );
  }

  return parts.join(' ');
}

async function main() {
  let command;
  try {
    command = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command;
  } catch {
    return; // fail open on an unrecognised payload
  }
  if (typeof command !== 'string') return;

  const reason = inspect(command);
  if (!reason) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: reason,
      },
    })
  );
}

if (process.argv[1]?.endsWith('guard-paid-mt.mjs')) await main();
