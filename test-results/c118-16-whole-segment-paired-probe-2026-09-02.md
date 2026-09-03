# Málstaður API Marker Survival Report — `POST /v1/translate`

**Generated:** 2026-09-02T13:53:37.663Z
**API Base:** https://api.malstadur.is

## Summary

| Metric | Value |
|--------|-------|
| Tests run | 1 |
| Total checks | 7 |
| Passed | 7 |
| Failed | 0 |
| API errors | 0 |
| Pass rate | 100.0% |
| Characters translated | 199 |
| Estimated cost | 2 ISK |
| Elapsed time | 8.9s |

## Marker Survival Matrix

| Marker Type | Survives? | Notes |
|-------------|-----------|-------|

## Recommended Approach

**Approach A: Direct segment translation (no protection needed)**

All markers survive the API intact. Segments can be sent directly without
the protect/unprotect cycle used for the web UI.

## Detailed Test Results

### ✅ T1.22: WHOLE-SEGMENT paired marker translates ([[docref]]word[[/docref]] alone in a segment) — §C118 ⑯

**Input:**
```
<!-- SEG:probe:item:1 -->
[[docref]]alcohol[[/docref]]

<!-- SEG:probe:item:2 -->
[[docref]]branched-chain alkane[[/docref]]

<!-- SEG:probe:para:3 -->
The [[term]]viscosity[[/term]] of a liquid is a measure of its resistance to flow.

<!-- SEG:probe:item:4 -->
alcohol

<!-- SEG:probe:item:5 -->
[[docref:alcohol|m00032#term-00006]]

```

**Output:**
```
<!-- SEG:probe:item:1 -->
[[docref]]alkóhól[[/docref]]

<!-- SEG:probe:item:2 -->
[[docref]]greinótt alkan[[/docref]]

<!-- SEG:probe:para:3 -->
[[term]]Seigja[[/term]] vökva er mælikvarði á viðnám hans gegn flæði.

<!-- SEG:probe:item:4 -->
alkóhól

<!-- SEG:probe:item:5 -->
[[docref:alcohol|m00032#term-00006]]
```

**Usage:** 199 characters, cost: 1.99

**Checks:**

- ✅ SUBJECT 1: whole-segment [[docref]] delimiters survive
- ✅ SUBJECT 1: whole-segment "alcohol" TRANSLATED between the delimiters
- ✅ SUBJECT 2: "branched-chain alkane" TRANSLATED (the label that blocks organic ch03)
- ✅ CONTROL: inline paired term still translates (harness + model unchanged)
- ✅ CONTROL: a bare one-word segment translates at all
- ✅ CONTROL: the COLON form still returns verbatim (the defect, reproduced)
- ✅ all five SEG markers survive
