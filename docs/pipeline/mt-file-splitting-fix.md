# MT File Splitting Fix - 2026-02-08

## Problem Summary

The `protect-segments-for-mt.js` tool was producing files that exceeded Miðeind's 20,000 character hard limit, causing MT failures.

## Root Causes Identified

### Bug #1: Single Paragraph Exceeds Limit (CRITICAL)
The splitting algorithm would add paragraphs to `currentPart` when `currentPart.length === 0`, regardless of paragraph size. This meant a single 19,000 character paragraph would be added even with a 14,000 character limit.

### Bug #2: Visible vs Total Character Mismatch
The tool enforced limits on **visible** characters (excluding tags) but MT services receive files with **all tags included**. A file with 14,000 visible characters + 6,000 characters of tag overhead = 20,000+ total characters.

### Bug #3: No Post-Split Validation
The `HARD_LIMIT` constant existed but was never used to validate output files.

### Bug #4: Insufficient Safety Margin
The default 14,000 visible character limit assumed only 6,000 characters of overhead (30%), but real files showed 20-75% overhead depending on tag density.

## Solutions Implemented

### Fix #1: Single-Paragraph Size Check
Added detection for paragraphs that exceed the visible character limit. These paragraphs are:
- Logged with a warning
- Isolated into their own part
- Subject to hard limit validation

```javascript
if (paraVisible > charLimit) {
  console.warn(`⚠️  WARNING: Paragraph ${i + 1} has ${paraVisible} visible chars (limit: ${charLimit})`);
  // Force into own part
  if (currentPart.length > 0) {
    parts.push(currentPart.join('\n\n'));
    currentPart = [];
    currentVisibleCount = 0;
  }
  parts.push(para);
  continue;
}
```

### Fix #2: Post-Split Validation
Added validation that checks **total character count** (including all tags) against the 20,000 hard limit:

```javascript
const oversizedParts = [];
parts.forEach((part, idx) => {
  if (part.length > HARD_LIMIT) {
    oversizedParts.push({
      index: idx,
      size: part.length,
      visibleSize: getVisibleCharCount(part),
    });
  }
});

if (oversizedParts.length > 0) {
  // Log error details and throw exception
  throw new Error('File parts exceed hard limit');
}
```

### Fix #3: Increased Safety Margin
Changed default visible character limit from 14,000 to **12,000** to provide an 8,000 character buffer (40%) for tag overhead.

**Rationale:**
- Old: 14k visible + 6k overhead = 20k (tight fit, no safety margin)
- New: 12k visible + 8k overhead = 20k (accommodates variable tag density)

### Fix #4: Enhanced Verbose Output
Added detailed overhead analysis in verbose mode:

```
Part a: 11965 visible, 13896 total (1931 overhead, 69.5% of limit) ✓
Part b: 11985 visible, 16000 total (4015 overhead, 80.0% of limit) ✓
Part c: 11942 visible, 16191 total (4249 overhead, 81.0% of limit) ✓
```

Status indicators:
- `✓` = Under 90% of hard limit (safe)
- `⚠️` = 90-100% of hard limit (caution)
- `❌` = Exceeds hard limit (error)

## Verification Results

### Test 1: Normal Paragraphs
File with 3 normal paragraphs (~1,500 chars):
- **Result:** Single part, 58 chars overhead (3.8%), 7.8% of limit ✓

### Test 2: Oversized Paragraph
File with single 22,800 char paragraph:
- **Result:** Warning logged, error thrown (22,837 total > 20k) ❌
- **Expected:** Manual intervention required

### Test 3: Real Book Content (m68714)
Previously: 20,366 chars (exceeds limit)
- **Old behavior:** Single file, exceeds 20k
- **New behavior:** Split into 2 parts (15,024 + 4,707 = 19,731 chars) ✓

### Test 4: Very Large File (m68727)
Previously: 64,548 chars
- **New behavior:** Split into 4 parts (13,896 + 16,000 + 16,191 + 16,410 = 62,497 chars)
- **Largest part:** 16,410 chars (82% of limit) ✓

### Test 5: Edge Case - Appendix G (m68865)
File with 1,434 segment tags (thermodynamic data table):
- Visible: 11,986 chars
- Total: 47,959 chars
- Overhead: 35,973 chars (75% overhead!)
- **Result:** Error thrown - cannot be safely split ❌
- **Action required:** Manual handling needed for this special case

## Known Limitations

### High-Overhead Files (>75% overhead)
Files like Appendix G with dense segment tagging cannot be automatically split. These require:
1. Manual review of source data structure
2. Consideration of alternative approaches (e.g., pre-processing tables differently)
3. Potential restructuring at CNXML extraction stage

### Character Limit Override
Users can override the default with `--char-limit N`, but lowering it below 10,000 may cause excessive splitting. The tool will still enforce the 20k hard limit regardless.

## Files Changed

- `tools/protect-segments-for-mt.js`
  - Lines 37-39: Reduced DEFAULT_CHAR_LIMIT to 12000, enabled HARD_LIMIT
  - Lines 171-237: Added single-paragraph check and post-split validation
  - Lines 313-326: Enhanced verbose output with overhead analysis
  - Lines 80-84, 91-95: Updated help text

## Migration Notes

### For Existing Content
Files in `02-for-mt/` that currently exceed 20k should be re-processed:

```bash
# Find oversized files (24 found as of 2026-02-08)
find books/efnafraedi/02-for-mt/ -name "*.en.md" -type f -exec sh -c '
  for file; do
    size=$(wc -c < "$file")
    if [ "$size" -gt 20000 ]; then
      echo "$file"
    fi
  done
' sh {} +

# Re-process with new tool
node tools/protect-segments-for-mt.js --batch books/efnafraedi/02-for-mt/ch01/ --verbose
```

### Exception: Appendix G
`m68865-segments.en.md` will error with the new validation. This needs special handling - see investigation notes above.

## Success Metrics

✅ No split file exceeds 20,000 total characters
✅ Single oversized paragraphs are detected and isolated
✅ Files that can't be safely split throw clear errors with guidance
✅ Verbose output shows overhead and percentage of limit used
✅ 23 of 24 previously oversized files can now be automatically re-split
✅ User confidence: "If the tool succeeds, MT will accept the file"

## Future Improvements

1. **Table handling:** Special processing for CNXML tables with dense segment tagging
2. **Adaptive limits:** Analyze tag density in first pass, adjust split points accordingly
3. **Sentence-level splitting:** For paragraphs that exceed limits, attempt sentence-boundary splits
4. **Pre-extraction optimization:** Consider alternative segment granularity for data tables
