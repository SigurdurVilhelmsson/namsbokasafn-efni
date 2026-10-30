# Workflow diagrams, 2026-10-30

> 🧊 **Dated snapshot, frozen 2026-10-30. Evidence, never status.** What is next, blocked or shipped lives in the
> active register's ⏩ RESUME block. If these pictures disagree with the register or with the code, the register and
> the code win.

Four diagrams of the textbook translation and editing workflow, for presentations and onboarding, each in English
and Icelandic (`<name>.svg` and `<name>.is.svg`). Spoken notes for each diagram, in both languages, are in
`talking-points.md`.

| File | Shows |
|---|---|
| `now-overview.svg` | The workflow as the code runs it today, in six steps, for a general audience |
| `now-technical.svg` | The same, with the `books/<slug>/` folders, tools, Ritstjóri tables and the delivery path |
| `plan-overview.svg` | The workflow the development plan proposes for the follow-on project year, with a 12-month timeline |
| `plan-technical.svg` | The same, with the text layers, the ruling set, the three gates and work packages B1–B3, C and D |

**Sources.** *Now:* `main` at `1bb58484` and `docs/workflow/simplified-workflow.md`. *Planned:*
`docs/plans/2026-10-10-chemistry-finish-preparation-plan.md` (§4 layers, §5 stages),
`docs/plans/2026-10-23-skerfur-development-plan.md` (rev. 2: §3 gates, §4 B1–B3 and C, §5 publishing and releases),
and the decision records of 2026-10-26 to 2026-10-28 (suggestions, not starting text). Decisions still open in those
plans can change the planned diagrams.

**Editing.** The SVGs are generated. Change `build_diagrams.py` and run `python3 build_diagrams.py <out-dir> en`,
then again with `is`. Each run writes a standalone SVG (light theme, for slides) and a classed `.inline.svg` (for a
themed web page) per diagram; only the standalone files are committed. The Icelandic text is in `strings_is.py`, keyed
by the exact English string. A string with no entry is printed as it is, which is intended for file paths and tool
names. So when you change an English label, change its key in `strings_is.py` too, or the Icelandic diagram falls
back to English for that label.
