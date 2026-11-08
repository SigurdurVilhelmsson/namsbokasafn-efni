# Decision: H3's four "which form wins" choices for chemistry — "Prófaðu þekkingu þína" (rendered), amu, supine objectives, "Talið upp"

- **Date:** 2026-11-08
- **Status:** Accepted
- **Context owners:** [USER] (ruled 2026-11-08, one item at a time, on the evidence below; proposals and measurements by [CODE])
- **Supersedes:** none
- **Related:**
  - the active register's §C201 (vefur's content requests H1–H6; H3 is this record);
  - vefur's handoff `docs/handoffs/2026-10-16-reader-branches-requests-for-efni.md` § H3 (vefur `origin/main`, `fc23cc2`), the owner of vefur's numbers;
  - `docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` §5 (4.5, the whole-book re-inject and re-render);
  - `docs/decisions/2026-10-28-rule-layer-edits-as-editor-suggestions.md` and `docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md`;
  - CLAUDE.md § Purpose (no hand repairs to pure MT, [USER] 2026-11-05).

> **FROZEN EVIDENCE — banner-dated 2026-11-08.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

vefur's 2026-10-16 handoff (item H3) found four things a chemistry reader meets many times written in more than one form, and asked efni for one form each. Register §C201 recorded that which form wins is a terminology ruling for [USER], not a code choice, and that H1–H4 should land before the whole-book re-render (plan 4.5) so that it runs once.

A second question came up while ruling: **how each ruled form reaches readers.** [USER]'s 2026-11-05 ruling says the pure MT layer changes only through the API and that a defect in MT text goes to the editors' layer. So "which form" and "by which route" were ruled together, and the route decides which items hold up 4.5.

## Decision

Chemistry (`efnafraedi-2e`) only. No glossary change.

| # | What | Ruled form | Route |
|---|---|---|---|
| 1 | The heading that ends each worked example (English "Check Your Learning") | **Prófaðu þekkingu þína** | **Rendered from the house value** wherever the read-only source has that title, as other container titles are; the MT layer is untouched. **The only H3 item that changes the 4.5 render.** |
| 2 | Atomic mass unit abbreviation | **amu** | The `ame` uses reach editors as rule-layer suggestions. No render change: formulas already show `amu`. |
| 3 | §9.5's two learning objectives (`m68758` abstract-items 1 and 2) | **The supine**: "Tilgreint grundvallarsetningar …", "Notað grundvallarsetningar …". Only the verb form is ruled. | Rule-layer suggestions. |
| 4 | "Talist upp" in §19.2 (`m68843` abstract-item-1) and §21.5 (`m68857` abstract-item-1) | **Talið upp** | Rule-layer suggestions. |

## Reasoning

### Evidence base

Measured 2026-11-08 on `main` at `1085065`: English from `books/efnafraedi-2e/02-for-mt/`, MT from `books/efnafraedi-2e/02-mt-output/` (the September MT). Chemistry has no `02-mt-selected/` overlay, so layer 1s is the pure MT, which is the text both the editors and the 4.5 preview start from. Segments were split on the permissive `<!-- SEG:… -->` marker. Counts are by distinct segment id unless stated: 285 ids repeat within the MT files, so counting every segment body gives slightly higher figures. The June MT (`9a69414d5`) was read the same way, as the text behind today's live site. vefur's figures were measured on 2026-10-16 on rendered HTML (efni `98a5fe2ff` and the ② preview `48dbbb7a2`), a different tree and unit; they agree in kind.

### 1. The heading: one value, rendered

- **292** English para-titles read "Check Your Learning". The September MT renders them in **16** forms: Kannaðu þekkingu þína 98 (plus one with a full stop), Skoðaðu þekkingu þína 65, Prófaðu þekkingu þína 61, Spyrðu þig 25, Prófaðu þig áfram 13, Spyrndu þig 7 (not a word), Sannreyndu þekkingu þína 6, Prófaðu þig 5, and eight more with 1–2 each.
- The June MT renders the same 292 mostly as Kannaðu þekkingu þína (203), then Skoðaðu (47) and Prófaðu (19). **The spread follows the MT run, not the context**, so editing would not converge on one form, while a rendered label does.
- **The house value already exists.** `SHARED_TITLE_TRANSLATIONS` in `tools/lib/book-rendering-config.js` maps `'Check Your Learning'` to `'Prófaðu þekkingu þína'`, added in `9106075d0` (2026-03-09, multi-book rendering). Ruling that value keeps one form project-wide. *Prófa* ("test") also names what the section is: a practice problem with its answer, after each worked example.
- **Why rendered rather than suggested.** Readers meet the heading 292 times. Rendering it from configuration, keyed on the read-only `01-source` structure, is how other container titles work; it follows CLAUDE.md's rule never to decide render behaviour by comparing translated strings, and it leaves the MT layer as received. The 2026-11-05 ruling governs the MT layer, which this route does not change.

### 2. amu

- English: `amu` in 72 segments (136 uses). September MT prose: `amu` **122** uses in 64 segments across 10 modules (125 in 67 counting every body); `ame` **17** uses in 9 segments (18 in 10), in four modules: `m68700` and `m68702` (ch03; both also use `amu`), `m68716` (ch04) and `m68761` (ch10).
- The book's own key term (`m68692` glossary-term) and the constants table (`m68862`) read "atómmassaeining (amu)" in the MT.
- **Formulas already show `amu`.** The source MathML carries values such as `<m:mtext>1.0073 amu</m:mtext>`; chemistry's curated `math-label-map.json` self-maps `"amu": "amu"`, and short math labels keep English by default (`SHORT_LABEL_MAX`, `LOCALIZABLE_SHORT_LABELS` in `tools/lib/math-label-inventory.js`).
- Choosing `ame` would need a render change for formulas, about 122 prose changes and new wording for the key term and the table.

### 3. The supine for §9.5's objectives: a ruling on consistency

- Of 419 abstract-item segments, **exactly 2 are imperatives**: `m68758`'s "Tilgreindu …" and "Notaðu …". The rest are mostly supines (Lýst 77, Útskýrt 37, Skilgreint 28, Reiknað 25, Greint 21, Notað 19, …) with some noun-phrase items. (vefur's "the other 306 are supine" counted module objectives on rendered pages, a different unit.)
- Elsewhere the supine is grammatically required: all 112 lead-in sentences end in a form of *geta* ("Í lok þessa kafla muntu geta:" 46, "Þegar þú hefur lokið við þennan kafla getur þú:" 28, …), which takes the supine.
- ⚠️ **§9.5 itself has no lead-in.** Its source `<abstract>` holds only the list, so its two items sit directly under the renderer's "Námsmarkmið" heading, where a command reads grammatically. Of the 21 modules without a lead-in, 20 are chapter introductions (whose items are noun phrases) and the 21st is §9.5, the only numbered section. [CODE] first proposed the supine on the grammatical argument; this was corrected during the session, and [USER] re-confirmed the supine on consistency: every other section's objectives read in the supine, and vefur's flashcards and cues reuse whatever form the page carries (vefur's handoff, H3 "Why").
- Only the verb form is ruled. The rest of the wording (for example "hreyfi-sameindakenningarinnar", which has no ruled term) stays the editors' call.

### 4. "Talið upp"

- *Talist* is the supine of the mediopassive *teljast* ("be counted, be considered"). "List" is *telja upp*, whose supine is *talið upp*.
- Four other "List …" objectives already read "Talið upp" (`m68733`, `m68784`, `m68826`, `m68858`).

### Why items 2–4 go through editors

- The 2026-11-05 ruling: the pure MT layer changes only through the API, and an MT defect goes to the editors' layer. The 2026-10-28 rule-layer record: rule edits reach editors as suggestions, accept-all per ruling, and every unit starts from pure MT.
- Items 2–4 are wording inside particular segments. Overriding them at render time would be a hand repair by another route, and it would hide those defects from the editing-workload measurement that § Purpose's research design depends on.
- So the 4.5 preview will show the 17 `ame` uses, §9.5's two imperatives and the two "Talist upp" until editors accept the suggestions.

### What was checked against the tree, and what was not

- **Checked:** every count above (by the script under *Re-measure*); the house value and its commit; the math-label self-map and the short-label allowlist; the segment ids named; and the render path: the para-title branch already calls `translateTitle(paraTitle)` in `tools/cnxml-render.js`, but `paraTitle` is the translated title while `TITLE_TRANSLATIONS` is keyed on the English, so the house value never matches and the MT text is rendered.
- **Not checked by running the renderer:** that last step is read from the code, and agrees with vefur's measurement that the rendered variants on published pages match the MT's. The rule-layer producer is not built on `main` (2026-10-28 record).

## Consequences

- **Item 1 needs a render change before 4.5**: the existing `translateTitle()` lookup keyed on the read-only source title instead of the translated one, reusing the house value, with a test that every worked-example "Check Your Learning" title in the source renders it and that no other para-title changes. The test should derive its own count: the source gives 290, 292 or 293 depending on the unit (exact `<title>` elements, extracted segments, matching lines). It belongs with the ② code batch (register §C201 tracks it).
- **Items 2–4 become three rulings for the rule layer** when it is built (the suggestion view, G1.23). The register tracks that work.
- **Scope:** chemistry only. The shared house value is not changed by this record; other books already inherit it for container titles, and any ruling for them is separate. Organic is out of scope (stopped, 2026-09-23).
- **Reversal is cheap and MT-neutral:** item 1 is one configuration value plus a re-render; items 2–4 are rule-layer rulings. The MT layer changes under none of them.
- **Forecloses:** render-time overrides for items 2–4, and localising `amu` inside formulas.

## Alternatives considered

1. **Kannaðu þekkingu þína** for item 1 — the most frequent form in both MT runs and what live readers see most (203 of 292 in June). Not chosen: the house value already exists, so Prófaðu keeps one value project-wide, and *prófa* names the self-test.
2. **Skoðaðu þekkingu þína** for item 1 — second most frequent in September (65); a weaker self-test cue.
3. **Item 1 as editor suggestions only** — readers would keep the 16 forms until editors accept 292 headings.
4. **ame** for item 2 — Icelandic initials; needs a render change for formulas, about 122 prose changes and new wording for the key term and the table.
5. **u** (the SI symbol) for item 2 — departs from the source's `amu` everywhere; the largest change.
6. **Imperatives everywhere** for item 3 — contradicts the "…geta:" lead-ins, which would need rewording too.
7. **Keep §9.5's imperatives** — grammatical there, since §9.5 has no lead-in; not chosen, because it leaves the one numbered section whose objectives differ in form from all the others.
8. **Nefnt** for item 4 — a looser rendering of "List" that differs from the four existing "Talið upp".
9. **Render-time overrides for items 2–4** — readers would see the ruled forms in the 4.5 preview, but each is a fix to MT text outside the editors' layer, against the 2026-11-05 ruling, and would have to be built before 4.5.

## Re-measure

Python 3, standard library only, run from an efni checkout root. It reads the segment files, never the published pages. For the June MT, extract that vintage first and pass its root as the second argument:
`git archive 9a69414d5 books/efnafraedi-2e/02-for-mt books/efnafraedi-2e/02-mt-output | tar -x -C /tmp/june`.

```sh
python3 - . <<'PY'
import pathlib, re, sys
from collections import Counter
SEG = re.compile(r'<!--\s*SEG:([^\s]+?)\s*-->')
def load(root, glob):  # distinct segment ids; a repeated id keeps its last body
    D = {}
    for f in sorted(pathlib.Path(root, 'books/efnafraedi-2e').glob(glob)):
        p = SEG.split(f.read_text('utf-8'))
        for i in range(1, len(p), 2): D[p[i]] = p[i + 1].strip()
    return D
root = sys.argv[1]
EN, IS = load(root, '02-for-mt/*/*-segments.en.md'), load(root, '02-mt-output/*/*-segments.is.md')
cyl = [k for k, v in EN.items() if v.rstrip('.').lower() == 'check your learning']
print('1.', len(cyl), 'CYL segments;', Counter(IS.get(k, '?') for k in cyl).most_common())
for w in ('amu', 'ame'):
    hit = {k: len(re.findall(rf'(?<![\w-]){w}(?![\w-])', v)) for k, v in IS.items()}
    hit = {k: n for k, n in hit.items() if n}
    print('2.', w, sum(hit.values()), 'uses in', len(hit), 'segments,', sorted({k.split(':')[0] for k in hit}))
items = {k: v for k, v in IS.items() if ':abstract-item:' in k and v}
imp = [k for k, v in items.items() if re.search(r'(aðu|[^a]ðu|du|tu)$', v.split()[0])]
print('3.', len(items), 'objectives; imperative-shaped first word:', imp, '(m68684 is a noun phrase)')
print('3.', Counter(v for k, v in IS.items() if ':abstract:' in k).most_common())
noleads = sorted({k.split(':')[0] for k in items} - {k.split(':')[0] for k in IS if ':abstract:' in k})
print('3. modules with objectives but no lead-in:', noleads)
print('4.', [(k, v[:40]) for k, v in items.items() if v.startswith(('Talist upp', 'Talið upp'))])
PY
```
