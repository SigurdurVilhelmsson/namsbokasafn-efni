import { describe, it, expect } from 'vitest';
import { verdict } from '../../.claude/hooks/guard-01-source.mjs';

/**
 * Pin for the PreToolUse Bash guard that refuses writes into
 * `books/*​/01-source/` (.claude/hooks/guard-01-source.mjs).
 *
 * Why this test exists: from 2026-01-04 until 2026-09-20 this repo's
 * `.claude/settings.json` declared `books/**​/01-source/**` unwritable using
 * `never_write` — a key Claude Code has no schema for. Unknown keys are
 * accepted and ignored, so the guard over the irrevocable CC BY copies looked
 * correct for nine months and never ran once. The replacement is a real
 * `permissions.deny` rule plus this Bash-side hook, and the lesson is that a
 * guard nobody exercises is indistinguishable from one that works.
 *
 * 🔴 THE ALLOW CASES ARE NOT PADDING. A guard that refuses everything
 * containing the string `01-source` would pass every BLOCK case below while
 * making the tree unreadable — `grep`, `cat`, `diff` and a backup `cp` OUT of
 * the source tree all have to keep working. Each block case is paired with an
 * allow control of similar shape, so a mutant that blocks unconditionally goes
 * red here rather than green.
 *
 * Note `.claude/**` is in vitest's `exclude`, so the test lives here and
 * imports across; `exclude` governs discovery, not imports.
 */

const SRC = 'books/efnafraedi-2e/01-source/ch01/m68663.cnxml';

const BLOCKED = [
  ['truncating redirect', `echo x > ${SRC}`],
  ['appending redirect', `cat new.cnxml >> ${SRC}`],
  ['sed -i', `sed -i 's/a/b/' ${SRC}`],
  ['sed -i with a suffix', `sed -i.bak 's/a/b/' ${SRC}`],
  ['tee', `echo x | tee ${SRC}`],
  ['cp into the tree', `cp /tmp/fresh.cnxml ${SRC}`],
  ['mv into the tree', `mv /tmp/fresh.cnxml ${SRC}`],
  ['rsync into the tree', 'rsync -a upstream/ books/efnafraedi-2e/01-source/'],
  ['rm', `rm -f ${SRC}`],
  ['git checkout --', `git checkout -- ${SRC}`],
  ['git restore', `git restore ${SRC}`],
  ['curl -o', `curl -o ${SRC} https://openstax.org/x.cnxml`],
  ['wget -O', `wget -O ${SRC} https://openstax.org/x.cnxml`],
  ['tar extraction', 'tar -xzf osx.tgz -C books/efnafraedi-2e/01-source/'],
  ['unzip', 'unzip osx.zip -d books/efnafraedi-2e/01-source/'],
  ['dd of=', `dd if=/tmp/x of=${SRC}`],
  ['a write hidden after a harmless read', `grep -c para ${SRC} && sed -i 's/a/b/' ${SRC}`],
];

const ALLOWED = [
  ['grep', `grep -c '<para' ${SRC}`],
  ['cat into a pipe', `cat ${SRC} | head -20`],
  [
    'a read whose OUTPUT is redirected elsewhere',
    `grep -rl para books/efnafraedi-2e/01-source/ > /tmp/out.txt`,
  ],
  ['cp OUT of the tree, i.e. a backup', `cp ${SRC} /tmp/backup.cnxml`],
  ['diff against another tree', `diff ${SRC} books/efnafraedi-2e/03-faithful-translation/x.cnxml`],
  [
    'the extractor, which reads 01-source legitimately',
    'node tools/cnxml-extract.js --book efnafraedi-2e --chapter 1',
  ],
  ['sed -i on a WRITE-permitted tree', "sed -i 's/a/b/' books/efnafraedi-2e/05-publication/x.html"],
  ['a redirect outside the repo', 'echo x > /tmp/scratch.txt'],
  ['rm on a WRITE-permitted tree', 'rm -f books/efnafraedi-2e/05-publication/x.html'],
  ['a command naming no path', 'git status --porcelain'],
  ['xmllint', `xmllint --noout ${SRC}`],
];

describe('01-source PreToolUse guard — refuses writes', () => {
  it.each(BLOCKED)('blocks %s', (_label, command) => {
    expect(verdict(command)).toBeTruthy();
  });
});

describe('01-source PreToolUse guard — controls that must stay allowed', () => {
  it.each(ALLOWED)('allows %s', (_label, command) => {
    expect(verdict(command)).toBeNull();
  });
});

describe('01-source PreToolUse guard — the reason is actionable', () => {
  it('names the mechanism, not just the path', () => {
    expect(verdict(`sed -i 's/a/b/' ${SRC}`)).toMatch(/sed -i/);
  });
});
