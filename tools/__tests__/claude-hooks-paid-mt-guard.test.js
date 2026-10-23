import { describe, it, expect } from 'vitest';
import { inspect } from '../../.claude/hooks/guard-paid-mt.mjs';

/**
 * Pin for the PreToolUse guard that forces a confirmation before a PAID
 * Málstaður run (.claude/hooks/guard-paid-mt.mjs).
 *
 * Why the hook exists at all — MEASURED 2026-09-20: a `permissions.ask` entry
 * for `Bash(node tools/api-translate.js:*)` does NOT prompt in this repo,
 * because `.claude/settings.local.json` allowlists the broad `Bash(node:*)`
 * and that allow outranks the ask. A `deny` on the identical command in the
 * identical file DID block, so the file is read and the syntax is right; `ask`
 * simply loses. A PreToolUse hook returning `permissionDecision: "ask"` does
 * not lose, which is why the guard is a hook rather than a rule.
 *
 * ⚠ THE FREE CASES ARE THE LOAD-BEARING HALF. `--dry-run` is how anyone sizes
 * a buy before making it, and `--help` is how they check a flag. A guard that
 * prompts on those gets switched off, and then nothing guards the paid path.
 *
 * Staleness reporting is deliberately NOT asserted here: it reads mtimes off
 * the working tree, so any expectation would pass or fail on when the checkout
 * happened rather than on the code. It was measured against the real corpus
 * instead — a recently re-extracted chapter read 0 of N, and a chapter that
 * had not been re-extracted since the extractor changed read N of N. No
 * chapter number is recorded here on purpose: one of the chapters used in
 * that measurement was re-extracted eleven minutes later and flipped from
 * stale to fresh, which is exactly how a comment becomes a false premise.
 */

describe('paid-MT guard — commands that must NOT prompt', () => {
  it('stays silent on --dry-run, the way a buy is sized', () => {
    expect(inspect('node tools/api-translate.js --book efnafraedi-2e --dry-run')).toBeNull();
  });

  it('stays silent on the -n short form', () => {
    expect(inspect('node tools/api-translate.js --book efnafraedi-2e -n')).toBeNull();
  });

  it('stays silent on --help', () => {
    expect(inspect('node tools/api-translate.js --help')).toBeNull();
  });

  it('stays out of the way of the free extractor', () => {
    expect(inspect('node tools/cnxml-extract.js --book efnafraedi-2e --chapter 1')).toBeNull();
  });

  it('stays out of the way of unrelated commands', () => {
    expect(inspect('git status --porcelain')).toBeNull();
  });

  // 2026-10-23: reading the tool's SOURCE prompted as if it were a paid run.
  // [USER] got repeated cost warnings while sessions and agents only read the
  // file (git show of an old revision, grep, sed). Nothing ran, nothing was
  // spent. A false alarm on a read erodes the prompt the same way one on
  // --dry-run would (see the header), so reads stay silent.
  it('stays silent when an old revision of the tool is read with git show', () => {
    expect(
      inspect('git show 7658de896:tools/api-translate.js > /tmp/x/api-translate-old.js')
    ).toBeNull();
  });

  it('stays silent when the tool is grepped', () => {
    expect(inspect('grep -an "function formatGlossary" tools/api-translate.js')).toBeNull();
  });

  it('stays silent when the tool is printed or counted', () => {
    expect(
      inspect("sed -n '1,40p' tools/api-translate.js && wc -l tools/translate-chapter-titles.js")
    ).toBeNull();
  });

  it('stays silent when the tool is printed with no flag at all', () => {
    expect(inspect('cat tools/api-translate.js | head -40')).toBeNull();
  });
});

describe('paid-MT guard — commands that must prompt', () => {
  it('prompts on a real chapter buy', () => {
    expect(inspect('node tools/api-translate.js --book efnafraedi-2e --chapter 7')).toBeTruthy();
  });

  it('says plainly that money is involved', () => {
    expect(inspect('node tools/api-translate.js --book efnafraedi-2e --chapter 7')).toMatch(
      /spends money/
    );
  });

  it('prompts on the chapter-titles tool, which is also paid', () => {
    expect(inspect('node tools/translate-chapter-titles.js efnafraedi-2e')).toBeTruthy();
  });

  it('calls out --force, which overwrites committed MT', () => {
    expect(inspect('node tools/api-translate.js --book efnafraedi-2e --chapter 7 --force')).toMatch(
      /--force/
    );
  });

  it('names the scope it judged, so the warning is checkable', () => {
    expect(inspect('node tools/api-translate.js --book efnafraedi-2e --chapter 7')).toMatch(
      /02-for-mt\/ch07/
    );
  });

  // The narrowing above must not open the paid path. Every shape a real run
  // takes in this repo's sessions and drivers still prompts.
  it('prompts on a run after cd', () => {
    expect(
      inspect('cd /home/u/repo && node tools/api-translate.js --book efnafraedi-2e --chapter 7')
    ).toBeTruthy();
  });

  it('prompts on a run with an environment prefix', () => {
    expect(
      inspect('MALSTADUR_API_KEY=k node tools/api-translate.js --book efnafraedi-2e --chapter 7')
    ).toBeTruthy();
  });

  it('prompts on a run by absolute path under timeout', () => {
    expect(
      inspect(
        'timeout 600 node /home/u/repo/tools/api-translate.js --book efnafraedi-2e --chapter 7'
      )
    ).toBeTruthy();
  });

  it('prompts on a run with node flags before the path', () => {
    expect(
      inspect('node --env-file=.env tools/api-translate.js --book efnafraedi-2e --chapter 7')
    ).toBeTruthy();
  });

  // 2026-10-23, found while adding the read cases: the free-flag test looked at
  // the WHOLE command line, so a -n or -h belonging to another program in the
  // pipeline (tail -n, grep -n, du -h) made a paid run read as a dry run, and
  // it went through with no prompt. Only the tool's own arguments count.
  it('prompts on a paid run piped through tail -n', () => {
    expect(
      inspect('node tools/api-translate.js --book efnafraedi-2e --chapter 7 2>&1 | tail -n 20')
    ).toBeTruthy();
  });

  it('prompts on a paid run followed by a command with -h', () => {
    expect(
      inspect('node tools/api-translate.js --book efnafraedi-2e --chapter 7 && du -h books')
    ).toBeTruthy();
  });

  it('still stays silent on a dry run piped through tail -n', () => {
    expect(
      inspect('node tools/api-translate.js --book efnafraedi-2e --dry-run | tail -n 5')
    ).toBeNull();
  });

  it('prompts on a node script that loads the tool, to stay on the safe side', () => {
    expect(
      inspect('node -e "import(\'./tools/api-translate.js\').then((m) => m.main())"')
    ).toBeTruthy();
  });
});

// 2026-10-23, a security review of the read fix above: staying silent unless a
// runtime WORD appeared was an allowlist of the ways to run the tool, so every
// way it did not list ran with no prompt (a path-qualified node, bash -c, a
// runtime it had no name for). The guard now fails closed: it stays silent only
// when every command in the line is a known read, or is the tool itself called
// with a flag that tool really implements.
describe('paid-MT guard — runs it must not miss (fail closed)', () => {
  it('prompts on a run by a path-qualified node', () => {
    expect(
      inspect('/usr/bin/node tools/api-translate.js --book efnafraedi-2e --chapter 7')
    ).toBeTruthy();
  });

  it('prompts on a run by an nvm node path', () => {
    expect(
      inspect(
        '/home/u/.nvm/versions/node/v22.12.0/bin/node tools/api-translate.js --book efnafraedi-2e --chapter 7'
      )
    ).toBeTruthy();
  });

  it('prompts on a run inside bash -c', () => {
    expect(
      inspect('bash -c "node tools/api-translate.js --book efnafraedi-2e --chapter 7"')
    ).toBeTruthy();
  });

  it('prompts on a runtime the guard has no name for', () => {
    expect(inspect('tsx tools/api-translate.js --book efnafraedi-2e --chapter 7')).toBeTruthy();
  });

  it('prompts when a dry run is followed by a paid run', () => {
    expect(
      inspect(
        'node tools/api-translate.js --book efnafraedi-2e --dry-run && node tools/api-translate.js --book efnafraedi-2e --chapter 7'
      )
    ).toBeTruthy();
  });

  it('prompts on a run from inside tools/', () => {
    expect(
      inspect('cd tools && node api-translate.js --book efnafraedi-2e --chapter 7')
    ).toBeTruthy();
  });

  it('prompts when a copied revision is run in the same command', () => {
    expect(
      inspect(
        'git show 7658de896:tools/api-translate.js > /tmp/x/old.js && node /tmp/x/old.js --book efnafraedi-2e --chapter 7'
      )
    ).toBeTruthy();
  });

  it('prompts when the source is piped into a runtime', () => {
    expect(inspect('cat tools/api-translate.js | node --input-type=module')).toBeTruthy();
  });

  // A substitution runs its own command, inside double quotes too, so the
  // echo around it is not what decides.
  it('prompts on a run inside a quoted command substitution', () => {
    expect(
      inspect('echo "$(node tools/api-translate.js --book efnafraedi-2e --chapter 7)"')
    ).toBeTruthy();
  });

  // Only the tool's own arguments count: nice's -n is not a dry run.
  it('prompts when a wrapper before the tool has a flag that looks free', () => {
    expect(
      inspect('nice -n 10 node tools/api-translate.js --book efnafraedi-2e --chapter 7')
    ).toBeTruthy();
  });

  // git -p forces the pager, so GIT_PAGER runs even with no terminal attached.
  it('prompts when an environment value runs the tool', () => {
    expect(
      inspect(
        "GIT_PAGER='node tools/api-translate.js --book efnafraedi-2e --chapter 7' git -p log -1"
      )
    ).toBeTruthy();
  });

  it('prompts on a git subcommand that runs a command', () => {
    expect(
      inspect('git bisect run node tools/api-translate.js --book efnafraedi-2e --chapter 7')
    ).toBeTruthy();
  });

  // translate-chapter-titles does not use parseArgs. It reads
  // process.argv.includes('--dry-run') and nothing else, so -n and --help are
  // ignored and the run is paid. Only a flag the tool implements counts.
  it('prompts on chapter titles with -n, which that tool ignores', () => {
    expect(inspect('node tools/translate-chapter-titles.js efnafraedi-2e -n')).toBeTruthy();
  });

  it('prompts on chapter titles with --help, which that tool ignores', () => {
    expect(inspect('node tools/translate-chapter-titles.js efnafraedi-2e --help')).toBeTruthy();
  });
});

describe('paid-MT guard — reads that stay silent under fail-closed matching', () => {
  it('stays silent on a grep whose pattern holds a quoted pipe', () => {
    expect(
      inspect("grep -nE 'formatGlossary|filterGlossaryForText' tools/api-translate.js")
    ).toBeNull();
  });

  it('stays silent on a read with an environment prefix', () => {
    expect(inspect('LC_ALL=C grep -c fetch tools/api-translate.js')).toBeNull();
  });

  it('stays silent on a git diff piped to head', () => {
    expect(inspect('git diff main -- tools/api-translate.js | head -50')).toBeNull();
  });

  it('stays silent on a read that redirects stderr', () => {
    expect(inspect('grep -n fetch tools/api-translate.js 2>&1 | head -5')).toBeNull();
  });

  it('stays silent on a prettier check of the tool', () => {
    expect(inspect('npx prettier --check tools/api-translate.js')).toBeNull();
  });

  it('stays silent on a read inside an if', () => {
    expect(inspect('if grep -q dryRun tools/api-translate.js; then echo found; fi')).toBeNull();
  });

  it('stays silent on chapter titles with --dry-run, which that tool implements', () => {
    expect(inspect('node tools/translate-chapter-titles.js efnafraedi-2e --dry-run')).toBeNull();
  });

  it('stays silent on a dry run under timeout', () => {
    expect(
      inspect('timeout 600 node tools/api-translate.js --book efnafraedi-2e --dry-run')
    ).toBeNull();
  });
});
