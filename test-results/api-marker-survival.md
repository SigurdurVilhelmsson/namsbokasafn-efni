# Málstaður API Marker Survival Report — `POST /v1/translate`

**Generated:** 2026-07-17T09:42:22.843Z
**API Base:** https://api.malstadur.is

> ⚠️ **SCOPE — added 2026-08-06, not part of the original run.** Every check below exercises
> **`POST /v1/translate`** only. **This result does NOT transfer to other endpoints:**
> `/v1/grammar` was measured to *corrupt* these markers (`[[i:vatns]]` → `[[i: vatns]]`, the
> spaced form that parses to an empty list silently). → CLAUDE.md § *Inline Marker Format*.

## Summary

| Metric | Value |
|--------|-------|
| Tests run | 21 |
| Total checks | 77 |
| Passed | 77 |
| Failed | 0 |
| API errors | 0 |
| Pass rate | 100.0% |
| Characters translated | 2,029 |
| Estimated cost | 20 ISK |
| Elapsed time | 136.2s |

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
Efnafræði er fræðigreinin um efni og eiginleika þess.
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
<!-- SEG:m68663:para:1 --> Efnafræði er rannsókn á efni.
```

**Usage:** 33 characters, cost: 0.33

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
Gildið er [[MATH:1]] sinnum meira en [[MATH:2]] einingar.
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
Sjá [töflu 1.1](#fs-idm81346144) fyrir nánari upplýsingar um [efnafræði](http://openstax.org/l/16plasma).
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
Fyrsta lína[[BR]]Önnur lína með [[SPACE]] aukabili og [[MEDIA:3]] mynd.
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
{{TERM}}Sameind{{/TERM}} er lýst í {{LINK:1}}töflu 1{{/LINK}} og {{XREF:2}} sýnir meira.
```

**Usage:** 97 characters, cost: 0.97

**Checks:**

- ✅ {{TERM}}...{{/TERM}} survives
- ✅ {{LINK:1}}...{{/LINK}} survives
- ✅ {{XREF:2}} survives

### ✅ T1.11: Mixed real-world segment (complex)

**Input:**
```
<!-- SEG:m68674:para:1 --> The mass is 2.98 [[MATH:1]] 10^5^ kg. __Units__ are listed in [#fs-idm81346144]. See [Table 1.1](http://example.com) for the H~2~O data.
```

**Output:**
```
<!-- SEG:m68674:para:1 --> Massinn er 2,98 [[MATH:1]] 10^5^ kg. __Einingar__ eru taldar upp í [#fs-idm81346144]. Sjá [töflu 1.1](http://example.com) fyrir H~2~O gögnin.
```

**Usage:** 136 characters, cost: 1.36

**Checks:**

- ✅ SEG comment survives
- ✅ [[MATH:1]] survives
- ✅ ^5^ survives
- ✅ __term__ survives
- ✅ [#ref] survives
- ✅ [text](url) survives
- ✅ ~2~ survives

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
Þegar þú hefur lokið við þennan kafla muntu geta:

<!-- SEG:m68664:abstract-item:abstract-item-1 -->
Lýst í stuttu máli sögulegri þróun efnafræðinnar

<!-- SEG:m68664:para:fs-idp77567568 -->
Í gegnum mannkynssöguna hefur fólk reynt að breyta efni í nytsamlegra form.
```

**Usage:** 203 characters, cost: 2.0300000000000002

**Checks:**

- ✅ All 4 SEG tags survive
- ✅ Paragraph structure preserved
- ✅ Title SEG tag present
- ✅ Para SEG tag present

### ✅ T1.14: Id-anchored term marker survival ([[term:text|id]])

**Input:**
```
The [[term:viscosity|term-00001]] of a liquid is a measure of its resistance to flow, unlike the [[term:surface tension|fs-idm12345678]] at the interface.
```

**Output:**
```
[[term:viscosity|term-00001]] vökva er mælikvarði á viðnám hans gegn flæði, ólíkt [[term:surface tension|fs-idm12345678]] á skilflötum.
```

**Usage:** 154 characters, cost: 1.54

**Checks:**

- ✅ two [[term: markers survive
- ✅ id term-00001 byte-intact
- ✅ id fs-idm12345678 byte-intact
- ✅ no backslash escaping
- ✅ text translated

### ✅ T1.15: Id-anchored footnote marker survival ([[fn:text|id]])

**Input:**
```
Water boils at 100 degrees. [[fn:At standard atmospheric pressure of 101.325 kPa.|fs-idp2355696]] This varies with altitude.
```

**Output:**
```
Vatn sýður við 100 gráður. [[fn:Við staðlaðan loftþrýsting upp á 101,325 kPa.|fs-idp2355696]] Þetta er breytilegt eftir hæð yfir sjávarmáli.
```

**Usage:** 124 characters, cost: 1.24

**Checks:**

- ✅ [[fn: marker survives
- ✅ id fs-idp2355696 byte-intact
- ✅ no backslash escaping

### ✅ T1.16: Underline + class-emphasis marker survival ([[u:]], [[em:|class]])

**Input:**
```
The [[u:most important]] rule is that an ether has the structure [[em:R-O-R|emphasis-one]] in general.
```

**Output:**
```
[[u:Mikilvægasta]] reglan er sú að eter hefur almennt bygginguna [[em:R-O-R|emphasis-one]].
```

**Usage:** 102 characters, cost: 1.02

**Checks:**

- ✅ [[u: marker survives
- ✅ [[em: marker survives
- ✅ class payload byte-intact

### ✅ T1.17: Nested markup inside id-anchored term ([[term:H[[sub:2]]O|id]])

**Input:**
```
The formula for [[term:water H[[sub:2]]O|term-00099]] is well known.
```

**Output:**
```
Formúlan fyrir [[term:vatn H[[sub:2]]O|term-00099]] er vel þekkt.
```

**Usage:** 68 characters, cost: 0.68

**Checks:**

- ✅ outer [[term: survives
- ✅ inner [[sub: survives
- ✅ id byte-intact

### ✅ T1.18: Paired-bracket term/fn translate inner text AND survive ([[term]]x[[/term]]) — B4-D11

**Input:**
```
The [[term]]viscosity[[/term]] of a liquid. Water boils at 100 degrees. [[fn]]At standard pressure.[[/fn]]
```

**Output:**
```
[[term]]Seigja[[/term]] vökva. Vatn sýður við 100 gráður. [[fn]]Við staðalþrýsting.[[/fn]]
```

**Usage:** 106 characters, cost: 1.06

**Checks:**

- ✅ [[term]] delimiter survives
- ✅ [[fn]] delimiter survives
- ✅ term inner text is translated (not still "viscosity")

### ✅ T1.19: Empty-body literal-bracket escapes survive ([[lb:]]/[[rb:]]) — item 9 os-embed

**Input:**
```
An antarafacial [[lb:]]1,7[[rb:]] sigmatropic rearrangement occurs and the rotation [[lb:]][[i:α]][[rb:]]D is measured. [[lb:]]Note: this is a hint.[[rb:]]
```

**Output:**
```
Antarafacial [[lb:]]1,7[[rb:]] sigmatropic endurröðun á sér stað og snúningurinn [[lb:]][[i:α]][[rb:]]D er mældur. [[lb:]]Athugið: þetta er vísbending.[[rb:]]
```

**Usage:** 155 characters, cost: 1.55

**Checks:**

- ✅ all three [[lb:]] survive byte-exact
- ✅ all three [[rb:]] survive byte-exact
- ✅ no text migrated INSIDE an lb/rb body (assembler would discard it)
- ✅ inner [[i: survives
- ✅ text translated

### ✅ T1.20: Multiple [[MEDIA:n]] in exercise-field context — item 9 os-embed

**Input:**
```
Draw the product when [[MEDIA:0]] reacts with H[[sub:2]]O to give [[MEDIA:1]] under acidic conditions.
```

**Output:**
```
Teiknið afurðina þegar [[MEDIA:0]] hvarfast við H[[sub:2]]O og myndar [[MEDIA:1]] við súrar aðstæður.
```

**Usage:** 102 characters, cost: 1.02

**Checks:**

- ✅ [[MEDIA:0]] byte-intact
- ✅ [[MEDIA:1]] byte-intact
- ✅ exactly two MEDIA markers (no dup/drop)
- ✅ [[sub: survives
- ✅ text translated

### ✅ T1.21: Numeric-anchored wrap marker ([[em:text|n]]) — item 9 os-embed

**Input:**
```
The starting material is [[em:1|0]] in the scheme, giving [[em:the product|1]] after reflux.
```

**Output:**
```
Upphafsefnið er [[em:1|0]] í skemanu og gefur [[em:afurðina|1]] eftir suðu undir bakflæði.
```

**Usage:** 92 characters, cost: 0.92

**Checks:**

- ✅ numeric anchor |0]] byte-intact
- ✅ numeric anchor |1]] byte-intact
- ✅ both [[em: markers survive
- ✅ wrap inner text is translated (not still "the product")
