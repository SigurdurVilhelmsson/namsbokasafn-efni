# Handoff → namsbokasafn-efni: D4 embed CSS shipped; css-contract re-armed; 3 findings for efni

> **From:** vefur session, 2026-07-17 (campaign **item 11**). **For:** efni (pipeline + contract owners).
> **Why here:** this documents a change made **in this repo** (PR #295), so this repo carries a
> committed copy — memory is machine-local and a PR comment gets buried on merge. An identical copy
> lives in the authoring repo per the house convention
> (`namsbokasafn-vefur/docs/handoffs/2026-07-17-embed-css-and-css-contract-for-efni.md`,
> cf. `2026-07-01-exercise-answer-id-mismatch-for-efni.md`). Dated handoffs are frozen records —
> neither copy is maintained; don't try to keep them in sync, read either.
> Summarised for auto-recall in efni memory `vefur-embed-css-item11-2026-07-17`.
>
> **PRs:** vefur **#191** (embed CSS) · efni **#295** (css-contract, this repo). **Independently
> mergeable** — no ordering trap. Neither is blocking the other.

---

## TL;DR for an efni session

1. **Item 11 is done.** The `.embed-responsive` / `.embed-fallback` CSS exists in vefur. The
   external gate on biology's embed chapters is **lifted from vefur's side**.
2. **efni PR #295 touches one file** — `tools/__tests__/css-contract.test.js`. Please merge it
   (or review the reasoning in § "What I changed in efni").
3. **The feature is still not live**, and neither remaining gate is vefur's:
   - efni must **re-render the embed-bearing chapters** + a content sync (0 live
     `.embed-responsive` today).
   - the **nginx `frame-src`** must be applied on the server by hand (see § Deploy).
4. **Three findings for efni below** (§ Findings) — one is a real latent false-RED in the
   contract's parser; one is a suggested producer-side gate; one is informational.

---

## What I changed in efni (PR #295)

One file, `tools/__tests__/css-contract.test.js`. Nothing in `tools/` proper, no `01-source`,
no `05-publication`, no data.

### Re-armed — removed from `KNOWN_GAPS`

`note-evolution`, `note-career`, `note-visual-connection`.

These were **already styled** in vefur `content.css` (§ NOTES — BIOLOGY: green / pink / blue
tint, added in the Phase-0 era — _not_ by this session). The contract was still listing them as
known gaps, i.e. **silently swallowing them**: had someone deleted those rules, the contract
would have stayed green. Removing them re-arms the tripwire.

**Proven it bites** (not just assumed): deleting `.note-evolution` from vefur `content.css` now
turns the contract RED naming that exact class —
`AssertionError: expected [ 'note-evolution' ] to deeply equal []`. Restored, green again.

Also verified all three are emitted **hyphenated** (`class="note note-career"`), so the
`aside.note-career` selectors genuinely match — see § Findings/1 for why that check mattered.

### Reclassified `KNOWN_GAPS` → `STRUCTURAL_CLASSES`

| class               | why no vefur rule is wanted                                                                                                                                                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `span-all`          | OpenStax's **two-column** "span both columns" modifier. The reader is **single-column**, so it's a no-op there. The 11 `<figure>` / 1 `<table>` carrying it already render full-column (`figure img{max-width:100%}`, `table{width:100%}`), and their images (≤1044px) would only upscale **blurry** if forced wider. |
| `note-microbiology` | Book marker on `note note-microbiology <variant>`. Every variant it pairs with (`check-your-understanding`, `clinical-focus`, `micro-connection`, `disease-profile`, `eye-on-ethics`, `case-in-point`, `link-to-learning`) is already styled. The marker itself carries no visual meaning.                            |
| `interactive-long`  | **New — was in neither set.** See § Findings/3.                                                                                                                                                                                                                                                                       |

> **⚠️ `span-all` deviates from the handoff plan**, which listed it as biology-priority styling
> work with the note "table full-width row". The measurement disagrees on both counts: it's
> mostly **figures** (11 figures vs 1 table), and in a single-column reader it has nothing to do.
> Flagging explicitly so efni can push back if there's context I'm missing.

---

## Findings for efni

### 1. 🟠 `extractCssClasses` has a blind spot — a latent **false-RED** in the contract

`css-contract.test.js:93-95` reads **only the last line before `{`**:

```js
const lines = block.split('\n');
const selector = lines[lines.length - 1] || '';
```

So any class on a **non-last line of a comma-separated selector is invisible** to the contract,
even though vefur styles it. I enumerated vefur `content.css` — **7 classes are currently
invisible**:

```
g, mathjax-display, note-chemist-portrait, note-everyday-life,
note-link-to-learning, note-sciences-interconnect, visual-connection
```

They come from two-line selectors such as:

```css
article.cnx-module aside.note-link-to-learning,   /* ← INVISIBLE to the parser */
article.cnx-module aside.note.link-to-learning {  /* ← only this line is read */
```

**Currently latent, not active:** none of those are emitted in any `05-publication` HTML today
(`mathjax-display` is separately covered by `EXTERNAL_CLASSES`), which is why the contract is
green. **The risk:** if a book ever renders a note as the single hyphenated
`class="note note-link-to-learning"`, the contract goes **RED claiming vefur doesn't style it —
when vefur does.** Someone would then "fix" a non-bug.

This is why I verified emission shape before trusting the re-arm above, and it's already noted
as a gotcha in vefur memory `css-cross-book-gaps`. **Suggested fix (efni-side, your call):** join
the whole selector block rather than the last line, e.g.

```js
const selector = block
  .split('\n')
  .filter((l) => !l.trim().startsWith('/*'))
  .join(' ');
```

Not urgent, not touched in #295 — it changes contract behaviour and deserves its own change with
its own corpus check.

### 2. 🟡 No producer-side gate keeps embed hosts inside vefur's CSP allowlist

vefur now sends (in `nginx-config-example.conf`):

```
frame-src https://www.youtube.com https://phet.colorado.edu;
```

Those are exactly the origins `tools/lib/embed-resolve.js` produces today (verified across both
`embed-mapping.json` files: biology 50 youtube + 1 phet; physics 30 phet + 17 youtube).

But **nothing in efni enforces that.** `renderEmbedHtml` (`tools/lib/embed-mapping.js:31`) emits
any entry with `status:'ok'` — there's no host/kind check — and `classifyKind` happily returns
`'other'` for an unknown host without failing. `resolve-embeds.js` only warns on non-ok status.

**Consequence:** if a future book resolves an embed to a third host, efni renders it happily and
vefur **silently CSP-blocks it in production** — an empty box, no build or test failure anywhere.
The only thing tying the two lists together today is a comment.

**Suggested (efni-side):** fail loud in `resolve-embeds.js` / `renderEmbedHtml` on a host outside
`{www.youtube.com, phet.colorado.edu}`, mirroring the "fail loud, never emit a blank box" rule
that module already follows for unresolved embeds. If you'd rather widen the allowlist instead,
tell vefur and both lists move together.

_(Raised by review, refuted as "not a defect in the code under review" — correctly, it's a
cross-repo recommendation, which is exactly what a handoff is for.)_

### 3. 🟢 `interactive-long` would have gone RED at biology intake — preempted

`<note class="interactive interactive-long">` (9 biology source modules) renders as
`<aside class="note note-interactive interactive-long">`. `interactive-long` was in **neither**
`KNOWN_GAPS` **nor** `STRUCTURAL_CLASSES`, and vefur has no rule for it — so the contract would
have gone RED **the moment biology's embed chapters render**. Now classified structural.

No CSS is needed: its iframe is `width="660" height="371.4"` = **exactly 16:9**, which vefur's
`.embed-responsive` wrapper already assumes, and its box comes from `.note-interactive`.

---

## Renderer facts I confirmed (so nobody re-derives them)

Established by **running efni's own renderer** (`renderCnxmlToHtml`) on the real
`interactive interactive-long` note, not by reading code:

- **The renderer hoists `<media>` out of its `<para>`.** Source is
  `<note><para>text <media><iframe/></media></para></note>`, but the output is:

  ```html
  <aside id="n1" class="note note-interactive interactive-long">
    <p id="p1">Click for a video discussing the evolution of chordates.</p>
    <div class="embed-responsive">
      <iframe src="https://www.youtube.com/embed/xyz" …></iframe>
    </div>
    <p class="embed-fallback">
      <a href="…" target="_blank" rel="noopener">Opna í nýjum glugga</a>
    </p>
  </aside>
  ```

  This matters: a naive reading of the CNXML predicts `<div>` inside `<p>` (which the HTML parser
  would auto-close, reparenting the div). **It doesn't happen** — the wrapper is a clean direct
  child of the note. Good behaviour; please don't "simplify" it away.

- **Embed census across all `books/*/01-source`:** **108 iframes = 91 inside `<note>` + 17 bare
  - 0 inside `<figure>`.** All 91 in-note ones are `class="interactive"` (10 of those also
    `interactive-long`). All 17 bare ones are physics (`edlisfraedi-2e`), e.g. `ch02/m42122.cnxml`.
    The `renderFigure` embed path (`cnxml-render.js:1055-1067`) exists but is **currently unused**
    by any content — vefur styles the note and bare cases only, deliberately.

- These numbers drove the CSS: because 91/108 sit in notes, vefur needed a **note-inset rule**
  the original plan didn't anticipate (note children are inset 30px, 10px under the 768px
  breakpoint; without it the frame bleeds past the note's own prose to its border).

---

## Deploy — the remaining external gate (NOT efni's, recorded here for completeness)

`deploy.yml` never touches nginx. Until the **server's** nginx config gains `frame-src`, embeds
are CSP-blocked in production: empty 16:9 boxes, degrading to the fallback link. The CSP header
is repeated **10×** in the config (1 `server` + 9 `location` blocks) — all need it. Tracked in
vefur memory `embed-csp-frame-src-deploy`.

## Nothing here blocks efni

Item 11 needed **no efni code change**. #295 is hygiene + a preempted tripwire. The biology
re-render can proceed whenever the content track is ready; vefur's CSS is already waiting for it.

---

## References

- vefur PR **#191** · efni PR **#295**
- Plan this closes: `docs/plans/2026-06-30-cross-book-css-and-embed-handoff.md` § Task 1
- vefur memory: `css-cross-book-gaps`, `embed-csp-frame-src-deploy`,
  `efni-campaign-handoff-2026-07-17`, `ci-blocked-actions-billing`
- efni memory: `d4-iframe-embeds`, `vefur-embed-css-item11-2026-07-17`
