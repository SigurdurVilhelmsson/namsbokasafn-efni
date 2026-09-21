#!/usr/bin/env node
/**
 * PreToolUse(Bash) guard — refuse shell commands that would WRITE into
 * `books/*​/01-source/`.
 *
 * Why this exists, and why the permission rule is not enough:
 * `permissions.deny` in .claude/settings.json covers the Edit/Write tools. It
 * does not see `sed -i`, a heredoc redirect, `cp`, or `git checkout --`, and
 * this repo's sessions are routinely instructed to change files that way. The
 * deny rule and this hook are two halves of one guard; neither is a guard
 * alone.
 *
 * What is being protected: `books/*​/01-source/` holds the legally
 * load-bearing OpenStax CNXML. The licence governing each copy is the one in
 * force on the date it was obtained, and OpenStax has since relicensed several
 * books CC BY -> CC BY-NC-SA. Replacing those bytes is one-way and hard to
 * detect. See CLAUDE.md, "Never overwrite local OpenStax CNXML from upstream
 * without double written consent".
 *
 * Contract: reads the PreToolUse payload on stdin, exits 2 to block with a
 * reason on stderr, exits 0 to allow.
 *
 * Deliberately FAIL-OPEN on unparseable input. A guard that blocks every
 * command the moment its input shape changes is a guard someone switches off.
 * It fails CLOSED only on the shapes it actually recognises.
 *
 * Known blind spots — this narrows the accident, it does not make the write
 * impossible:
 *   - a path built in a shell variable (`cp "$f" "$DEST"`)
 *   - a script that writes there itself (`node tools/whatever.js`)
 *   - `git checkout -- .` at the repo root, which names no path
 * The three-step written-consent rule in CLAUDE.md governs the DELIBERATE act
 * and is unconditional; this only stops the careless one.
 */

const SOURCE = '01-source';
const WRITERS = /^(cp|mv|rsync|install|ln)$/;
const REMOVERS = /^(rm|rmdir|shred|truncate|unlink)$/;
const GIT_WRITES = /^(checkout|restore|clean|apply|stash)$/;

/** Split a command line into rough segments so a read on one side of a pipe
 *  is not confused with a write on the other. */
function segments(command) {
  return command.split(/\s*(?:\|\||&&|[;|&\n])\s*/).filter(Boolean);
}

/** Tokens, with surrounding quotes stripped. Good enough for path sniffing. */
function tokens(segment) {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) =>
    t.replace(/^['"]|['"]$/g, '')
  );
}

const hits = (s) => s.includes(SOURCE);

/** @returns {string|null} the reason to block, or null to allow. */
function inspect(segment) {
  const tok = tokens(segment);
  const words = tok.filter((t) => !t.startsWith('-'));
  const cmd = (words[0] || '').split('/').pop();

  // A redirect whose TARGET is in 01-source. Checking the target rather than
  // the whole segment keeps `grep -r books/*/01-source > /tmp/out` allowed.
  for (const m of segment.matchAll(/>>?\|?\s*("[^"]*"|'[^']*'|[^\s|;&<>]+)/g)) {
    const target = m[1].replace(/^['"]|['"]$/g, '');
    if (hits(target)) return `redirects output into ${SOURCE}/ (${target})`;
  }

  if (!hits(segment)) return null;

  // sed -i rewrites its file arguments in place.
  if (cmd === 'sed' && tok.some((t) => /^-[a-zA-Z]*i/.test(t))) {
    return 'sed -i rewrites its file arguments in place';
  }

  if (cmd === 'tee') return 'tee writes to its file arguments';

  // cp/mv/rsync: only the DESTINATION matters. Copying OUT of 01-source (to
  // make a backup, say) is legitimate and stays allowed.
  if (WRITERS.test(cmd)) {
    const dest = words[words.length - 1] || '';
    if (hits(dest)) return `${cmd} would write into ${SOURCE}/ (${dest})`;
  }

  if (REMOVERS.test(cmd)) return `${cmd} would destroy files under ${SOURCE}/`;

  if (cmd === 'git' && GIT_WRITES.test(words[1] || '')) {
    return `git ${words[1]} would overwrite the working copy under ${SOURCE}/`;
  }

  if (cmd === 'curl' || cmd === 'wget') {
    const i = tok.findIndex((t) => /^(-o|-O|--output|--output-document)$/.test(t));
    if (i !== -1 && hits(tok[i + 1] || '')) {
      return `${cmd} would download over a file in ${SOURCE}/`;
    }
  }

  if (cmd === 'tar' && tok.some((t) => /^(-.*x|--extract|--get)/.test(t))) {
    return `tar extraction would write into ${SOURCE}/`;
  }
  if (cmd === 'unzip') return `unzip would write into ${SOURCE}/`;

  if (cmd === 'dd' && tok.some((t) => t.startsWith('of=') && hits(t))) {
    return `dd would overwrite a file in ${SOURCE}/`;
  }

  return null;
}

function verdict(command) {
  for (const segment of segments(command)) {
    const reason = inspect(segment);
    if (reason) return reason;
  }
  return null;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  let command;
  try {
    command = JSON.parse(raw)?.tool_input?.command;
  } catch {
    return; // fail open: not a payload shape we understand
  }
  if (typeof command !== 'string') return;

  const reason = verdict(command);
  if (!reason) return;

  process.stderr.write(
    `BLOCKED by .claude/hooks/guard-01-source.mjs: ${reason}.\n` +
      `books/*/01-source/ holds the irrevocable CC BY OpenStax copies; ` +
      `replacing them is one-way. See CLAUDE.md, "Never overwrite local ` +
      `OpenStax CNXML from upstream without double written consent" — a ` +
      `deliberate overwrite needs TWO separate written confirmations from ` +
      `the user, not a retry.\n`
  );
  process.exitCode = 2;
}

// Exported for the test harness; `main` only runs as a CLI.
export { verdict };

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  await main();
}
