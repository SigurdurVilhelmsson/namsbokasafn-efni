---
name: workflow-status
description: Understand and manage translation workflow status. Triggers when discussing project progress, chapter status, workflow steps, or next actions.
---

# Workflow Status Management

## Current Pipeline (Extract-Inject-Render)

| Step | Stage | Tool | Output | Key Output |
|------|-------|------|--------|------------|
| 1a | Extraction | cnxml-extract.js | 02-for-mt/ | EN segments (.md) |
| 1b | MT Prep | protect-segments-for-mt.js | 02-for-mt/ | Protected segments |
| 2 | MT | malstadur.is (manual) | 02-mt-output/ | IS segments (.md) |
| 3 | Review | /segment-editor | 03-faithful/ | Reviewed segments |
| 4 | TM | prepare-for-align.js + Matecat Align | tm/ | Human-verified TM |
| 5a | Injection | cnxml-inject.js | 03-translated/ | Translated CNXML |
| 5b | Rendering | cnxml-render.js | 05-publication/ | Semantic HTML |

## Status Values

For `status.json` files (in `books/{book}/chapters/ch{NN}/`):

| Status | Meaning |
|--------|---------|
| `complete` | Stage finished |
| `in-progress` | Currently being worked on |
| `pending` | Waiting to start |
| `not-started` | Not yet begun |

## Current Pipeline Stages

As defined in `server/services/session.js` and tracked in `status.json`:

```
extraction → mtReady → mtOutput → linguisticReview → tmCreated → injection → rendering → publication
```

**Stage definitions:**
- `extraction` - CNXML parsed, segments extracted
- `mtReady` - Segments protected for MT (tags preserved)
- `mtOutput` - MT segments received from malstadur.is
- `linguisticReview` - Pass 1 faithful translation reviewed
- `tmCreated` - TM created via Matecat Align
- `injection` - Translations injected back into CNXML
- `rendering` - HTML rendered from translated CNXML
- `publication` - Published to web (namsbokasafn-vefur)

## CLI Commands

```bash
# Update status
npm run update-status <book> <chapter> <stage> <status> [options]

# Examples
npm run update-status efnafraedi 3 linguisticReview complete
npm run update-status efnafraedi 3 rendering in-progress
npm run update-status efnafraedi 3 publication complete --version "v1.0"

# Validate
npm run validate
npm run validate efnafraedi
```

## Status File Locations

- Chapter status: `books/{book}/chapters/ch{NN}/status.json`
- Book status: `books/{book}/STATUS.md`
- Project status: `STATUS.md`, `ROADMAP.md`
- Activity log: `logs/activity-log.md`

## Workflow Dependencies

Each stage requires previous stages to be complete:

```
extraction → mtReady → mtOutput → linguisticReview → tmCreated → injection → rendering → publication
```

**Critical path:** Linguistic review (Pass 1) must be complete before TM creation, so the TM contains human-verified translations, not raw MT output.

Don't skip stages. If a stage isn't complete, earlier work may need to be done first.

## Web Interfaces

- **Workflow wizard:** `/workflow` - Step-by-step guided workflow
- **Segment editor:** `/segment-editor` - Pass 1 linguistic review
- **Localization editor:** `/localization-editor` - Pass 2 localization
- **Status dashboard:** `/status` - Chapter progress overview

## Publication Tracks

Three tracks for progressive publication:

| Track | Requirement | Output |
|-------|-------------|--------|
| `mt-preview` | MT output only | For immediate early access |
| `faithful` | Pass 1 review complete | Academically citable |
| `localized` | Pass 2 review complete | Fully localized for students |
