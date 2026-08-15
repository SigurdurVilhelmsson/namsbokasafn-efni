# Design — figure `alt` text into the translation pipeline (§C81)

**Status:** design, approved section-by-section by the [LEAD] 2026-08-15. **Not an implementation plan.**
**Owns:** how `alt` becomes a translatable segment and returns to the CNXML attribute.
**Does not own:** scope and budget (→ active register **§C80**, re-scoped 2026-08-15) · the loop
that consumes this (→ **§C82** and [`2026-08-13-gated-per-module-remt-loop-design.md`](2026-08-13-gated-per-module-remt-loop-design.md)).

Per CLAUDE.md § *One source of truth*, this document restates no count owned elsewhere.

---

## 1. Problem

**`alt` is the one reader-facing string in the pipeline carried as a literal rather than as a
segment**, so it is never translated. English alt text is live on published Icelandic pages.

It is not *missing* — it is captured twice and faithfully preserved:

| site | what it does |
|---|---|
| `tools/cnxml-extract.js:222` (`extractInlineText`) | media **inside a `<para>`** → `inlineMediaMap` → `structure.inlineMedia[]` |
| `tools/cnxml-extract.js:1069` (`processTopLevelContent`, `case 'media'`) | **standalone top-level media** — in no figure and no paragraph → `elements[]` |
| `tools/cnxml-extract.js:1112` (`processFigure`) | media **inside a `<figure>`** → `figStructure.media.alt` |
| `tools/cnxml-inject.js:3890` (`buildMedia`) | writes all three back: `element.alt ? ` alt="${escapeXml(element.alt)}"` : ''` |

⚠️ **THREE capture sites, not two.** An earlier draft of this spec named two and cited the wrong
line for the third; the self-review caught it. **`grep -an "alt:" tools/cnxml-extract.js` is the
authoritative enumeration — re-derive it rather than trusting this table**, per CLAUDE.md's
standing rule about enumerations in prose.

Every sibling translatable string — `title`, `caption` — is instead carried as
`{ segmentId, text }` and resolved at inject through `getSeg()`. **`alt` is the exception, and
that exception is the whole defect.**

**This is an accessibility defect**: alt text is what a screen-reader user receives *instead of*
the figure. It is currently English on an Icelandic page.

### Measured volume

Counted by parsing (`@xmldom/xmldom`), unit = **`<media>` elements carrying a non-empty `alt`**,
classified by whether a `<figure>` ancestor exists:

| | in `<figure>` | in a `<para>` | top-level standalone | id-less | empty alt | missing alt |
|---|---|---|---|---|---|---|
| `efnafraedi-2e` (full) | 627 | 214 | **308** | **0** | 0 | 0 |
| `lifraen-efnafraedi` (preview, 17 modules) | 100 | **0** | **32** | **32** | 0 | 0 |
| **in scope** | **727** | **214** | **340** | **32** | **0** | **0** |

**Three facts fall out and each shapes the design:**
- **Every `<media>` in the corpus has a non-empty alt** — there is no decorative/empty-alt case,
  so no rule to write for one.
- **Top-level standalone media is 27% of the in-scope alts**, and it is a *third* structural
  position with neither a caption nor a containing paragraph. ⚠️ **An earlier count classified
  these as "inline" and produced a placement rule that could not apply to them.**
- **Organic has no para-inline media at all**, and all 32 of its alts outside figures are
  standalone *and* id-less. **Chemistry has zero id-less.**

**Cost in scope:** 796,881 alt chars ≈ **7,969 ISK** (chemistry 782,099 + organic preview 14,782).

## 2. [LEAD] decisions

| # | Decision | Why it matters |
|---|---|---|
| ① | **alt becomes a first-class segment** — translated, editable, TM'd | alt is reader-facing; anything less leaves it unreviewed, and §C73/§C77 show unreviewed terminology is where the damage is |
| ② | **placed immediately after the caption** | the reviewer needs context before judging a description |
| ③ | **both figure and inline media**, with a positional id for the id-less | 32 in-scope cases, all in a book being re-extracted wholesale |
| ④ | **approach A** — `alt` becomes `{ segmentId, text }`, mirroring `caption`/`title` | the idiom already exists; diverging from it reads as an accident |

## 3. The change

### 3.1 Extract — a new `alt` segment type

The placement rule, stated once: **alt follows whatever gives a reviewer context.**

| media kind | segment id | emitted after | site |
|---|---|---|---|
| in a `<figure>` (727) | `<figureId>-alt` | the figure's caption | `processFigure:1112` |
| in a `<para>` (214) | `<mediaId>-alt`, else `media-<N>-alt` | the paragraph's own segment | `extractInlineText:222` + caller |
| top-level standalone (340) | `<mediaId>-alt`, else `media-<N>-alt` | **its own position in document order** | `processTopLevelContent:1069` |

**The standalone case is the simplest of the three, not a special case:**
`processTopLevelContent` already walks top-level elements *in document order*, so an
`addSegment('alt', …)` in its `case 'media'` lands in the right place with no ordering logic at
all. It has no caption and no paragraph to follow because it *is* the block.

⚠️ **`extractInlineText` must stay pure.** It is a text transformer that *collects* into
`inlineMediaMap`; `addSegment` lives in `extractSegments`'s closure and is not available to it.
**Para-inline alt segments are therefore emitted by the caller**, immediately after the
paragraph's own segment, by draining what that paragraph just added to the map. This keeps the
ordering rule in one place and `extractInlineText` free of segment-emission concerns.
**This applies to the 214 para-inline cases only** — chemistry's, since organic has none.

### 3.2 Structure — one shape, both paths

```js
media.alt = { segmentId: 'm68663:alt:fig-01-alt', text: 'A photograph of…' }
```

Symmetric across `figStructure.media` and `structure.inlineMedia[]`, and identical to the
established `{ segmentId, text }` used by `title` and `caption`.

### 3.3 Inject — THREE sites, dual-shape

⚠️ **CORRECTED during planning: there are three emission sites, not one**, and they pair exactly
with the three capture sites. Two of them **cannot resolve a segment today** because they take no
`getSeg`:

| position | capture | emit | takes `getSeg`? | how it gets resolved |
|---|---|---|---|---|
| figure | `processFigure:1112` | `buildFigure:2375` | ✅ yes | directly |
| standalone | `processTopLevelContent:1069` | `buildMedia:3890` | ❌ no | **thread `getSeg` in** — both callers (`buildElement:2233`, `buildList:3835`) already have it |
| para-inline | `extractInlineText:222` | `buildMediaElement:1244` | ❌ no | **pre-resolve at the caller** — `reverseInlineMarkup:1305` receives `inlineMedia[]` but no `getSeg`, so its caller hands it an array whose `alt` is already a plain string |

▶ **The para-inline resolution deliberately happens at the boundary**, leaving
`reverseInlineMarkup` a pure text transformer — the mirror of `extractInlineText` staying pure on
the extract side. **Pure functions at both ends, resolution at the callers.**

Each site resolves through `getSeg()` with the English as fallback, **and all three must accept
both shapes**:

```js
const altText = typeof element.alt === 'string'
  ? element.alt                                          // legacy structure, pre-§C81
  : getSeg(element.alt?.segmentId) || element.alt?.text;  // new structure
```

🔴 **Dual-shape handling is REQUIRED, not defensive.** §C82 re-extracts **one module at a time**,
so for the entire run the corpus holds both shapes simultaneously — for weeks. Hand the current
code an object and it emits **`alt="[object Object]"`** into a published page.

▶ **This constraint generalises to every future `02-structure` change made during a §C82 run**,
and belongs in the loop's operating rules, not only here.

### 3.4 Render — no change, and the reason is worth recording

Render has **two** alt paths and **both are already correct for their own inputs**:

- `cnxml-render.js:1087` — inside the depth-aware walk, which hands renderers a **re-serialized**
  node whose alt arrives already entity-encoded, hence `escapeAttr(decodeEntities(alt))`.
- `cnxml-render.js:1149` (`renderMedia`) — reads `media.attributes.alt` from a **regex parse of
  raw CNXML**, which is *not* re-serialized, hence `escapeAttr(alt)` alone.

⚠️ **They look like one fixed site and one unfixed site, and they are not.** This was misread
once during design. **Do not "unify" them** — same class as CLAUDE.md's two chapter-dir
conventions, where the duplication is the correct answer.

## 4. Testing

Every check gets a control, per the project's standing rule that a check never shown to fail is
not a check.

| test | must FIRE | must NOT fire |
|---|---|---|
| alt is segmented | a figure with alt → segment `<figureId>-alt` exists | a `<media>` with no alt → no segment *(synthetic — the corpus has none)* |
| dual-shape inject | object-shaped `alt` → translated text in the attribute | **string-shaped `alt` → output byte-identical to today** |
| id-less standalone alt | one of organic's 32 → `media-<N>-alt` | chemistry → **no positional ids at all** |
| all three positions | a module with figure + para-inline + standalone media → 3 alt segments, in document order | — *(chemistry has all three; organic exercises only two)* |
| escaping round-trip | `sýrur & basar` survives **both** render paths | plain ASCII alt byte-identical to today |

**Why the escaping test needs a synthetic fixture:** translated alt crosses two seams it never
crossed before (`escapeXml` at inject, then `escapeAttr` ± `decodeEntities` at render, on two
different paths). Measured, **entity-bearing alt is 1 of 1,149 in chemistry and 0 of 2,163 in
organic**, and that one is probably regex over-match — so **the corpus cannot exercise this and a
fixture must**.

**The corpus control that makes the whole thing binding:** re-extract chemistry with the change
and assert **1,149 alt segments appear where 0 exist today**, and that the rest of the extraction
is otherwise unchanged apart from the expected `auto-N` renumbering. A change that quietly
perturbs other segments would pass every unit test above.

## 5. Sequencing

🔴 **§C81 cannot land piecemeal.** Adding segments renumbers `auto-N` seg-ids — the export
corpus's join key. That is acceptable **only** because §C80 re-extracts both books wholesale.
The order is fixed:

1. §C81 ships.
2. Both in-scope books re-extract **once** (free — `cnxml-extract` makes no API call).
3. §C82's loop starts.

⚠️ **Batch it with every other extraction-side change** so there is exactly **one** fingerprint
transition before the run — §C82's ruling ① and the widened marker delta are the others. Three
separate landings would quarantine everything cleared between them.

## 6. Out of scope

- **Improving the English alt.** OpenStax's alt text is translated as found; judging its quality
  is editorial work, not pipeline work.
- **Alt for the three dropped books.** §C80's re-scope removed biology, microbiology and physics;
  their alt stays English until they return to scope, if ever.
- **Unifying the two render paths** (§3.4). They are correct as they are.

## 7. Open questions

None. All four design decisions are ruled; the volume, the id-less population, the empty-alt
case and the entity-bearing case are all measured rather than assumed.
