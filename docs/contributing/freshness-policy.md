# Documentation Freshness Policy

This document defines how we maintain documentation accuracy after major project iterations.

## The Problem

Projects built iteratively with AI assistance tend to accumulate documentation drift:
- Old workflow docs describe deprecated processes
- Skills files reference outdated directory structures
- Core files (CLAUDE.md, ROADMAP.md) list completed work as current
- Three-way contradictions emerge (code vs docs vs skills)

**Result:** Every Claude Code session starts with incorrect context, leading to outdated suggestions.

## The Solution

Systematic freshness audits after every major iteration, following this checklist.

---

## After Every Major Iteration

A "major iteration" is a phase that changes workflow, architecture, or data formats. Examples:
- Workflow rebuild (docx → web editor)
- Pipeline architecture change (markdown → HTML)
- New feature area (terminology system, localization editor)

### Immediate Actions (Same Day)

**1. Update CLAUDE.md**
- [ ] Update "Current Priority" section to next phase
- [ ] Mark completed phase with ✅ COMPLETE and date
- [ ] Verify pipeline table reflects current tools
- [ ] Check commands table for deprecated commands
- [ ] Review skills table for accuracy

**2. Update ROADMAP.md**
- [ ] Mark phase as COMPLETE with date
- [ ] Update "Active Development" section
- [ ] Update "Next Steps" / "Current Priority"
- [ ] Add decision log entry if architecture changed

**3. Update CHANGELOG.md**
- [ ] Create version entry for the phase
- [ ] List all new features/tools/endpoints
- [ ] List deprecated/removed tools
- [ ] Document breaking changes

**4. Update STATUS.md**
- [ ] Update last updated date
- [ ] Update current phase/focus
- [ ] Add entry to recent updates table

### Within One Week

**5. Review Claude Code Skills**

Check each skill in `.claude/skills/`:
- [ ] Does it reference the CURRENT workflow? (Extract-Inject-Render, CNXML→HTML)
- [ ] Does it reference OLD workflow? (markdown assembly, docx conversion, 8-step pipeline)
- [ ] Update or archive accordingly

Example checklist for each skill:
```bash
# List all skills
ls -1 .claude/skills/*.md

# For each skill, ask:
# - Pipeline stages: current or old?
# - Directory structure: current or old?
# - Tools referenced: active or archived?
# - File formats: segments (.md) or docx?
```

**6. Audit Documentation Directory**

For each file in `docs/`:
```bash
find docs/ -name "*.md" -not -path "docs/_archived/*" | sort
```

Classify each as:
- ✅ **CURRENT** - Reflects current state, no changes needed
- ⚠️ **STALE** - Partially outdated, needs updates
- ❌ **OBSOLETE** - Describes old workflow, should be archived
- 🔀 **CONTRADICTS** - Conflicts with another document

**Archiving process:**
1. Move to `docs/_archived/`
2. Add archive header comment:
   ```markdown
   <!-- ARCHIVED: YYYY-MM-DD - [reason]. Moved from [original path]. -->
   ```
3. Update cross-references in active docs

**7. Clean Up Tools**

- [ ] Move deprecated tools to `tools/_archived/`
- [ ] Remove dead npm scripts from `package.json`
- [ ] Update `tools/_archived/README.md` if needed
- [ ] Verify active tools are documented in `docs/technical/cli-reference.md`

**8. Server Documentation**

- [ ] Regenerate API documentation: `npm run docs:generate`
- [ ] Update `server/README.md` if feature set changed significantly
- [ ] Update `docs/technical/architecture.md` if system design changed

---

## Quarterly Review (Every ~3 Months)

Even without major iterations, do a lighter freshness sweep:

### Find Stale Files
```bash
# Files not modified in 90 days
find docs/ -name "*.md" -not -path "_archived/*" -mtime +90

# Review each for accuracy
```

### Review Core Files
- [ ] CLAUDE.md - Is "Current Priority" still accurate?
- [ ] ROADMAP.md - Any phases completed that aren't marked?
- [ ] STATUS.md - Update last modified date, current status
- [ ] README.md - Links still valid? Features list current?

### Check for New Contradictions
- [ ] Search for domain name references (old vs new)
- [ ] Search for old tool names in active docs
- [ ] Check skills files match current workflow

### Update Archive READMEs
- [ ] `tools/_archived/README.md` - List complete?
- [ ] `docs/_archived/README.md` - All archived docs explained?

---

## Detection: How to Know When Docs Are Stale

### Symptoms
- Claude Code suggestions reference deprecated tools
- Claude Code skills describe non-existent directories
- Multiple docs give conflicting instructions
- Current phase marked as "upcoming" in ROADMAP.md
- CHANGELOG.md last entry is months old

### Prevention
- Set calendar reminder for quarterly review
- Include freshness audit in phase completion checklist
- Review CLAUDE.md before starting each major phase

---

## Quick Reference: Key Files to Update

| File | Update Frequency | What to Check |
|------|------------------|---------------|
| CLAUDE.md | After every phase | Current priority section |
| ROADMAP.md | After every phase | Phase completion status, active development |
| STATUS.md | Monthly | Last updated date, current focus |
| CHANGELOG.md | After every release | Version entries, deprecations |
| .claude/skills/*.md | After workflow changes | Pipeline stages, directory structure, tools |
| docs/workflow/*.md | After workflow changes | Step-by-step instructions, tool names |
| docs/technical/architecture.md | After architecture changes | System diagram, component descriptions |

---

## Archive vs Update vs Delete

**Archive when:**
- Document describes a workflow that no longer exists
- Tools referenced are all in `tools/_archived/`
- Superseded by a newer document
- Historical value for migration reference

**Update when:**
- Core concepts still apply, just details changed
- Referenced tools mostly still active
- Structure/examples need modernization
- Still serves its intended purpose

**Delete when:**
- Duplicate of another document
- Placeholder never filled in
- Factually wrong with no historical value
- Confusing and not salvageable

---

## Example: Post-Phase 8 Audit Checklist

This is what the Phase 8 completion audit looked like (completed 2026-02-08):

**Core Files:**
- [x] CLAUDE.md: Updated current priority (Phase 8 → Phase 9)
- [x] ROADMAP.md: Marked Phase 8 COMPLETE (2026-02-05)
- [x] STATUS.md: Updated current focus to Phase 9
- [x] CHANGELOG.md: Added [0.5.0] entry with Phase 8 features

**Skills Files:**
- [x] workflow-status.md: Updated from 8-step to Extract-Inject-Render
- [x] repo-structure.md: Removed docx references, added segment files
- [x] editorial-pass1.md: Updated for segment editor workflow

**Documentation:**
- [x] Archived: `vefur-renderer-updates-needed.md` (superseded)
- [x] Archived: `openstax-tag-mapping.md` → `openstax-tag-mapping-markdown.md`
- [x] Created: `docs/_archived/README.md`
- [x] Created: `tools/_archived/README.md`
- [x] Updated: `server/README.md` (added API reference note)

**Contradictions Resolved:**
- [x] Caddy vs nginx: Updated CLAUDE.md to match deployment checklist (Caddy)

**Result:** 79% of docs (19/24) were CURRENT after audit. Only 2 needed archiving.

---

## Maintenance Responsibility

- **Phase Lead:** Triggers post-iteration audit
- **All Contributors:** Flag stale docs when found
- **Regular Contributor:** Owns quarterly review

The goal is to make freshness maintenance a habit, not a crisis response.
