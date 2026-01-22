# Translator Workflow Review: UI/UX Improvements for Small Teams

## Executive Summary

Review of the translation management system from a professional translator's perspective, identifying improvements for a 3-5 person team translating OpenStax Chemistry 2e from English to Icelandic.

**Key Finding:** The system is feature-rich but complex. A small team working chapter-by-chapter needs streamlined visibility and simpler workflows over sophisticated automation.

**Status:** ALL ITEMS COMPLETE (as of 2026-01-22)

---

## Current System Assessment

### Strengths
- Comprehensive 5-step pipeline (CNXML → MT → Pass 1 → TM → Pass 2 → Publication)
- Side-by-side editor with version history
- Terminology management with glossary
- Activity logging and audit trail
- Role-based permissions (reviewer, localizer, head editor)

### Pain Points for Small Teams
1. **Fragmented visibility** - Admin must check 4+ pages to understand status
2. **Implicit assignments** - No clear "assign to Helga" workflow
3. **Hidden guidance** - Editorial instructions in docs, not integrated in UI
4. **Scattered decisions** - Terminology, localization, and issue decisions in different places
5. **Complex issue tiers** - 4-tier classification (AUTO_FIX, EDITOR_CONFIRM, BOARD_REVIEW, BLOCKED) is overkill

---

## Prioritized Recommendations

### HIGH PRIORITY (Before January 2026 pilot)

#### 1. Unified Admin Dashboard - COMPLETE
**Problem:** Admin navigates Status → Reviews → Issues → Workflow to understand project state.

**Solution:** Create single "Mission Control" view with 3 panels:

| Panel | Content |
|-------|---------|
| **Needs Attention** | Pending reviews count, blocked issues, unassigned work |
| **Team Activity** | Last 24h activity feed - who worked on what |
| **Chapter Matrix** | 21×5 grid showing all chapters × stages, color-coded |

**Implementation completed:**
- `server/views/status.html` - Dashboard with tabs: Stjórnborð, Greining, Framvinduyfirlit, Tímalína
- `server/routes/status.js` - Aggregated data endpoints including `/api/status/dashboard` and `/api/status/analytics`

---

#### 2. Explicit Assignment Workflow - COMPLETE
**Problem:** No clear UI for "assign Chapter 3 Pass 1 to Helga."

**Solution:** Add assignment capability to dashboard:
1. Click any chapter/stage cell in matrix
2. Modal: "Assign to:" dropdown + optional due date
3. Assignee sees "My Tasks" on their view
4. Assignment logged to activity

**Implementation completed:**
- `server/views/assignments.html` - Visual chapter × stage matrix board
- `server/routes/workflow.js` - Added `/api/workflow/assignments/matrix` endpoint
- `server/services/assignmentStore.js` - JSON-based assignment storage
- `server/views/my-work.html` - "Mín verkefni" shows assigned tasks with priority sorting

---

#### 3. Contextual Editor Guidance - COMPLETE
**Problem:** New editors must read separate docs to understand Pass 1 vs Pass 2 expectations.

**Solution:** Add inline guidance panel to editor view:

**For Pass 1 (linguistic review):**
```
DO: Fix grammar, improve phrasing, check terminology
DON'T: Convert units, add Icelandic examples
When unsure: Add <!-- QUESTION: ... --> comment
```

**For Pass 2 (localization):**
```
NOW you can: Convert units, add Icelandic context
Use: Localization log to document each adaptation
Reference: /localize-chapter suggestions
```

**Implementation completed:**
- `server/views/editor.html` - Collapsible guidance panel with stage detection
- Auto-detects stage from URL param or data source directory
- Shows appropriate guidance for Pass 1 vs Pass 2

---

### MEDIUM PRIORITY (During pilot)

#### 4. Simplified Issue Resolution - COMPLETE
**Problem:** 4-tier classification creates decision paralysis.

**Solution:** Reduce to 2 tiers:
- **Quick Fix** (editor resolves inline) - merges AUTO_FIX + EDITOR_CONFIRM
- **Team Discussion** (weekly sync) - merges BOARD_REVIEW + BLOCKED

**Implementation completed:**
- `server/services/issueClassifier.js` - Added `SIMPLE_TIERS` mapping and `getSimpleTier()` function
- `server/views/issues.html` - Two-tab interface: "Fljótleg lagfæring" and "Umræða í hóp"
- Simple actions: "Leysa" (Resolve) or "Flytja í umræðu" (Flag for Discussion)

---

#### 5. Consolidated Decision Log - COMPLETE
**Problem:** Decisions scattered across terminology database, localization logs, issue resolutions.

**Solution:** Create unified `/decisions` page showing:
- Terminology decisions (from terminology routes)
- Localization choices (from localization logs)
- Issue resolutions (from issues store)

**Implementation completed:**
- `server/views/decisions.html` - Unified "Ákvarðanaskrá" page
- `server/routes/decisions.js` - API endpoints for decision logging
- Single searchable place for "why did we translate X as Y?"

---

#### 6. Progress Metrics - COMPLETE
**Problem:** Admin can't answer "Are we on track for January pilot?"

**Solution:** Add to dashboard:
- **Velocity:** "Last 7 days: 2.5 sections completed"
- **Projection:** "At current pace: Chapter 4 done in ~3 weeks"
- **Milestone tracker:** "Chapters 1-4 for pilot: 2/4 complete" with progress bar

**Implementation completed:**
- `server/routes/status.js` - Added `/api/status/analytics` with velocity, projections, burndown
- `server/views/status.html` - Analytics tab with velocity metrics, projections, pilot milestone tracker
- Team metrics and stage progress visualization

---

### LOW PRIORITY (After pilot)

#### 7. Navigation Simplification - COMPLETE
**Current:** 7+ nav items (Status, Workflow, Editor, Reviews, Issues, Terminology, Images...)

**Simplify to 5:**
1. **Mín verkefni** (My Work) - /my-work
2. **Stjórnborð** (Dashboard) - /status
3. **Ritstjóri** (Editor) - /editor
4. **Orðasafn** (Terminology) - /terminology
5. **Ákvarðanir** (Decisions) - /decisions

**Implementation completed:**
- Updated navigation in all 15 HTML view files
- Consistent 5-item nav across entire application
- Legacy pages (books, workflow, images) still accessible but not in main nav

---

#### 8. Align Status Schema with Workflow - COMPLETE
**Current:** status.json has 7 stages, docs describe 5 steps.

**Align to 5 stages:**
1. `enMarkdown` - Source prepared
2. `mtOutput` - MT received
3. `linguisticReview` - Pass 1 complete
4. `tmCreated` - TM via Matecat Align
5. `publication` - Published

**Implementation completed:**
- `schemas/chapter-status.schema.json` - Updated to document 5-step workflow as primary
- `templates/chapter-status.json` - Already uses 5-step schema
- `server/routes/status.js` - `PIPELINE_STAGES` and `STAGE_MAPPING` for backward compatibility
- Legacy stage names preserved for existing status.json files

---

## Implementation Roadmap

| Phase | Timeline | Items | Status |
|-------|----------|-------|--------|
| **A** | Before pilot | 1, 2, 3 | COMPLETE |
| **B** | During pilot | 4, 5, 6 | COMPLETE |
| **C** | After pilot | 7, 8 | COMPLETE |

---

## Key Files Modified

| Area | File | Changes |
|------|------|---------|
| Dashboard | `server/views/status.html` | Unified view with tabs |
| Assignments | `server/views/assignments.html` | NEW - Chapter assignment board |
| Assignments | `server/routes/workflow.js` | Added matrix endpoint |
| My Work | `server/views/my-work.html` | Simplified daily view |
| My Work | `server/routes/my-work.js` | Added /today endpoint |
| Editor guidance | `server/views/editor.html` | Collapsible guidance panel |
| Issues | `server/services/issueClassifier.js` | Added SIMPLE_TIERS |
| Issues | `server/views/issues.html` | Two-tab interface |
| Navigation | All 15 view files | Simplified to 5 items |
| Status schema | `schemas/chapter-status.schema.json` | Aligned with 5-step workflow |

---

## Verification Checklist

All items verified:
- [x] Admin can see full project status in one screen (status.html dashboard)
- [x] Assignments appear in assignee's editor view (my-work.html)
- [x] New editor sees stage-appropriate guidance without reading docs (editor.html)
- [x] "Why did we use this term?" answerable from single search (decisions.html)
- [x] Issue resolution takes fewer clicks (issues.html two-tab interface)
- [x] "Are we on track?" answerable from dashboard metrics (status.html analytics tab)

---

## Commits

1. `feat(my-work): add simplified daily view for translators`
2. `feat(assignments): add chapter assignment board for admin workflow`
3. `refactor(ui): simplify navigation and align status schema`
