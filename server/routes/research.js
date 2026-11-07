/**
 * Research consent routes (spec §5.14; the data side only, decision 25).
 *
 * A member records or withdraws their own decision. There is no page and no read route to
 * research data. A visitor has no account row and gets none (as notifications.js does). No
 * activity_log row and no log line carries a decision. This file reaches research data only
 * through researchLog's write functions; Task 31's route scan forbids naming the research
 * handle module or the key table in any file under server/routes/.
 *
 * Endpoints:
 *   GET  /api/research/consent            The caller's decision state
 *   POST /api/research/consent            Record a decision { decision, textVersion }
 *   POST /api/research/consent/withdraw   End the caller's live interval
 */
const express = require('express');
const router = express.Router();

const log = require('../lib/logger');
const { requireAuth } = require('../middleware/requireAuth');
const userService = require('../services/userService');
const researchConsent = require('../services/researchConsent');
const researchLog = require('../services/researchLog');
const { currentConsentText } = require('../lib/researchConsentText');

const CONSENT_MESSAGES = Object.freeze({
  visitor:
    'Gestir eru ekki skráðir notendur og geta ekki tekið afstöðu til rannsóknarinnar; ekkert er geymt fyrir gest.',
  noText:
    'Samþykkistexti rannsóknarinnar hefur ekki verið birtur enn, svo ekki er hægt að skrá ákvörðun.',
  badDecision: 'Ákvörðun verður að vera „consented“ eða „declined“.',
  textChanged:
    'Samþykkistextinn hefur breyst frá því að síðunni var hlaðið. Lesið nýja textann og takið afstöðu aftur.',
  failed: 'Ekki tókst að skrá ákvörðunina.',
  // The GET's read failure, where nothing was being recorded. Approved by [USER] 2026-11-07
  // (register, ③ of the (C1 built) entry).
  readFailed: 'Ekki tókst að sækja ákvörðunina.',
});

function memberOr403(req, res) {
  const user = userService.findByProviderId(req.user.id);
  if (!user) {
    res.status(403).json({ error: 'Visitor', message: CONSENT_MESSAGES.visitor, visitor: true });
    return null;
  }
  return user;
}

const view = (userId) => {
  const current = currentConsentText();
  return {
    ...researchConsent.decisionStateFor(userId),
    currentTextVersion: current ? current.version : null,
  };
};

const fail = (res, err, what, message = CONSENT_MESSAGES.failed) => {
  log.error({ errorCode: err.code || err.name }, what);
  return res.status(500).json({ error: message });
};

router.get('/consent', requireAuth, (req, res) => {
  const user = memberOr403(req, res);
  if (!user) return undefined;
  try {
    return res.json(view(user.id));
  } catch (err) {
    return fail(res, err, 'Consent state not read (spec §5.14)', CONSENT_MESSAGES.readFailed);
  }
});

router.post('/consent', requireAuth, (req, res) => {
  const user = memberOr403(req, res);
  if (!user) return undefined;
  try {
    const current = currentConsentText();
    if (!current) {
      return res.status(409).json({ error: 'NO_APPROVED_TEXT', message: CONSENT_MESSAGES.noText });
    }
    const { decision, textVersion } = req.body || {};
    if (decision !== 'consented' && decision !== 'declined') {
      return res
        .status(400)
        .json({ error: 'INVALID_DECISION', message: CONSENT_MESSAGES.badDecision });
    }
    if (textVersion !== current.version) {
      return res.status(409).json({
        error: 'CONSENT_TEXT_CHANGED',
        message: CONSENT_MESSAGES.textChanged,
        currentTextVersion: current.version,
      });
    }
    const result = researchConsent.recordDecision({
      userId: user.id,
      decision,
      text: current,
      nowMs: Date.now(),
    });
    // The response never depends on the key's minting (spec §5.16).
    if (result.outcome === 'started') researchLog.ensureKey(result.intervalId);
    return res.json(view(user.id));
  } catch (err) {
    return fail(res, err, 'Consent decision not recorded (spec §5.14)');
  }
});

router.post('/consent/withdraw', requireAuth, (req, res) => {
  const user = memberOr403(req, res);
  if (!user) return undefined;
  try {
    researchConsent.withdraw({ userId: user.id, nowMs: Date.now() });
    return res.json(view(user.id));
  } catch (err) {
    return fail(res, err, 'Consent withdrawal not recorded (spec §5.14)');
  }
});

module.exports = router;
