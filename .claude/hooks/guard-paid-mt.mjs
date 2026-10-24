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
import { join, dirname, resolve, posix } from 'node:path';

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

/** After `cd tools`, a bare name runs the tool too. */
const BARE_TOOL = /^(?:\.\/)?(api-translate|translate-chapter-titles)(?:\.js)?$/;

/** Every mention in some text, for counting. */
const PAID_TOOL_ALL = new RegExp(PAID_TOOL.source, 'g');

const TOOL_NAMES = ['api-translate', 'translate-chapter-titles'];

/**
 * The only npx forms that count as reads: the formatter or the linter, with
 * options from these sets and file paths after them. Anything else fails
 * closed, so an option that loads a file as code (a config, a plugin or plugin
 * directory, a parser, a formatter) is never taken for a read. Per tool,
 * because one letter differs: prettier's -c is --check, eslint's is --config.
 */
const NPX_READ_FORMS = {
  prettier: new Set(['--check', '-c', '--write', '-w', '--list-different', '-l']),
  eslint: new Set(['--fix', '--quiet', '--cache', '--no-cache']),
};
const NPX_OWN_OPTIONS = new Set(['--yes', '-y', '--no']);

/**
 * Options that make the program run code other than the script named after
 * them: node's -e/-p/-r/--import/--loader, and a shell's -c.
 */
const RUNS_OTHER_CODE =
  /^(-c|-e|--eval|-p|--print|-r|--require|--import|--loader|--experimental-loader)(=|$)/;

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
 * Out of scope for the same reason: a tool name built from a variable or by
 * `eval`, a name split by quotes inside a nested `bash -c` string, an alias or
 * function defined earlier in the session, options clustered on one flag
 * before the tool (`node -pe`), code injected through NODE_OPTIONS, and a
 * POSIX class inside a bracket glob (`[[:alpha:]]`). Four security reviews
 * (2026-10-23/24) found constructed shapes past each version. The first three
 * rounds closed every one, because each cost a few lines. From the fourth, a
 * constructed shape is listed here instead, unless it shows the code
 * contradicting its own comments.
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
 * `glob` set when it holds an UNQUOTED * ? or [, and `brace` when it holds an
 * unquoted {: the ones the shell expands. `find -name '*.js'` passes its
 * pattern on, so a quoted glob is not one.
 */
function tokens(piece) {
  const out = [];
  let cur = '';
  let glob = false;
  let brace = false;
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
      if (started) out.push({ text: cur, glob, brace });
      cur = '';
      glob = false;
      brace = false;
      started = false;
    } else {
      if ('*?['.includes(c)) glob = true;
      if (c === '{') brace = true;
      cur += c;
      started = true;
    }
  }
  if (started) out.push({ text: cur, glob, brace });
  return out;
}

/**
 * The words a brace expansion produces: `tools/{a,b}.js` is two words.
 * Comma lists, nested or not. A sequence `{1..9}` is read as `*`, and past 64
 * words a `*` stands for the rest. Both only widen what is matched, because
 * namesTool glob-tests any expansion that holds a `*`.
 */
function expandBraces(word, cap = 64) {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < word.length; i++) {
    if (word[i] === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (word[i] === '}' && depth > 0) {
      depth -= 1;
      if (depth > 0) continue;
      const body = word.slice(start + 1, i);
      const parts = [];
      let level = 0;
      let from = 0;
      for (let j = 0; j < body.length; j++) {
        if (body[j] === '{') level += 1;
        else if (body[j] === '}') level -= 1;
        else if (body[j] === ',' && level === 0) {
          parts.push(body.slice(from, j));
          from = j + 1;
        }
      }
      parts.push(body.slice(from));
      const pre = word.slice(0, start);
      const post = word.slice(i + 1);
      if (parts.length === 1 && !body.includes('..')) continue; // `{x}` is literal
      const options = parts.length > 1 ? parts : ['*'];
      const out = [];
      for (const option of options) {
        for (const w of expandBraces(pre + option + post, cap)) {
          out.push(w);
          if (out.length >= cap) return [...out, '*'];
        }
      }
      return out;
    }
  }
  return [word];
}

const words = (piece) => tokens(piece).map((t) => t.text);

/** One path segment of a shell glob as a regex: * and ? stop at '/'. */
function segmentGlob(segment) {
  let re = '';
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') {
      // As in bash, a ] first in the set (after any ! or ^) is a member.
      let j = i + 1;
      if (segment[j] === '!' || segment[j] === '^') j += 1;
      if (segment[j] === ']') j += 1;
      const end = segment.indexOf(']', j);
      if (end < 0) {
        re += '\\[';
        continue;
      }
      const body = segment
        .slice(i + 1, end)
        .replace(/^[!^]/, '^')
        .replace(/[\\\]]/g, '\\$&');
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
  const parts = posix.normalize(word).split('/');
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

/**
 * Does this simple command name a paid tool, however the shell will spell it?
 * `inTools` is true when an earlier piece has done `cd tools`.
 */
function namesTool(piece, inTools = false) {
  if (PAID_TOOL.test(piece)) return true;
  return tokens(piece).some((t) =>
    (t.brace ? expandBraces(t.text) : [t.text]).some(
      (text) =>
        TOOL_PATH.test(text) ||
        PAID_TOOL.test(text) ||
        (inTools && BARE_TOOL.test(text)) ||
        ((t.glob || (t.brace && /[*?[]/.test(text))) && globNamesTool(text))
    )
  );
}

/** The command word of a simple command, past shell keywords and assignments. */
function commandOf(piece) {
  const w = words(piece);
  let i = 0;
  let assignmentNamesTool = false;
  for (; i < w.length; i++) {
    if (SHELL_PREFIX.has(w[i])) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[i])) {
      if (PAID_TOOL.test(w[i])) assignmentNamesTool = true;
      continue;
    }
    break;
  }
  const cmd = i < w.length ? w[i].split('/').pop() : null;
  return { cmd, rest: w.slice(i + 1), assignmentNamesTool };
}

/** For `cd`/`pushd`: does it move into a directory named tools? null if not a cd. */
function movesIntoTools(piece) {
  const { cmd, rest } = commandOf(piece);
  if (cmd !== 'cd' && cmd !== 'pushd') return null;
  const target = rest.find((a) => !a.startsWith('-'));
  return Boolean(target) && posix.basename(posix.normalize(target)) === 'tools';
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
  const { cmd, rest, assignmentNamesTool } = commandOf(piece);
  // A value that names the tool may run it (GIT_PAGER, LESSOPEN).
  if (assignmentNamesTool) return false;
  if (cmd === null) return true; // only keywords and assignments
  if (cmd === '[[') {
    // [[ evaluates -eq/-lt/... operands as arithmetic, and a subscript there
    // runs a command substitution even inside single quotes.
    return !/(^|\s)-(eq|ne|lt|le|gt|ge)(\s|$)/.test(piece) && !/\$\(|`/.test(piece);
  }
  if (SHELL_STRUCTURE.has(cmd) || READ_COMMANDS.has(cmd)) return true;
  if (cmd === 'git') return gitIsRead(rest);
  if (cmd === 'npx') {
    let j = 0;
    while (j < rest.length && NPX_OWN_OPTIONS.has(rest[j])) j += 1;
    if (!Object.hasOwn(NPX_READ_FORMS, rest[j])) return false;
    const allowed = NPX_READ_FORMS[rest[j]];
    return rest.slice(j + 1).every((a) => !a.startsWith('-') || allowed.has(a));
  }
  return false;
}

/**
 * Is this simple command the tool itself, called with a flag it implements as
 * free? Read from the de-quoted words, so the flag must be a word of its own
 * after the tool's path. Never free when the shell decides what a word names
 * (a glob or a brace), when the piece names two tools, or when the program is
 * told to run other code first (node -e, -r, --import ...; a shell's -c).
 */
function isFreeCall(piece, inTools = false) {
  if ((piece.match(PAID_TOOL_ALL) || []).length > 1) return false;
  const w = tokens(piece);
  const isTool = (t) =>
    !t.glob && !t.brace && (TOOL_PATH.test(t.text) || (inTools && BARE_TOOL.test(t.text)));
  const k = w.findIndex(isTool);
  if (k < 0) return false;
  if (w.slice(0, k).some((t) => RUNS_OTHER_CODE.test(t.text))) return false;
  const m = w[k].text.match(TOOL_PATH) || w[k].text.match(BARE_TOOL);
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
  // Each piece is read in the directory the pieces before it moved into, so a
  // bare name after `cd tools` counts as the tool.
  let inTools = false;
  const pieces = commandsIn(command).map((piece) => {
    const here = { piece, inTools };
    const moved = movesIntoTools(piece);
    if (moved !== null) inTools = moved;
    return here;
  });
  if (!pieces.some((p) => namesTool(p.piece, p.inTools))) return null;
  // Every simple command must be shown harmless. One that is neither a read
  // nor a free call of the tool may be a paid run: the tool itself, a copy of
  // it written earlier in the line, or its source piped into a runtime.
  const mayPay = pieces.some((p) => !isRead(p.piece) && !isFreeCall(p.piece, p.inTools));
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
