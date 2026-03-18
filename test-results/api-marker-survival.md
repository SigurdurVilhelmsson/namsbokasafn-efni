# Málstaður API Marker Survival Report

**Generated:** 2026-03-18T09:30:56.859Z
**API Base:** https://api.malstadur.is

## Summary

| Metric | Value |
|--------|-------|
| Tests run | 22 |
| Total checks | 73 |
| Passed | 72 |
| Failed | 1 |
| API errors | 0 |
| Pass rate | 98.6% |
| Characters translated | 1,420 |
| Estimated cost | 7 ISK |
| Elapsed time | 157.2s |

## Marker Survival Matrix

| Marker Type | Survives? | Notes |
|-------------|-----------|-------|
| HTML comments (<!-- -->) | ✅ Yes | Intact |
| Double brackets ([[MATH:N]]) | ✅ Yes | Intact |
| Curly brackets ({{SEG:...}}) | ✅ Yes | Intact |
| Term markers (__term__) | ✅ Yes | Intact |
| Markdown links ([text](url)) | ✅ Yes | Intact |
| Cross-references ([#ref-id]) | ✅ Yes | Intact |
| Super/subscript (^sup^, ~sub~) | ✅ Yes | Intact |
| Other placeholders ([[BR]], [[SPACE]], [[MEDIA]]) | ✅ Yes | Intact |
| Protected markers ({{TERM}}, {{LINK}}, {{XREF}}) | ✅ Yes | Intact |

## Recommended Approach

**Approach A: Direct segment translation (no protection needed)**

All markers survive the API intact. Segments can be sent directly without
the protect/unprotect cycle used for the web UI.

## Detailed Test Results

### ✅ T1.1: Plain text baseline

**Input:**
```
Chemistry is the study of matter and its properties.
```

**Output:**
```
Efnafræði er fræðigrein sem fjallar um efni og eiginleika þess.
```

**Usage:** 52 characters, cost: 0.52

**Checks:**

- ✅ Returns Icelandic text

### ✅ T1.2: HTML comment survival

**Input:**
```
<!-- SEG:m68663:para:1 --> Chemistry is the study of matter.
```

**Output:**
```
<!-- SEG:m68663:para:1 --> Efnafræði er fræðigreinin um efni.
```

**Usage:** 34 characters, cost: 0.34

**Checks:**

- ✅ <!-- --> comment survives
- ✅ SEG tag content intact

### ✅ T1.3: Double bracket survival ([[MATH:N]])

**Input:**
```
The value is [[MATH:1]] times greater than [[MATH:2]] units.
```

**Output:**
```
Gildið er [[MATH:1]] sinnum hærra en [[MATH:2]] einingar.
```

**Usage:** 60 characters, cost: 0.6

**Checks:**

- ✅ [[MATH:1]] survives
- ✅ [[MATH:2]] survives
- ✅ No backslash escaping
- ✅ No single-bracket collapse

### ✅ T1.4: Curly bracket survival ({{SEG:...}})

**Input:**
```
{{SEG:m68663:para:1}} Chemistry is the study of matter.
```

**Output:**
```
{{SEG:m68663:para:1}} Efnafræði er fræðigrein sem fjallar um efni.
```

**Usage:** 55 characters, cost: 0.55

**Checks:**

- ✅ {{SEG:...}} survives
- ✅ No backslash escaping

### ✅ T1.5: Markdown formatting (__term__, *italic*, **bold**)

**Input:**
```
The __molecule__ has *specific* **properties** in chemistry.
```

**Output:**
```
__Sameindin__ hefur *sérstaka* **eiginleika** í efnafræði.
```

**Usage:** 60 characters, cost: 0.6

**Checks:**

- ✅ __term__ markers survive
- ✅ *italic* survives
- ✅ **bold** survives
- ✅ No underscore escaping

### ✅ T1.6: Markdown links ([text](url))

**Input:**
```
See [Table 1.1](#fs-idm81346144) for details about [chemistry](http://openstax.org/l/16plasma).
```

**Output:**
```
Sjá nánari upplýsingar um [efnafræði](http://openstax.org/l/16plasma) í [töflu 1.1](#fs-idm81346144).
```

**Usage:** 95 characters, cost: 0.9500000000000001

**Checks:**

- ✅ [text](#anchor) survives
- ✅ [text](url) survives
- ✅ Anchor #fs-idm81346144 intact
- ✅ URL intact

### ✅ T1.7: Cross-references ([#ref-id])

**Input:**
```
The data is shown in [#CNX_Chem_01_02_StatesMatt] and also in [#CNX_Chem_01_02_Plasma].
```

**Output:**
```
Gögnin eru sýnd í [#CNX_Chem_01_02_StatesMatt] og einnig í [#CNX_Chem_01_02_Plasma].
```

**Usage:** 87 characters, cost: 0.87

**Checks:**

- ✅ [#ref] format survives
- ✅ First ref ID intact
- ✅ Second ref ID intact

### ✅ T1.8: Superscript/subscript (^sup^ and ~sub~)

**Input:**
```
Water is H~2~O and the rate is 10^5^ per second. CO~2~ is also 2.98 × 10^−6^ kg.
```

**Output:**
```
Vatn er H~2~O og hraðinn er 10^5^ á sekúndu. CO~2~ er einnig 2,98 × 10^−6^ kg.
```

**Usage:** 80 characters, cost: 0.8

**Checks:**

- ✅ ~subscript~ survives
- ✅ ^superscript^ survives
- ✅ H~2~O pattern intact
- ✅ 10^5^ pattern intact

### ✅ T1.9: Other placeholders ([[BR]], [[SPACE]], [[MEDIA:N]])

**Input:**
```
First line[[BR]]Second line with [[SPACE]] extra space and [[MEDIA:3]] image.
```

**Output:**
```
Fyrsta lína[[BR]]Önnur lína með[[SPACE]]auka bili og[[MEDIA:3]]mynd.
```

**Usage:** 77 characters, cost: 0.77

**Checks:**

- ✅ [[BR]] survives
- ✅ [[SPACE]] survives
- ✅ [[MEDIA:3]] survives

### ✅ T1.10: Protected format markers ({{TERM}}, {{LINK:N}}, {{XREF:N}})

**Input:**
```
A {{TERM}}molecule{{/TERM}} is described in {{LINK:1}}Table 1{{/LINK}} and {{XREF:2}} shows more.
```

**Output:**
```
{{TERM}}Sameind{{/TERM}} er lýst í {{LINK:1}}töflu 1{{/LINK}} og {{XREF:2}} sýnir nánar.
```

**Usage:** 97 characters, cost: 0.97

**Checks:**

- ✅ {{TERM}}...{{/TERM}} survives
- ✅ {{LINK:1}}...{{/LINK}} survives
- ✅ {{XREF:2}} survives

### ❌ T1.11: Mixed real-world segment (complex)

**Input:**
```
<!-- SEG:m68674:para:1 --> The mass is 2.98 [[MATH:1]] 10^5^ kg. __Units__ are listed in [#fs-idm81346144]. See [Table 1.1](http://example.com) for the H~2~O data.
```

**Output:**
```
<!-- SEG:m68674:para:1 --> Massinn er 2,98 [[MATH:1]] 10^5^ kg. __Einingar__ eru taldar upp í [#fs-idm81346144]. Sjá [Töflu 1.1](http://example.com) fyrir H₂O-gögnin.
```

**Usage:** 137 characters, cost: 1.37

**Checks:**

- ✅ SEG comment survives
- ✅ [[MATH:1]] survives
- ✅ ^5^ survives
- ✅ __term__ survives
- ✅ [#ref] survives
- ✅ [text](url) survives
- ❌ ~2~ survives

### ✅ T1.12: Glossary effectiveness

**Input:**
```
The molecule has a specific molar mass. An atom bonds with another element to form an acid.
```

**Output:**
```
Sameindin hefur ákveðinn mólmassa. Atóm tengist öðru frumefni til að mynda sýru.
```

**Usage:** 91 characters, cost: 0.91

**Checks:**

- ✅ "sameind" used for molecule
- ✅ "mólmassi" used for molar mass
- ✅ "atóm" used for atom
- ✅ "frumefni" used for element
- ✅ "sýra" used for acid

### ✅ T1.13: Multi-paragraph segment with SEG tags

**Input:**
```
<!-- SEG:m68664:title:auto-1 -->
Chemistry in Context

<!-- SEG:m68664:abstract:auto-2 -->
By the end of this section, you will be able to:

<!-- SEG:m68664:abstract-item:abstract-item-1 -->
Outline the historical development of chemistry

<!-- SEG:m68664:para:fs-idp77567568 -->
Throughout human history, people have tried to convert matter into more useful forms.
```

**Output:**
```
<!-- SEG:m68664:title:auto-1 -->
Efnafræði í samhengi

<!-- SEG:m68664:abstract:auto-2 -->
Í lok þessa kafla muntu geta:

<!-- SEG:m68664:abstract-item:abstract-item-1 -->
Gert grein fyrir sögulegri þróun efnafræðinnar

<!-- SEG:m68664:para:fs-idp77567568 -->
Í gegnum mannkynssöguna hefur fólk reynt að umbreyta efni í nytsamlegra form.
```

**Usage:** 210 characters, cost: 2.1

**Checks:**

- ✅ All 4 SEG tags survive
- ✅ Paragraph structure preserved
- ✅ Title SEG tag present
- ✅ Para SEG tag present

### ✅ T2.m68663.1: Real segment: m68663:title:auto-1 (simple)

**Input:**
```
<!-- SEG:m68663:title:auto-1 -->
Introduction
```

**Output:**
```
<!-- SEG:m68663:title:auto-1 -->
Inngangur
```

**Usage:** 13 characters, cost: 0.13

**Checks:**

- ✅ SEG tag survives
- ✅ Output is Icelandic
- ✅ No marker corruption

### ✅ T2.m68663.2: Real segment: m68663:abstract-item:abstract-item-1 (simple)

**Input:**
```
<!-- SEG:m68663:abstract-item:abstract-item-1 -->
Chemistry in Context
```

**Output:**
```
<!-- SEG:m68663:abstract-item:abstract-item-1 -->
Efnafræði í samhengi
```

**Usage:** 21 characters, cost: 0.21

**Checks:**

- ✅ SEG tag survives
- ✅ Output is Icelandic
- ✅ No marker corruption

### ✅ T2.m68663.3: Real segment: m68663:abstract-item:abstract-item-2 (simple)

**Input:**
```
<!-- SEG:m68663:abstract-item:abstract-item-2 -->
Phases and Classification of Matter
```

**Output:**
```
<!-- SEG:m68663:abstract-item:abstract-item-2 -->
Hamfarir og flokkun efnis
```

**Usage:** 36 characters, cost: 0.36

**Checks:**

- ✅ SEG tag survives
- ✅ Output is Icelandic
- ✅ No marker corruption

### ✅ T2.m68674.1: Real segment: m68674:title:auto-1 (medium)

**Input:**
```
<!-- SEG:m68674:title:auto-1 -->
Measurements
```

**Output:**
```
<!-- SEG:m68674:title:auto-1 -->
Mælingar
```

**Usage:** 13 characters, cost: 0.13

**Checks:**

- ✅ SEG tag survives
- ✅ Output is Icelandic
- ✅ No marker corruption

### ✅ T2.m68674.2: Real segment: m68674:abstract:auto-2 (medium)

**Input:**
```
<!-- SEG:m68674:abstract:auto-2 -->
By the end of this section, you will be able to:
```

**Output:**
```
<!-- SEG:m68674:abstract:auto-2 -->
Að þessum kafla loknum muntu geta:
```

**Usage:** 49 characters, cost: 0.49

**Checks:**

- ✅ SEG tag survives
- ✅ Output is Icelandic
- ✅ No marker corruption

### ✅ T2.m68674.3: Real segment: m68674:abstract-item:abstract-item-1 (medium)

**Input:**
```
<!-- SEG:m68674:abstract-item:abstract-item-1 -->
Explain the process of measurement
```

**Output:**
```
<!-- SEG:m68674:abstract-item:abstract-item-1 -->
Útskýrðu mælingarferlið
```

**Usage:** 35 characters, cost: 0.35000000000000003

**Checks:**

- ✅ SEG tag survives
- ✅ Output is Icelandic
- ✅ No marker corruption

### ✅ T2.m68664.1: Real segment: m68664:title:auto-1 (medium)

**Input:**
```
<!-- SEG:m68664:title:auto-1 -->
Chemistry in Context
```

**Output:**
```
<!-- SEG:m68664:title:auto-1 -->
Efnafræði í samhengi
```

**Usage:** 21 characters, cost: 0.21

**Checks:**

- ✅ SEG tag survives
- ✅ Output is Icelandic
- ✅ No marker corruption

### ✅ T2.m68664.2: Real segment: m68664:abstract:auto-2 (medium)

**Input:**
```
<!-- SEG:m68664:abstract:auto-2 -->
By the end of this section, you will be able to:
```

**Output:**
```
<!-- SEG:m68664:abstract:auto-2 -->
Þegar þessum kafla lýkur muntu geta:
```

**Usage:** 49 characters, cost: 0.49

**Checks:**

- ✅ SEG tag survives
- ✅ Output is Icelandic
- ✅ No marker corruption

### ✅ T2.m68664.3: Real segment: m68664:abstract-item:abstract-item-1 (medium)

**Input:**
```
<!-- SEG:m68664:abstract-item:abstract-item-1 -->
Outline the historical development of chemistry
```

**Output:**
```
<!-- SEG:m68664:abstract-item:abstract-item-1 -->
Lýsið sögulegri þróun efnafræðinnar
```

**Usage:** 48 characters, cost: 0.48

**Checks:**

- ✅ SEG tag survives
- ✅ Output is Icelandic
- ✅ No marker corruption
