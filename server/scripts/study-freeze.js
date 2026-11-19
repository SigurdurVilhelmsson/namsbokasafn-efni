/**
 * study-freeze (G1.7, step 1): the freeze of the study book's MT layer.
 * Spec: docs/superpowers/specs/2026-11-19-g17-freeze-and-mt-lock-design.md (§6.3, anti-goals §4).
 *
 * Run it as a FILE (`node server/scripts/study-freeze.js <command> ...`), never piped.
 *
 * Subcommands:
 *   markers [--write]   write the content-free freeze marker to every study unit (dry run without
 *                       --write). Refuses the whole run, writing nothing, when any unit already
 *                       holds a marker that is not the freeze marker (it may hold a person's
 *                       first-save time) or has no MT file. Output names units and counts only,
 *                       never a marker body.
 *   manifest            (a later task) write the freeze manifest.
 *   check               (a later task) verify the tree against the manifest.
 *
 * Flags: --book <slug> (a study book; default the only one), --write, --tag <name>,
 * --supersedes <tag>, --manifest <dir>. Any other flag is a usage error.
 */
const fs = require('fs');
const segmentParser = require('../services/segmentParser');
const { listStudyUnits } = require('../lib/studyUnits');
const { STUDY_BOOKS } = require('../lib/researchScope');
const { freezeLockState, writeFreezeLock } = require('../../tools/lib/mt-lock.cjs');

const COMMANDS = ['markers', 'manifest', 'check'];
const VALUE_FLAGS = {
  '--book': 'book',
  '--tag': 'tag',
  '--supersedes': 'supersedes',
  '--manifest': 'manifest',
};

function usage(message) {
  return Object.assign(new Error(message), { code: 'USAGE' });
}

/**
 * @param {string[]} argv the arguments after the script path
 * @returns {{command: string, book: string, write: boolean, tag: string|null,
 *   supersedes: string|null, manifest: string|null}}
 */
function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command)) {
    throw usage(`unknown or missing command (expected one of ${COMMANDS.join(', ')})`);
  }
  const args = { command, book: null, write: false, tag: null, supersedes: null, manifest: null };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === '--write') args.write = true;
    else if (VALUE_FLAGS[flag]) {
      const value = rest[++i];
      if (value === undefined || value.startsWith('--')) throw usage(`${flag} needs a value`);
      args[VALUE_FLAGS[flag]] = value;
    } else throw usage(`unknown argument: ${flag}`);
  }
  if (args.book === null) {
    if (STUDY_BOOKS.length !== 1) throw usage('--book is required');
    args.book = STUDY_BOOKS[0];
  } else if (!STUDY_BOOKS.includes(args.book)) {
    throw usage(`--book must be a study book (${STUDY_BOOKS.join(', ')})`);
  }
  return args;
}

/**
 * Classify every study unit's marker. Reads only; names units, never marker bodies.
 * @param {{book: string}} args
 */
function planMarkers({ book }) {
  const units = listStudyUnits({ book, booksDir: segmentParser.BOOKS_DIR }).map((u) => ({
    ...u,
    state: freezeLockState(u.mtOutput),
    hasMt: fs.existsSync(u.mtOutput),
  }));
  const refusals = [];
  for (const u of units) {
    if (u.state === 'foreign') refusals.push({ unit: u.unit, reason: 'foreign-marker' });
    if (!u.hasMt) refusals.push({ unit: u.unit, reason: 'no-mt-file' });
  }
  return { units, refusals };
}

/** Write the freeze marker to every unit. Throws code REFUSED, before any write, on a refusal. */
function writeMarkers(plan) {
  if (plan.refusals.length > 0) {
    throw Object.assign(new Error('refused: nothing written'), { code: 'REFUSED' });
  }
  let written = 0;
  let already = 0;
  for (const u of plan.units) {
    if (writeFreezeLock(u.mtOutput) === 'written') written++;
    else already++;
  }
  return { written, already, total: plan.units.length };
}

/** @returns {number} 0 on success, 1 on a refusal, a failure or a usage error */
function main(argv, io = { log: console.log, error: console.error }) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    if (e.code !== 'USAGE') throw e;
    io.error(`usage error: ${e.message}`);
    return 1;
  }
  if (args.command !== 'markers') {
    io.error(`usage error: ${args.command} is not implemented yet`);
    return 1;
  }
  const plan = planMarkers(args);
  if (plan.refusals.length > 0) {
    for (const r of plan.refusals) io.error(`refused: ${r.unit} (${r.reason})`);
    io.error('nothing written');
    return 1;
  }
  if (!args.write) {
    const absent = plan.units.filter((u) => u.state === 'absent').length;
    io.log(`dry run: ${absent} of ${plan.units.length} units to lock (pass --write to write)`);
    return 0;
  }
  const r = writeMarkers(plan);
  io.log(`written ${r.written}, already ${r.already}, total ${r.total}`);
  return 0;
}

// A file run sets require.main; a stdin run (`node -`) does not, and must still execute.
const runDirectly = require.main === module || (module.id === '[stdin]' && process.argv[1] === '-');
if (runDirectly) {
  process.exitCode = 1; // a failure default: a run that dies before main() returns is never 0
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { parseArgs, planMarkers, writeMarkers, main };
