/**
 * UI static pins for MT acceptance (item 20b). Pins prove PRESENCE only —
 * behavior is covered by e2e/acceptance.spec.js (campaign lesson: static
 * pins prove presence, not behavior). Strings are raw UTF-8 Icelandic:
 * match FILE BYTES.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, '..');

const clientJs = readFileSync(join(serverDir, 'public', 'js', 'segment-editor.js'), 'utf-8');
const html = readFileSync(join(serverDir, 'views', 'segment-editor.html'), 'utf-8');
const strings = readFileSync(join(serverDir, 'public', 'js', 'ui-strings.js'), 'utf-8');
const gitattributes = readFileSync(join(serverDir, '..', '.gitattributes'), 'utf-8');

describe('acceptance UI pins', () => {
  it('ui-strings carries the acceptance vocabulary (spec §3)', () => {
    expect(strings).toContain('Staðfesta MT');
    expect(strings).toContain('acceptance: {');
  });

  it('client renders accept + revoke and exposes the handlers', () => {
    expect(clientJs).toContain('acceptSegmentAndAdvance');
    expect(clientJs).toContain('window.acceptSegmentAndAdvance');
    expect(clientJs).toContain('window.revokeAcceptance');
    expect(clientJs).toMatch(/\/accept`/); // the POST …/accept URL template
    expect(clientJs).toContain('/acceptance/'); // the revoke URL
    expect(clientJs).toContain('acc:'); // saveRetry queue key prefix
  });

  it('keyboard: Ctrl+Shift+Enter accepts; plain Ctrl+Enter save excludes shiftKey', () => {
    expect(clientJs).toContain('e.shiftKey) {');
    expect(clientJs).toContain('!e.shiftKey');
    expect(clientJs).toContain('acceptAtCursor');
  });

  it('filter facets Staðfest + Óyfirfarnir exist in the HTML', () => {
    expect(html).toContain('<option value="accepted">Staðfest</option>');
    expect(html).toContain('<option value="unhandled">Óyfirfarnir</option>');
  });

  it('accepted chip + row CSS exist', () => {
    expect(html).toContain('.edit-status.accepted');
    expect(html).toContain('.segment-row.accepted-row');
    expect(html).toContain('.segment-row.kbd-cursor');
  });

  it('stats bar renders the accepted chip; progress counts acceptances', () => {
    expect(clientJs).toContain('s.accepted');
    expect(clientJs).toContain('moduleData.acceptances');
  });

  it('apply panel reads unapplied_acceptances', () => {
    expect(clientJs).toContain('unapplied_acceptances');
  });

  // ── MTA-R3 structural pins ──
  // Presence only: the eligibility RULE is behaviour-tested in
  // acceptEligibility.test.js and pinned against the server in
  // acceptanceService.test.js ("server/client gate parity").

  it('the accept gate comes from the shared predicate, not an ad-hoc condition', () => {
    expect(html).toContain('<script src="/js/accept-eligibility.js"></script>');
    expect(clientJs).toContain('acceptEligibility.acceptBlockReason');
    expect(clientJs).toContain('acceptEligibility.canAcceptMt');
  });

  it('acceptance UI is no longer an else-if arm shadowed by any edit', () => {
    // The defect: `} else if (acceptance) {` meant chip+revoke were unreachable
    // whenever the segment had an edit of any status.
    expect(clientJs).not.toContain('} else if (acceptance) {');
    expect(clientJs).toContain('if (acceptance) {');
  });

  it('the two accept predicates are named and distinct (facet ≠ keyboard stream)', () => {
    expect(clientJs).toContain('function isUnreviewedBacklog(');
    expect(clientJs).toContain('function isKeyboardAcceptTarget(');
    expect(clientJs).not.toContain('function isUnhandled(');
  });

  it('contested rows carry an on-screen reason and the honest exhausted-stream toast', () => {
    expect(strings).toContain('contestedRejected');
    expect(strings).toContain('contestedSuperseded');
    expect(strings).toContain('discussBlocked');
    expect(strings).toContain('noneLeftContested');
    expect(clientJs).toContain('UI.acceptance.noneLeftContested');
    expect(html).toContain('.accept-context-hint');
  });

  it('.gitattributes carries the sidecar merge=ours line', () => {
    expect(gitattributes).toContain(
      'books/*/03-faithful-translation/*/*-review-status.json merge=ours'
    );
  });

  it('final-review F2: apply UI surfaces acceptance counts, not just appliedCount (byte + reference pins)', () => {
    // ui-strings.js: acceptance-aware message text (raw UTF-8 — byte-check).
    expect(strings).toContain('staðfestingar');
    expect(strings).toContain('acceptancesApplied');
    // segment-editor.js: the apply path reads acceptedCount, and loadApplyStatus
    // reads applied_acceptances instead of falling through to noApproved.
    expect(clientJs).toContain('data.acceptedCount');
    expect(clientJs).toContain('data.applied.acceptedCount');
    expect(clientJs).toContain('applied_acceptances');
    expect(clientJs).toContain('UI.apply.acceptancesApplied');
  });
});
