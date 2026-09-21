#!/usr/bin/env node
/**
 * SubagentStart / SubagentStop — report what a subagent CHANGED in the working
 * tree, the moment it goes quiet.
 *
 * Why: CLAUDE.md prescribes running `git status --porcelain` the moment any
 * agent that mutates files goes quiet — dead, finished, or merely silent. A
 * dead agent returns no exit code, no report and no notification, and because
 * a stranded mutation is UNCOMMITTED, `HEAD` still looks clean. Two mutants
 * have been stranded in this repo that way. This is the only detector that
 * fires, and it costs one git call.
 *
 * Why a DELTA and not a plain status: this tree is routinely dirty mid-run
 * (77 paths while this was written — a content run in flight). Printing the
 * whole status after every subagent trains you to ignore it, which is worse
 * than not having it. So SubagentStart snapshots the tree and SubagentStop
 * reports only what is new or changed since.
 *
 * It never blocks and never judges: it cannot tell a stranded mutant from
 * legitimate work. It puts the paths in front of a human, who can.
 *
 * Exit code is always 0. When there is something to say it prints
 * {"systemMessage": ...} on stdout, which is how a non-tool hook surfaces text.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_LINES = 25;

const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function porcelain() {
  return execFileSync('git', ['-C', repo, 'status', '--porcelain'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

/** Snapshot path is keyed per session so two sessions cannot clobber one
 *  another. Concurrent subagents WITHIN one session share it: the delta then
 *  reads as "since the most recent subagent started", which is fuzzier but
 *  never worse than reporting the whole tree. */
const snapshotFor = (sessionId) =>
  join(tmpdir(), `cc-subagent-tree-${String(sessionId || 'nosession').replace(/[^\w-]/g, '')}.txt`);

function say(message) {
  process.stdout.write(JSON.stringify({ systemMessage: message }));
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return; // fail open on an input shape we do not understand
  }

  const event = payload?.hook_event_name;
  const snapshot = snapshotFor(payload?.session_id);

  let now;
  try {
    now = porcelain();
  } catch {
    return; // not a git checkout, or git unavailable — nothing to say
  }

  if (event === 'SubagentStart') {
    try {
      writeFileSync(snapshot, now);
    } catch {
      /* a missing baseline is reported at Stop, not here */
    }
    return;
  }

  let before;
  try {
    before = readFileSync(snapshot, 'utf8');
  } catch {
    // No baseline. Saying nothing here would make silence mean two different
    // things — "nothing changed" and "could not tell" — which is the failure
    // this repo calls an incapable instrument's null. So say which one it is.
    const dirty = now.split('\n').filter(Boolean).length;
    if (dirty) {
      say(
        `Subagent finished. No tree baseline was taken, so its changes cannot be ` +
          `isolated; ${dirty} path(s) are currently dirty. Run \`git status --porcelain\` ` +
          `before trusting any verdict it produced.`
      );
    }
    return;
  }

  try {
    unlinkSync(snapshot);
  } catch {
    /* best effort */
  }

  const seen = new Set(before.split('\n').filter(Boolean));
  const changed = now.split('\n').filter((l) => l && !seen.has(l));

  if (!changed.length) return;

  const shown = changed.slice(0, MAX_LINES).join('\n');
  const more = changed.length > MAX_LINES ? `\n… and ${changed.length - MAX_LINES} more` : '';
  say(
    `Subagent touched ${changed.length} path(s) in the working tree:\n${shown}${more}\n` +
      `If the agent died or went silent, check these before trusting its report — ` +
      `an uncommitted mutation leaves HEAD looking clean.`
  );
}

main();
