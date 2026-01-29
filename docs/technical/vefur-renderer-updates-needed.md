# Vefur Renderer Updates Needed

## Summary

The `namsbokasafn-efni` converter has been updated to use original OpenStax class names as directive names. The `namsbokasafn-vefur` renderer must be updated to support these new directive names.

## Required Changes

### File: `namsbokasafn-vefur/src/lib/utils/markdown.ts`

Update the `DIRECTIVE_CONFIG` object to support new directive names.

### Directive Name Changes

| Old Name | New Name | Status |
|----------|----------|--------|
| `link-to-material` | `link-to-learning` | ⚠️ MUST UPDATE |
| `chemistry-everyday` | `everyday-life` | ⚠️ MUST UPDATE |
| `scientist-spotlight` | `chemist-portrait` | ⚠️ MUST UPDATE |
| `how-science-connects` | `sciences-interconnect` | ⚠️ MUST UPDATE |
| `summary` | `summary` | ✅ No change |
| `key-equations` | `key-equations` | ✅ No change |
| `key-concepts` | `key-concepts` | ✅ No change |
| `practice-problem` | `practice-problem` | ✅ No change |
| `exercise` | `exercise` | ⚠️ ENHANCED (now has proper context detection) |
| `example` | `example` | ⚠️ ENHANCED (now has ID attributes) |

### Implementation Approach

**Option 1: Replace old names (breaking change)**
```typescript
const DIRECTIVE_CONFIG = {
  'link-to-learning': {
    icon: '🔗',
    title: 'Tengill að námsefni',
    color: 'blue'
  },
  'everyday-life': {
    icon: '🌟',
    title: 'Efnafræði í daglegu lífi',
    color: 'purple'
  },
  // ... etc
}
```

**Option 2: Add new names and keep old as aliases (backward compatible)**
```typescript
const DIRECTIVE_CONFIG = {
  // New names (preferred)
  'link-to-learning': {
    icon: '🔗',
    title: 'Tengill að námsefni',
    color: 'blue'
  },
  'everyday-life': {
    icon: '🌟',
    title: 'Efnafræði í daglegu lífi',
    color: 'purple'
  },

  // Old names (deprecated, kept for backward compatibility)
  'link-to-material': {
    icon: '🔗',
    title: 'Tengill að námsefni',
    color: 'blue'
  },
  'chemistry-everyday': {
    icon: '🌟',
    title: 'Efnafræði í daglegu lífi',
    color: 'purple'
  },
  // ... etc
}
```

**Recommendation:** Use Option 2 initially, then remove aliases after all content is re-processed.

### New Directive Support

#### Example Directive with ID Attributes

**Markdown input:**
```markdown
:::example{id="Example_01_04_01"}
### Example 1.1: Calculation of Density

Content here...

:::
```

**Expected rendering:**
- Render with example styling (yellow background, icon)
- Parse `id="..."` attribute for anchor link
- Support cross-references to this ID

#### Exercise Type Distinction

**In-chapter (practice-problem):**
```markdown
:::practice-problem{id="fs-idm68837632"}
Question content...

:::answer
Answer content...

:::
:::
```

**End-of-chapter (exercise):**
```markdown
:::exercise{id="fs-idm68837632"}
Question content...

:::
```

**Note:** Both should render differently:
- Practice problems: Orange styling, inline in content flow
- Exercises: Blue styling, possibly grouped/numbered

### Testing Checklist

After updating vefur, verify:

- [ ] `:::link-to-learning` renders with blue icon
- [ ] `:::everyday-life` renders with purple icon
- [ ] `:::chemist-portrait` renders with teal icon
- [ ] `:::sciences-interconnect` renders with green icon
- [ ] `:::example{id="..."}` renders with ID attribute in DOM
- [ ] `:::practice-problem` renders with orange styling
- [ ] `:::exercise` renders with blue styling (distinct from practice-problem)
- [ ] Old directive names still work (if using backward-compatible approach)
- [ ] Cross-references to example IDs work
- [ ] No console errors
- [ ] All styling matches design system

### Migration Plan

1. **Update vefur renderer** with new directive names (Option 2: keep aliases)
2. **Test with existing content** (chapters 1-4 that use old names)
3. **Re-process chapter 5** using enhanced converter
4. **Validate chapter 5** rendering in vefur
5. **If successful, re-process all chapters** (1-4, 6, 9, 12, 13)
6. **Remove aliases** from vefur after all content updated

### Timeline

**Priority:** HIGH - Required before processing new content with enhanced converter.

**Estimated effort:**
- Vefur code changes: 1 hour
- Testing: 1 hour
- Chapter 5 validation: 2 hours

**Total:** ~4 hours

## Reference

- **Efni converter:** `namsbokasafn-efni/tools/cnxml-to-md.js`
- **Tag mapping docs:** `namsbokasafn-efni/docs/technical/openstax-tag-mapping.md`
- **Vefur renderer:** `namsbokasafn-vefur/src/lib/utils/markdown.ts`
- **Content format docs:** `namsbokasafn-vefur/docs/content-format.md` (also needs updating)

## Questions?

Contact: Siggi (or check this repository's documentation)
