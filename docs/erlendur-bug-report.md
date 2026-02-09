# Erlendur Bug Report: Inconsistent Tag Stripping

**Date:** 2026-02-03
**Reporter:** Siggi (namsbokasafn-efni project)
**Erlendur Version:** Current production (malstadur.is)

## Summary

When translating markdown files containing `{{...}}` placeholder tags, Erlendur strips these tags from the first portion of larger files while preserving them in the latter portion. Smaller files work correctly.

## Use Case

We are translating OpenStax chemistry textbook content from English to Icelandic. Our workflow uses placeholder tags to preserve segment alignment for translation memory:

```markdown
{{SEG:m68724:para:fs-idm1147904}}
How much heat, in joules, must be added to a 502 g iron skillet...
```

These `{{SEG:...}}` tags mark segment boundaries and must survive translation unchanged to maintain alignment between source and target texts.

## Observed Behavior

### File that works correctly (small file)

**File:** `m68723-segments.en.md`
**Size:** 1,907 bytes (1,629 visible characters)
**SEG tags:** 7
**Result:** ✅ All `{{SEG:...}}` tags preserved in output

### File with inconsistent behavior (larger file)

**File:** `m68724-segments(b).en.md`
**Size:** 14,192 bytes (10,454 visible characters)
**SEG tags:** 92
**Result:** ⚠️ Tags stripped from lines 1-149, preserved from line 151 onward

#### Boundary details

| Metric | Lines 1-149 (tags stripped) | Lines 150+ (tags preserved) |
|--------|----------------------------|----------------------------|
| Total bytes | 8,863 | 5,328 |
| Visible chars | 6,962 | 3,491 |
| SEG tags | 50 | 42 |
| Tag overhead | 21.4% | 34.5% |

#### Example at boundary

**Input (lines 148-152):**
```markdown
{{SEG:m68724:problem:fs-idm3366864}}
If 14.5 kJ of heat were added to 485 g of liquid water, how much would its temperature increase?

{{SEG:m68724:solution:fs-idp36304960}}
7.15 °C
```

**Output:**
```markdown
Ef 14,5 kJ af varma væri bætt við 485 g af fljótandi vatni, hversu mikið myndi hitastig þess hækka?

{{SEG:m68724:solution:fs-idp36304960}}
7,15 °C
```

Note: The tag on line 148 (`fs-idm3366864`) is stripped, but the tag on line 151 (`fs-idp36304960`) is preserved.

## Analysis Performed

We verified:
- ✅ Tag format is identical throughout the file (`{{SEG:module:type:id}}`)
- ✅ No special characters or encoding issues at the boundary
- ✅ No unusual whitespace or control characters
- ✅ Line endings are consistent (Unix LF)
- ✅ UTF-8 encoding with standard characters (degree symbol °, multiplication ×)

The boundary at ~8,900 bytes / line 149 does not correspond to any obvious limit (not a power of 2, not 10,000, etc.).

## Expected Behavior

All `{{...}}` placeholder tags should be preserved in the output, regardless of their position in the file. The curly bracket syntax was specifically chosen because:
1. It's not standard markdown syntax
2. It doesn't conflict with translation content
3. It was expected to pass through unchanged

## Workaround Attempted

We initially tried `[[SEG:...]]` syntax with double square brackets, but Erlendur strips these entirely. The `{{...}}` syntax works for smaller files and the latter portion of larger files.

## Attached Files

1. `m68723-segments.en.md` - Small file that works correctly
2. `m68724-segments(b).en.md` - Larger file with inconsistent behavior
3. `m68724-segments(b).is.md` - Translation output showing the issue

## Request

Please investigate why placeholder tags are stripped inconsistently based on their position in larger files. A consistent behavior (either preserve all tags or strip all tags) would allow us to design our workflow accordingly.

## Contact

[Your contact information]
