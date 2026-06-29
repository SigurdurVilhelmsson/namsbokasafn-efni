# D4 — `<iframe>` Extract + Render (Design)

**Status:** approved by user 2026-06-29, ready for implementation plan.
**Roadmap item:** D4 in [docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md](2026-06-28-pipeline-architecture-implementation-plan.md)
(Track D — cross-book onboarding; `blocks physics, biology`). Biology's main content gap.
**Guiding directive:** robustness & future-proofing over expedience (`feedback-robustness-over-expedience`).

## Purpose

OpenStax embeds (PhET simulations, YouTube videos) live as `<iframe>` inside `<media>`. Today they are
**dropped at every stage** — extract, inject, and render all handle `<image>` only. Biology has **51
embeds across 35 source files**; physics also has them (108 corpus-wide). D4 makes embeds survive the
pipeline and render as working, accessible iframes.

## The decisive finding (reframes the plan)

The roadmap sketch said "re-emit `<iframe>` verbatim." **That does not work.** Every embed src is an
OpenStax redirector, `https://www.openstax.org/l/<slug>`, and that redirector responds:

```
HTTP/2 302   location: https://www.youtube.com/embed/<id>   (or https://phet.colorado.edu/.../*.html)
x-frame-options: DENY
```

The **`X-Frame-Options: DENY` is on the `/l/` redirect hop itself.** An `<iframe src=".../l/slug">`
therefore renders a **blank box** for all 51 embeds. The real targets sit one hop further
(`youtube.com/embed/<id>`, `phet.colorado.edu/.../*.html`), and *those* carry no framing denial — they
are designed to be embedded.

**Consequence:** D4's core is **resolving `/l/` → final embeddable URL**, not verbatim pass-through.
(Probe: `curl -sIL https://www.openstax.org/l/<slug>` on a 10-slug sample, 2026-06-29.)

## Corpus facts (measured 2026-06-29)

- `<media>` contains exactly two child types corpus-wide: **`<image>` (6,769)** and **`<iframe>` (108)**.
  No `<audio>`/`<video>`/`<object>`/`<flash>`/`<labview>` anywhere. **iframe is the complete set of
  non-image media** — "iframe-only" is not a deferral; there is nothing else to handle.
- Biology: 51 iframes; **~41 inline** (`<media>` inside `<para>` → `[[MEDIA:n]]` placeholder path) and
  **~10 block-level** (`<media>` directly inside `<note>`). Both extract paths are in scope.
- All biology embed srcs are `openstax.org/l/<slug>`; uniform `width`/`height`/`src` attributes; wrapped
  in `<media alt="<slug>">` (alt is a non-human slug, e.g. `diet_detective`), usually inside
  `<note class="interactive">`.
- Resolved targets: mostly `youtube.com/embed/<id>`, some `phet.colorado.edu/.../*.html`. Both verified
  framable (final 200 carries no `X-Frame-Options` / no restrictive `frame-ancestors`).

## Architecture (decisions confirmed with user 2026-06-29)

**Resolution happens once, offline, in a committed mapping** — not in extract, and not at render-time over
the network. The pipeline stays pure and deterministic; re-rendering never needs the network.

```
resolve-embeds.js (ONLY networked step, run at intake)
  └─► books/<book>/embed-mapping.json   (committed to git)

extract ──capture /l/ verbatim──► inject ──re-emit /l/ verbatim──► 03-translated CNXML (faithful)
                                                                          │
render ──look up /l/ in embed-mapping.json──► <iframe src="resolved"> + fallback link
```

Rationale: keeping the original `/l/` URL in `03-translated/` CNXML preserves OpenStax round-trip
fidelity (the inject stage's job); resolution is purely a render-time HTML concern, fed by a committed
artifact so render stays offline. Mirrors the existing `image-mapping.json` pattern.

## Components

### 1. `tools/resolve-embeds.js` — new, the only networked step

- `--book <slug>` (D1-config aware, `requireBook`). Scans `books/<book>/01-source/**` for `<iframe src>`.
- For each distinct src: follow redirects (`curl`/`fetch`), capture the final URL and classify
  `kind: youtube | phet | other`.
- Writes/updates **`books/<book>/embed-mapping.json`** (committed):
  ```json
  {
    "https://www.openstax.org/l/diet_detective": {
      "resolved": "https://www.youtube.com/embed/<id>",
      "kind": "youtube",
      "status": "ok",
      "checkedAt": "<ISO date passed in, not generated>"
    }
  }
  ```
- **Fail loud** per slug: a redirect that errors, loops, or yields a non-framable target is written with
  `status` ≠ `ok` and reported; it is **never** silently emitted as a working entry. Re-runnable and
  idempotent.
- Run manually at intake, exactly like `generate-image-mapping.js`. Not part of `npm test` / CI / render.

### 2. Extract — capture, don't resolve

- **Inline** (`cnxml-extract.js` `extractInlineText`, ~`:187`): the `<media>` regex currently reads `src`
  from `<image>` only. Detect an `<iframe>` child; record `embedSrc`, `width`, `height` (reuse
  `parseAttributes`) in the inline-media metadata. Image entries unchanged.
- **Block** (`cnxml-extract.js` `case 'media'`, ~`:1001`): same — record `embedSrc`/`width`/`height` for
  iframe children.
- A media metadata entry is now either an **image** (`src`, `mimeType`) or an **embed** (`embedSrc`,
  `width`, `height`). Distinguished by which field is present.

### 3. Inject — faithful re-emit

- `cnxml-inject.js` `buildMediaElement` (~`:1037`) hardcodes `<media><image …/></media>`. Branch: an
  embed entry rebuilds `<media …><iframe width=… height=… src="<embedSrc>"/></media>` — the **original
  `/l/` src**, verbatim. No mapping lookup here (fidelity, not resolution).
- Inline-media restore (~`:1108`) already routes through `buildMediaElement`; covered.

### 4. Render — resolve + emit accessible iframe

- `cnxml-render.js` `renderMedia` (~`:1248`), inline path (~`:1205`), and `cnxml-elements.js:788`
  (table-cell media) currently match `<image>` only. Add an iframe branch:
  - Look up the iframe's src in `books/<book>/embed-mapping.json`.
  - Emit a **responsive, lazy** `<iframe>` (`loading="lazy"`, aspect-ratio wrapper) pointing at the
    **resolved** URL, **plus an always-visible "Opna í nýjum glugga" fallback link** to the resolved URL.
  - **Title/a11y:** use the wrapping `<para>` text if present, else `@alt`.
  - **Fail loud** if the src is absent from the mapping (or `status` ≠ `ok`): do not emit a blank-box
    iframe. Surfaces as a render error so a missing `resolve-embeds.js` run is caught, not shipped.

### 5. [VEFUR] handoff (do not edit here)

A responsive embed wrapper needs CSS in namsbokasafn-vefur (`static/styles/content.css`): aspect-ratio
box (`.embed-responsive` or equivalent) + fallback-link styling. Scoping identifies the hand-off only;
read vefur's `CLAUDE.md` + memory index before any edit there. Track alongside the other D4 [VEFUR] note
in the roadmap.

## Scope

**In:** `<iframe>` (the complete non-image media set), both inline and block paths, all three pipeline
stages + the resolver tool + committed mapping. Image handling unchanged.

**Out (YAGNI — no such content exists):** generic media-dispatch abstraction; `<audio>`/`<video>`/
`<object>`. The iframe branch is factored cleanly so a *future* book's new media type is a localized
addition — but no speculative generality is built now.

**Out (other items):** species-name protection (D7), SEG-parser unification (audit #14), list-flatten
unification (audit #33). Vefur CSS (handed off).

## Acceptance (two-tier)

- **Offline (unit + D6 characterization):** real biology module **m66594/ch29** (`diet_detective`) —
  with an `embed-mapping.json` entry, the iframe extracts → injects (verbatim `/l/`) → renders an
  `<iframe>` to the resolved URL + fallback link, instead of being dropped. A block-level embed case is
  also covered. `resolve-embeds.js` has its own unit coverage (redirect-resolution + fail-loud on a bad
  slug, network mocked).
- **Live (manual):** the rendered iframe actually plays on namsbokasafn.is after a re-render + sync.

## Regression surface

Extract/inject/render changes are **global**, so re-rendering efnafraedi/edlisfraedi will start emitting
*their* embeds too. The per-book D6 characterization specs cover this; call it out in the PR. No
published HTML changes until a re-render + sync is run (render code-fixes don't auto-update the live site).

## Testing

- `npm test` (local) is the authoritative gate (CI red until ~2026-07-01, no branch protection).
- New: `resolve-embeds` unit spec (mocked network); extract/inject iframe round-trip spec; render iframe
  spec (mapping hit → iframe+link; mapping miss → fail loud); biology D6 characterization spec extension.

## Out-of-scope issues found

(To be appended to the roadmap's Out-of-scope register + memory as discovered during implementation, per
`feedback-log-out-of-scope-issues`.)
