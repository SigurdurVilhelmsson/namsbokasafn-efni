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
 * Reads of the tool's source, and calls with a free flag the tool really
 * implements (`--dry-run`; also `--help` for api-translate), pass straight
 * through. Everything else that names a paid tool asks — see READ_COMMANDS.
 */

import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

/**
 * A paid tool mentioned anywhere in some text: `<name>.js` after a path or a
 * quote, or the bare `tools/<name>`. MEASURED on Node 22: `node dir/tool` runs
 * dir/tool.js, so the bare form is a run too. (api-translate's main guard
 * compares argv[1] with its own path and does not fire for it, but
 * translate-chapter-titles has no guard and runs.) A bare `<name>` outside
 * tools/ is not matched, because `npx vitest run api-translate` is a test
 * filter.
 */
const PAID_TOOL =
  /(?:^|[\s/'"=:])(api-translate|translate-chapter-titles)\.js\b|(?:^|[\s/'"=:])tools\/(api-translate|translate-chapter-titles)(?![\w.-])/;

/** One de-quoted word that IS a path to a paid tool, in the same two forms. */
const TOOL_PATH =
  /^(?:.*[/=:])?(api-translate|translate-chapter-titles)\.js$|^(?:.*\/)?tools\/(api-translate|translate-chapter-titles)$/;

const TOOL_NAMES = ['api-translate', 'translate-chapter-titles'];

/** npx options that load a file as code (a config, plugin, parser or formatter). */
const LOADS_CODE =
  /^(-c|--config|--plugin|--rulesdir|--resolve-plugins-relative-to|--parser|-f|--format|-r|--require|--loader|--import)(=|$)/;

/**
 * The flags each tool REALLY implements as free. Not one shared list: a flag a
 * tool does not read is a no-op (CLAUDE.md, "parseArgs SILENTLY DROPS UNKNOWN
 * FLAGS"), and the run then goes ahead at full strength. api-translate declares
 * --dry-run/-n in its spec and gets -h/--help from parseArgs' shared option.
 * translate-chapter-titles does not use parseArgs: it checks
 * process.argv.includes('--dry-run') and nothing else.
 */
const FREE_FLAGS = {
  'api-translate': new Set(['--dry-run', '-n', '--help', '-h']),
  'translate-chapter-titles': new Set(['--dry-run']),
};

/**
 * What the guard counts as a READ: a command that cannot run the tool.
 *
 * MEASURED 2026-10-23, twice. First, reads of the tool's source (git show,
 * grep, sed) prompted as paid runs, and [USER] got repeated cost warnings while
 * nothing was spent. The fix for that stayed silent unless a runtime word
 * (node, npx, bun, deno) appeared, and a security review then showed the flaw:
 * that was a list of the ways to RUN, so every way it left out (/usr/bin/node,
 * an nvm path, bash -c, tsx) ran with no prompt at all.
 *
 * So the guard fails closed. It stays silent only when every command in the
 * line is on this list of reads, or is the tool itself called with one of its
 * free flags. Anything else is assumed able to run the tool.
 *
 * The threat is an accidental paid run by a session or an agent, not an
 * adversary. sed and awk therefore count as reads, although each can start a
 * process (sed's `e`, awk's system()): no accidental read takes that shape.
 */
const READ_COMMANDS = new Set([
  'cat',
  'tac',
  'grep',
  'egrep',
  'fgrep',
  'rg',
  'ugrep',
  'sed',
  'awk',
  'gawk',
  'head',
  'tail',
  'wc',
  'less',
  'more',
  'diff',
  'cmp',
  'comm',
  'ls',
  'stat',
  'file',
  'du',
  'md5sum',
  'sha1sum',
  'sha256sum',
  'cut',
  'sort',
  'uniq',
  'tr',
  'nl',
  'od',
  'hexdump',
  'xxd',
  'strings',
  'tee',
  'basename',
  'dirname',
  'realpath',
  'readlink',
  'cd',
  'pushd',
  'popd',
  'echo',
  'printf',
  'true',
  'false',
  'test',
  '[',
  '[[',
  ':',
  'mkdir',
  'cp',
  'codegraph',
]);

/** git subcommands that run nothing. `bisect run`, `-c` and aliases can, so they are left out. */
const GIT_READS = new Set([
  'show',
  'diff',
  'log',
  'grep',
  'blame',
  'cat-file',
  'ls-files',
  'ls-tree',
  'status',
  'add',
  'commit',
  'restore',
  'checkout',
  'stash',
  'mv',
  'rm',
  'rev-parse',
  'shortlog',
]);

/** What npx may start without running the tool: a formatter or a linter reads it. */
const NPX_READS = new Set(['prettier', 'eslint']);

/** Shell words before a command that run nothing themselves. */
const SHELL_PREFIX = new Set([
  'if',
  'then',
  'else',
  'elif',
  'do',
  'while',
  'until',
  'time',
  '!',
  '{',
  '}',
]);

/** Shell words that close or open a construct and are not a command. */
const SHELL_STRUCTURE = new Set(['fi', 'done', 'esac', 'for', 'select', 'case']);

/**
 * Split a command line into simple commands: at unquoted ; & | ( ) and
 * newlines, and at $( ` <( >( even inside double quotes, because a
 * substitution runs a command of its own. Quote-aware, so `grep -E 'a|b'`
 * stays whole, and `2>&1` / `&>` are redirections, not separators. An
 * unquoted `#` that starts a word begins a comment, which is dropped: a flag
 * written in one is not an argument (`… --chapter 7 # not a --dry-run`).
 *
 * It errs towards cutting. A bad cut puts a stray word at the head of a piece,
 * a stray word is not a read, and that only ever adds a prompt.
 */
function commandsIn(line) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const next = line[i + 1];
    if (quote === "'") {
      cur += c;
      if (c === "'") quote = null;
      continue;
    }
    if (c === '\\') {
      cur += c + (next ?? '');
      i += 1;
      continue;
    }
    if (c === '`' || ((c === '$' || c === '<' || c === '>') && next === '(')) {
      out.push(cur);
      cur = '';
      if (c !== '`') i += 1;
      continue;
    }
    if (quote === '"') {
      cur += c;
      if (c === '"') quote = null;
      continue;
    }
    if (c === '#' && (cur === '' || /\s$/.test(cur))) {
      const newline = line.indexOf('\n', i);
      i = (newline < 0 ? line.length : newline) - 1;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
      continue;
    }
    const redirect = c === '&' && (line[i - 1] === '>' || line[i - 1] === '<' || next === '>');
    if (!redirect && ';&|()\n'.includes(c)) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * The words of one simple command, quotes and backslashes removed, each with
 * `glob` set when it holds an UNQUOTED * ? or [ (one the shell expands).
 * `find -name '*.js'` passes its pattern on, so a quoted glob is not one.
 */
function tokens(piece) {
  const out = [];
  let cur = '';
  let glob = false;
  let quote = null;
  let started = false;
  for (let i = 0; i < piece.length; i++) {
    const c = piece[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      started = true;
    } else if (c === '\\') {
      cur += piece[i + 1] ?? '';
      i += 1;
      started = true;
    } else if (/\s/.test(c)) {
      if (started) out.push({ text: cur, glob });
      cur = '';
      glob = false;
      started = false;
    } else {
      if ('*?['.includes(c)) glob = true;
      cur += c;
      started = true;
    }
  }
  if (started) out.push({ text: cur, glob });
  return out;
}

const words = (piece) => tokens(piece).map((t) => t.text);

/** One path segment of a shell glob as a regex: * and ? stop at '/'. */
function segmentGlob(segment) {
  let re = '';
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[' && segment.indexOf(']', i + 1) > i + 1) {
      const end = segment.indexOf(']', i + 1);
      const body = segment
        .slice(i + 1, end)
        .replace(/^!/, '^')
        .replace(/\\/g, '\\\\');
      re += `[${body}]`;
      i = end;
    } else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/**
 * Could the shell expand this glob word to a paid tool? Its last segment must
 * fit a tool's file name, and the segment above it (if any) must fit `tools`.
 * A glob the guard cannot read is assumed to fit.
 */
function globNamesTool(word) {
  const parts = word.split('/');
  const base = parts.pop();
  const dir = parts.filter(Boolean).pop();
  try {
    const baseRe = segmentGlob(base);
    const underTools = dir !== undefined && segmentGlob(dir).test('tools');
    if (dir !== undefined && !underTools) return false;
    return TOOL_NAMES.some((n) => baseRe.test(`${n}.js`) || (underTools && baseRe.test(n)));
  } catch {
    return true;
  }
}

/** Does this simple command name a paid tool, however the shell will spell it? */
function namesTool(piece) {
  if (PAID_TOOL.test(piece)) return true;
  return tokens(piece).some(
    (t) => TOOL_PATH.test(t.text) || PAID_TOOL.test(t.text) || (t.glob && globNamesTool(t.text))
  );
}

function gitIsRead(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-C') {
      i += 1;
      continue;
    }
    if (['--no-pager', '-P', '--paginate', '-p', '--no-optional-locks'].includes(a)) continue;
    if (a.startsWith('--git-dir=') || a.startsWith('--work-tree=')) continue;
    // The first other word is the subcommand. `-c` and unknown options land
    // here too, and fail closed.
    return GIT_READS.has(a);
  }
  return false;
}

/** Can this simple command run the tool? Fails closed: unknown means yes. */
function isRead(piece) {
  const w = words(piece);
  let i = 0;
  for (; i < w.length; i++) {
    if (SHELL_PREFIX.has(w[i])) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[i])) {
      // A value that names the tool may run it (GIT_PAGER, LESSOPEN).
      if (PAID_TOOL.test(w[i])) return false;
      continue;
    }
    break;
  }
  if (i >= w.length) return true; // only keywords and assignments
  const cmd = w[i].split('/').pop();
  const rest = w.slice(i + 1);
  if (SHELL_STRUCTURE.has(cmd) || READ_COMMANDS.has(cmd)) return true;
  if (cmd === 'git') return gitIsRead(rest);
  if (cmd === 'npx') {
    // A config or plugin is loaded as code, so `-c <tool>` runs the tool.
    if (rest.some((a) => LOADS_CODE.test(a))) return false;
    return NPX_READS.has(rest.find((a) => !a.startsWith('-')));
  }
  return false;
}

/**
 * Is this simple command the tool itself, called with a flag it implements as
 * free? Read from the de-quoted words, so the flag must be a word of its own
 * after the tool's path. A glob is never a free call: the shell decides what
 * it names.
 */
function isFreeCall(piece) {
  const w = tokens(piece);
  const k = w.findIndex((t) => !t.glob && TOOL_PATH.test(t.text));
  if (k < 0) return false;
  const m = w[k].text.match(TOOL_PATH);
  const tool = m[1] || m[2];
  return w.slice(k + 1).some((t) => FREE_FLAGS[tool].has(t.text));
}

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
  const pieces = commandsIn(command);
  if (!pieces.some(namesTool)) return null;
  // Every simple command must be shown harmless. One that is neither a read
  // nor a free call of the tool may be a paid run: the tool itself, a copy of
  // it written earlier in the line, or its source piped into a runtime.
  const mayPay = pieces.some((piece) => !isRead(piece) && !isFreeCall(piece));
  if (!mayPay) return null;

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
