#!/usr/bin/env node
/**
 * research-paper-consent.js — records a consent decision or a withdrawal made on paper (G1.1 +
 * G1.2 spec §5.14, §5.1, §6 item 18; PR4 decisions 14 and 18–21).
 *
 * Usage:
 *   node server/scripts/research-paper-consent.js --user <users.id>
 *     (--decision consented|declined --text-version <v> | --withdraw) [--write]
 *   Dry run unless --write: it reports what it would record and writes nothing.
 *
 * THE TEXT (decision 19; spec ✏️ AMENDED 2026-11-04): a paper decision names the CURRENT approved
 * consent text, the one the route records against, so a paper consent cannot start an interval on
 * a text the tool no longer serves.
 *
 * THE TIME (decision 20; spec ✏️ AMENDED 2026-11-04): a paper decision, or a paper withdrawal, is
 * recorded at the time it is recorded, not the date on the paper. Capture stops when a withdrawal
 * is recorded (§6 item 18) and the capture gate measures an interval from its start, so a
 * back-dated start would admit replayed acts from before the recording. The paper itself is the
 * record of when it was signed.
 *
 * THE RESEARCH FILE ABSENT (decision 21): a consent is refused before any write (its key could not
 * be minted). A withdrawal, or a decline during a live interval, lives in sessions.db and is
 * recorded anyway, so capture stops the day it is told; its immediate deletion is skipped, the
 * interval stays due, research-withdrawal.js deletes its rows once a file is back, and this script
 * exits 1.
 *
 * A withdrawal, or a decline during a live interval (§5.14: declining while consented is a
 * withdrawal), deletes the interval's research rows at once, as the routes do (decision 14).
 *
 * It names no forbidden table (§5.22; decision 18): it records only through the consent service,
 * which owns the interval rule. No activity row and no log line carries the decision. It prints the
 * user's id and display name so the administrator can confirm whom the paper names.
 *
 * Exit codes: 0 done or a clean dry run; 1 refused, or the research file absent; 2 usage.
 * process.exitCode only, never process.exit().
 */
const fs = require('fs');
const userService = require('../services/userService');
const researchConsent = require('../services/researchConsent');
const researchLog = require('../services/researchLog');
const researchDeletion = require('../services/researchDeletion');
const { currentConsentText } = require('../lib/researchConsentText');
const { resolveResearchDbPath } = require('../lib/researchDbPath');

const USAGE =
  'usage: research-paper-consent.js --user <users.id> ' +
  '(--decision consented|declined --text-version <v> | --withdraw) [--write]';
const DECISIONS = new Set(['consented', 'declined']);

/**
 * Exactly one of --decision (with --text-version) or --withdraw (without it); anything else is an error.
 * @param {string[]} argv the arguments after the script name
 * @returns {{ userId: number, decision?: string, textVersion?: string, withdraw?: true, write: boolean } | { error: string }}
 */
function parseArgs(argv) {
  const seen = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (Object.prototype.hasOwnProperty.call(seen, a)) return { error: `${a} given twice` };
    if (a === '--write' || a === '--withdraw') {
      seen[a] = true;
    } else if (a === '--user' || a === '--decision' || a === '--text-version') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return { error: `${a} needs a value` };
      seen[a] = v;
      i += 1;
    } else {
      return { error: `unknown argument ${a}` };
    }
  }
  const userId = Number(seen['--user']);
  if (!Number.isSafeInteger(userId) || userId < 1) return { error: '--user must be a users.id' };
  const write = seen['--write'] === true;
  if (seen['--withdraw']) {
    if ('--decision' in seen || '--text-version' in seen) {
      return { error: '--withdraw takes no --decision and no --text-version' };
    }
    return { userId, withdraw: true, write };
  }
  if (!DECISIONS.has(seen['--decision']))
    return { error: '--decision must be consented or declined' };
  if (!seen['--text-version']) return { error: '--decision needs --text-version' };
  return { userId, decision: seen['--decision'], textVersion: seen['--text-version'], write };
}

/**
 * @param {{ userId: number, decision?: string, withdraw?: boolean, textVersion?: string, write: boolean,
 *   nowMs?: number, researchPath: string }} opts
 * @returns {object} the report; ok is false whenever the research file is absent (decision 21)
 */
function recordPaperDecision({
  userId,
  decision,
  withdraw,
  textVersion,
  write,
  nowMs = Date.now(),
  researchPath,
}) {
  const user = userService.findById(userId);
  if (!user) return { ok: false, refused: 'NO_USER' };
  // Decision 21: a consent's key could not be minted, so refuse it; a withdrawal lives in sessions.db and is recorded.
  const missing = !fs.existsSync(researchPath);
  if (missing && !withdraw && decision === 'consented') {
    return { ok: false, refused: 'RESEARCH_FILE_MISSING' };
  }
  let text = null;
  if (!withdraw) {
    text = currentConsentText();
    if (!text) return { ok: false, refused: 'NO_APPROVED_TEXT' };
    if (text.version !== textVersion) return { ok: false, refused: 'TEXT_VERSION_NOT_CURRENT' };
  }
  const report = {
    ok: !missing,
    user: { id: user.id, displayName: user.display_name },
    state: researchConsent.decisionStateFor(user.id).state,
    action: withdraw ? 'withdraw' : decision,
    textVersion: text ? text.version : null,
    write,
    ...(missing ? { researchFile: 'missing' } : {}),
  };
  if (!write) return report;
  // While the file is absent the interval stays due and research-withdrawal.js deletes it once a file is back.
  const deleteNow = (withdrew, intervalId) =>
    !withdrew
      ? null
      : missing
        ? 'research-file-missing'
        : researchDeletion.deleteIntervalRowsNow(intervalId);
  if (withdraw) {
    const w = researchConsent.withdraw({ userId: user.id, nowMs });
    const deletion = deleteNow(w.withdrawn, w.intervalId);
    return { ...report, outcome: w.withdrawn ? 'withdrew' : 'nothing-live', deletion };
  }
  const r = researchConsent.recordDecision({ userId: user.id, decision, text, nowMs });
  const key = r.outcome === 'started' ? researchLog.ensureKey(r.intervalId).status : null;
  return {
    ...report,
    outcome: r.outcome,
    key,
    deletion: deleteNow(r.outcome === 'withdrew', r.intervalId),
  };
}

/** @returns {0 | 1 | 2} */
function main(argv) {
  const args = parseArgs(argv.slice(2));
  if (args.error) {
    console.error(`${args.error}\n${USAGE}`);
    return 2;
  }
  let report;
  try {
    report = recordPaperDecision({ ...args, researchPath: resolveResearchDbPath().researchPath });
  } catch (err) {
    console.error(`research-paper-consent: ${err.code || err.name}: ${err.message}`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
  return report.ok ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = 1; // a run that dies before a verdict is never 0
  process.exitCode = main(process.argv);
}

module.exports = { USAGE, parseArgs, recordPaperDecision, main };
