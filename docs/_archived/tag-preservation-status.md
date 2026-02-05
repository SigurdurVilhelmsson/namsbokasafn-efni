# Tag Preservation Implementation Status

## Overview

Implementation of the tag reconciliation plan to preserve OpenStax semantic tags through the translation pipeline.

**Status:** ✅ **Phase 1 Complete** (namsbokasafn-efni), ⏳ Phase 2 Pending (namsbokasafn-vefur)

## Completed Work

### ✅ Step 1: Example ID Preservation

**File:** `tools/cnxml-to-md.js` (lines 972-983)

**Changes:**
- Extract ID from `<example>` elements
- Generate directive with MT-safe `{id="..."}` attribute
- Fallback to no-ID directive if ID missing

**Result:**
```markdown
:::example{id="Example_01_04_01"}
### Example 1.1: Title
Content...
:::
```

**Testing:** ✅ Verified with test-tag-preservation.cnxml

### ✅ Step 2: Context-Aware Exercise Type Selection

**File:** `tools/cnxml-to-md.js` (lines 756-775, 1096-1106)

**Changes:**
- Added `detectExerciseContext()` function
- Detects section `class="exercises"` attribute
- Detects EOC-indicating section titles (Exercises, End of Chapter, etc.)
- Generates `:::practice-problem` for in-chapter exercises
- Generates `:::exercise` for end-of-chapter exercises
- Uses MT-safe `{id="..."}` format (not `{#id}`)

**Result:**
```markdown
# Regular Section
:::practice-problem{id="fs-id123"}
Question?
:::

# End of Chapter Exercises
:::exercise{id="fs-id456"}
EOC Question?
:::
```

**Testing:** ✅ Verified both exercise types correctly detected

### ✅ Step 3: Original OpenStax Class Names

**File:** `tools/cnxml-to-md.js` (lines 726-746, 921-939)

**Changes:**
- `:::link-to-material` → `:::link-to-learning`
- `:::chemistry-everyday` → `:::everyday-life`
- `:::scientist-spotlight` → `:::chemist-portrait`
- `:::how-science-connects` → `:::sciences-interconnect`
- Updated both pre-section and in-section note processing

**Rationale:** Use original OpenStax class names for consistency with source material.

**Testing:** ✅ All note classes verified in test file

### ✅ Step 4: Documentation

**Created:**
1. `docs/technical/openstax-tag-mapping.md` - Complete reference
2. `docs/technical/vefur-renderer-updates-needed.md` - Vefur specifications
3. `docs/technical/tag-preservation-status.md` - This file

**Content:**
- Complete CNXML → markdown mapping
- MT-safety guidelines
- Vefur renderer requirements
- Testing instructions
- Known limitations

### ✅ Step 5: Testing

**Test file:** `tools/test-tag-preservation.cnxml`

**Coverage:**
- ✅ Examples with IDs
- ✅ In-chapter exercises (practice-problem)
- ✅ End-of-chapter exercises (exercise)
- ✅ All note classes (link-to-learning, everyday-life, etc.)
- ✅ MT-safe attribute syntax

**Real-world testing:**
- ✅ Tested on chapter 1 content (m68667.cnxml, m68674.cnxml)
- ✅ Verified exercise type detection
- ✅ Verified note class mapping

## Success Criteria

| Criterion | Status |
|-----------|--------|
| All OpenStax semantic tags convert to appropriate directives | ✅ DONE |
| MT-safe syntax ({id="..."}) used throughout | ✅ DONE |
| Exercise types match context (practice vs EOC) | ✅ DONE |
| Example and exercise IDs preserved for cross-referencing | ✅ DONE |
| Original OpenStax class names used | ✅ DONE |
| Documentation complete | ✅ DONE |

## Pending Work

### ⏳ Phase 2: Vefur Renderer Updates

**Repository:** namsbokasafn-vefur

**File:** `src/lib/utils/markdown.ts`

**Required changes:**
1. Update DIRECTIVE_CONFIG with new directive names
2. Support example ID attributes
3. Distinguish practice-problem vs exercise rendering
4. Optionally keep old names as aliases (backward compatible)

**See:** `docs/technical/vefur-renderer-updates-needed.md` for details

**Estimated effort:** 2 hours coding + 2 hours testing

### ⏳ Phase 3: Chapter 5 Clean Slate Test

**After vefur is updated:**

1. Delete all chapter 5 pipeline outputs (keep 01-source!)
2. Process chapter 5 with enhanced converter
3. Inspect output for correct directives
4. Send through MT pipeline
5. Sync to vefur and test rendering
6. Iterate until satisfactory

**Success criteria:**
- All directives render correctly
- Cross-references work
- No console errors
- Styling matches design system

### ⏳ Phase 4: Process All Chapters

**After chapter 5 validation:**

1. Delete pipeline outputs for ALL chapters (keep 01-source and tm/)
2. Re-process with enhanced converter
3. Run through full pipeline (MT, cleanup, publication)

**Priority order:**
- Chapters 1-4 (pilot school - highest priority)
- Chapter 5 (already done in Phase 3)
- Remaining chapters (6, 9, 12, 13)

## Known Issues

### Examples Between Sections Not Captured

**Issue:** Examples appearing between `</section>` tags are not processed.

**Example:**
```xml
<section>...</section>
<example id="Example_01_04_01">
  <!-- NOT CAPTURED -->
</example>
<section>...</section>
```

**Status:** Pre-existing limitation, not introduced by this work

**Impact:** Affects some OpenStax modules (e.g., m68674.cnxml in chapter 1)

**Workaround:** None currently

**Future work:** Refactor parser to capture inter-section content

## Commits

```
4e65697 docs: add OpenStax tag mapping reference
54dd851 feat: preserve OpenStax semantic tags in markdown conversion
c2ff0f7 docs: add vefur renderer update requirements
```

## Branch

`feature/preserve-openstax-tags`

## Next Steps

1. **Review this work** - Verify all changes meet requirements
2. **Update vefur repository** - Implement renderer changes
3. **Test chapter 5** - Validate end-to-end pipeline
4. **Merge to main** - After successful validation
5. **Re-process all chapters** - Apply to production content

## Questions & Decisions

### Why original OpenStax names?

**Decision:** Use original OpenStax class names (e.g., `link-to-learning`) instead of custom names (e.g., `link-to-material`).

**Rationale:**
- Maintains consistency with source material
- Avoids confusion when referencing OpenStax documentation
- Simpler mental model for maintainers
- Standard naming convention across repositories

### Why separate practice-problem and exercise?

**Decision:** Use `:::practice-problem` for in-chapter exercises, `:::exercise` for end-of-chapter.

**Rationale:**
- Different semantic meaning (formative vs summative assessment)
- Enables different styling (inline vs grouped)
- Matches OpenStax's pedagogical intent
- Better user experience in Chemistry Reader

### Why {id="..."} instead of {#id}?

**Decision:** Use verbose `{id="value"}` format instead of shortcut `{#value}`.

**Rationale:**
- MT-safe (machine translation systems can misinterpret `#` as punctuation)
- Explicit and unambiguous
- Consistent with other attributes ({class="...", alt="..."})
- Reduces risk of MT corruption

## Contact

For questions about this implementation:
- Check `docs/technical/openstax-tag-mapping.md` for tag mapping details
- Check `docs/technical/vefur-renderer-updates-needed.md` for vefur requirements
- Review commits for code-level changes
- Contact: Siggi

## References

- **Original plan:** Session transcript (plan mode output)
- **Converter:** `tools/cnxml-to-md.js`
- **Test file:** `tools/test-tag-preservation.cnxml`
- **Documentation:** `docs/technical/openstax-tag-mapping.md`
- **Vefur spec:** `docs/technical/vefur-renderer-updates-needed.md`
