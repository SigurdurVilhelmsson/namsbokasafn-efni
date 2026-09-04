/**
 * Client-side rules for the figure review card, pinned at the source level.
 *
 * (Named for the image alone until 2026-09-04; renamed with `git mv` when the
 * decimal-suggestion pins arrived, because a file called ...ImagePins holding
 * number-localization rules misleads every future reader. History is preserved.)
 *
 * The card itself is exercised in the browser by server/e2e/figure-review.spec.js.
 * What THIS file pins is the pair of rules the [USER] ruling turns on, both of
 * which are invisible to a rendering test because a card that broke them would
 * still look right:
 *
 *  1. the URL is SERVER-SUPPLIED — the client may not know DEFAULT_SUFFIX
 *     ('_IS', owned by tools/generate-image-mapping.js) nor invent a /content
 *     path, which is vefur's and which this app serves on no route at all;
 *  2. `src` is assigned THROUGH THE DOM, never interpolated into innerHTML.
 *
 * ⚠️ E2E does not run under `npm test` — it is a separate CI job — so without
 * this file both rules would be gated by nothing the authoritative suite runs.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(__dirname, '..', 'public', 'js', 'segment-editor.js');
const src = fs.readFileSync(CLIENT, 'utf-8');

/**
 * Comments removed, so these pins judge CODE.
 *
 * ⚠️ Load-bearing, and measured: the first draft of the "never names the
 * suffix" pin went red against a COMMENT explaining why the card had no <img>
 * yet — prose that was doing its job. A rule about what the client may KNOW is
 * a rule about what it EXECUTES; documenting the rule beside the code that
 * obeys it must stay allowed, or the pin punishes exactly the comment a future
 * reader needs.
 *
 * Block comments and whole-line `//` comments only. A trailing `//` is left
 * alone on purpose: stripping it would have to reason about strings, and this
 * file's URLs ('https://…') are precisely where that goes wrong.
 */
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

/**
 * The figure-card region of the client, comments removed, so a match elsewhere
 * in a 900-line file cannot pass for one here — and so a comment SAYING the
 * card avoids innerHTML cannot itself trip the pin that it does. (It did, on
 * the first run of this file. Twice, in two different assertions.)
 */
function figureCardSource() {
  const start = src.indexOf('function renderFigureCard(');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('function figureUrl(', start);
  expect(end).toBeGreaterThan(start);
  const region = codeOnly(src.slice(start, end));
  expect(region).toContain('createElement'); // control: the region survived stripping
  return region;
}

/** The renderFigureBlock region — where a block's input, save and warnings live. */
function figureBlockSource() {
  const start = src.indexOf('function renderFigureBlock(');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('function renderFigureCard(', start);
  expect(end).toBeGreaterThan(start);
  const region = codeOnly(src.slice(start, end));
  expect(region).toContain('createElement'); // control: the region survived stripping
  return region;
}

describe('the figure card renders the figure', () => {
  it('reads the URL off the payload rather than building one', () => {
    expect(figureCardSource()).toMatch(/fig\.imageUrl/);
  });

  it('exposes the data-figure-image hook E2E and future work select on', () => {
    expect(figureCardSource()).toMatch(/data-figure-image/);
  });

  it('gives the image an alt attribute', () => {
    // A card whose only content is an unlabelled image is unusable with a
    // screen reader, and the interface UX audit already flagged this class.
    expect(figureCardSource()).toMatch(/\.alt\s*=/);
  });

  it('assigns src through the DOM, never through innerHTML', () => {
    const card = figureCardSource();
    expect(card).toMatch(/\.src\s*=\s*fig\.imageUrl/);
    expect(card).not.toMatch(/innerHTML/);
  });
});

/**
 * ⑭ NUMBER LOCALIZATION — as a one-click editorial action, [USER]-ruled 2026-09-04.
 *
 * Icelandic writes the decimal separator as a comma, so `373.15 K` must become
 * `373,15 K`. The advisory check already computed that string; what was missing
 * was any way to APPLY it. It is offered, never applied automatically: the
 * sidecar records what a human approved, and a wrong conversion in a chemistry
 * textbook is the worst available failure.
 *
 * 🔴 THE RULE HAS ONE OWNER — `tools/lib/figure-consistency.cjs`. The client
 * posts the server's `suggested` string verbatim. It must NEVER recompute the
 * conversion: a second implementation would drift from the first silently, and
 * the first is the one that knows Icelandic INVERTS both separators (a blind
 * '.' -> ',' turns 1,000 into 1.000).
 */
describe('the decimal suggestion can be applied in one click', () => {
  it('renders an apply control for a decimal warning', () => {
    expect(figureBlockSource()).toMatch(/data-block-apply/);
  });

  it("posts the SERVER's suggested string, not a locally computed one", () => {
    // Bound to the field, not merely to the presence of a save call: applying
    // input.value or a re-derived string would look identical in a screenshot
    // and would be a second implementation of the rule.
    expect(figureBlockSource()).toMatch(/saveFigureBlock\([^)]*w\.suggested/);
  });

  it('contains no digit class in the block region — so no client-side number rule', () => {
    // The sharpest available pin: any client-side conversion needs a digit
    // character class. Its absence is checkable; "does not duplicate the rule"
    // is not.
    expect(figureBlockSource()).not.toContain('\\d');
  });

  it('DISABLES the control while the input differs from what the suggestion came from', () => {
    // The suggestion is derived server-side from the SAVED text. If the editor
    // has typed since, applying it would silently discard their typing — and
    // recomputing client-side to avoid that is the wrong fix, per the rule above.
    const region = figureBlockSource();
    expect(region).toMatch(/w\.current/);
    expect(region).toMatch(/disabled/);
  });

  it('offers NO apply control for a caption warning', () => {
    // A caption warning is a note about one word ("the module's caption uses
    // X"), not a replacement string. There is nothing to apply, and a control
    // that pasted the note into the block would corrupt it.
    const region = figureBlockSource();
    const captionPart = region.slice(region.indexOf('warnings.caption'));
    expect(captionPart.length).toBeGreaterThan(0); // control: the loop is there
    expect(captionPart).not.toContain('data-block-apply');
  });
});

describe('the client knows nothing it must not know', () => {
  const code = codeOnly(src);

  it('the comment stripper leaves the code it is meant to judge', () => {
    // Control. A stripper that returned '' would make both pins below pass
    // vacuously — the failure mode this repo calls a manufactured absence.
    expect(code).toMatch(/function renderFigureCard\(/);
    expect(code.length).toBeGreaterThan(src.length / 2);
  });

  it("never names the translated-image suffix — DEFAULT_SUFFIX's owner is a tool", () => {
    // Measured before this change: the plan's original card DID hardcode '_IS'.
    // A suffix here would silently stop matching the day the tool's constant
    // changed, and CLAUDE.md makes that constant an enforceable value read from
    // its owner and never restated.
    expect(code).not.toMatch(/_IS\b/);
  });

  it('never reaches for a /content path — that route belongs to vefur', () => {
    // This app serves no /content mount (express.static covers server/public
    // only), so the plan's sketched URL would have 404'd on every card for
    // every book. The measurement that killed it is worth keeping armed.
    expect(code).not.toMatch(/['"`]\/content\//);
  });
});
