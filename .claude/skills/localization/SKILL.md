---
name: localization
description: Guide Pass 2 localization of faithful translations. Triggers when working on files in 04-localized-content/, discussing unit conversions, cultural adaptations, or Icelandic context additions.
---

# Localization - Pass 2 Editorial

You are assisting with Pass 2 localization: adapting faithful translations for **Icelandic secondary school students**.

## Purpose

Create localized versions that:
- Use SI units throughout
- Include relevant Icelandic context
- Connect to local knowledge and experience
- Enhance learning for the target audience

## What to Change

✅ **DO:**
- Convert imperial units to SI
- Adapt cultural references
- Add Icelandic context where it enriches learning
- Add extended exercises where beneficial

❌ **DO NOT:**
- Change core scientific content
- Remove examples without replacement
- Alter pedagogical structure
- Make changes without documenting them

## Critical Requirement

**DOCUMENT EVERY CHANGE** in the localization log.

## Output Locations

- Localized .docx: `books/{book}/04-localized-content/docx/ch{NN}/`
- Localization log: `books/{book}/04-localized-content/localization-logs/ch{NN}-log.md`

---

## Unit Conversions

### Standard Conversions

| From | To | Formula/Factor |
|------|-----|----------------|
| miles | km | × 1.609 |
| feet | m | × 0.305 |
| inches | cm | × 2.54 |
| yards | m | × 0.914 |
| pounds (mass) | kg | × 0.454 |
| ounces | g | × 28.35 |
| gallons (US) | L | × 3.785 |
| quarts | L | × 0.946 |
| fluid ounces | mL | × 29.57 |
| °F | °C | (°F - 32) × 5/9 |
| psi | kPa | × 6.895 |
| atm | kPa | × 101.325 |

### Common Reference Values

| Description | Imperial | SI |
|-------------|----------|-----|
| Room temperature | 72°F | 22°C |
| Freezing point | 32°F | 0°C |
| Boiling point | 212°F | 100°C |
| Body temperature | 98.6°F | 37°C |
| Standard pressure | 14.7 psi / 1 atm | 101.325 kPa |

### Conversion Guidelines

1. **Round appropriately** - Don't add false precision (5 miles → 8 km, not 8.045 km)
2. **Recalculate, don't just convert** - Adjust problem numbers to give clean answers in SI
3. **Verify calculations** - Redo any calculations in the example after converting
4. **Document everything** - Record original and converted values in localization log

---

## Cultural Adaptations

### When to Adapt

**Adapt when:** Reference is confusing to Icelandic students, local equivalent exists, adaptation enhances understanding

**Keep original when:** Reference is internationally known, no good Icelandic equivalent, context is specifically American

### Common Adaptations

| American | Icelandic Alternative |
|----------|----------------------|
| Thanksgiving | Jól or Þorrablót |
| Fourth of July | 17. júní |
| Grand Canyon | Jökulsárgljúfur, Ásbyrgi |
| Yellowstone geysers | Geysir, Strokkur |
| FDA | Lyfjastofnun |
| EPA | Umhverfisstofnun |
| Tylenol | Paracetamól |

### Adaptation Principles

1. **Enhance, don't distort** - Adaptations should aid understanding
2. **Maintain scientific accuracy** - Never sacrifice correctness
3. **Consider pedagogy** - Does the adaptation serve learning goals?
4. **Document rationale** - Record why you made each adaptation

---

## Adding Icelandic Context

### Opportunities for Local Relevance

**Geothermal Energy:**
- Hellisheiðarvirkjun, Nesjavellir, Svartsengi
- Thermodynamics, energy transformation, environmental chemistry

**Fishing Industry:**
- Food preservation, Omega-3 extraction, ocean chemistry

**Volcanic and Geological Chemistry:**
- Sulfur chemistry, mineral formation, volcanic gas composition
- Eyjafjallajökull ash composition (2010)

**Environmental Issues:**
- Ocean acidification, Carbfix carbon capture, aluminum smelting

### Guidelines for Adding Context

1. **Enhance, don't distract** - Context should reinforce learning objectives
2. **Be accurate** - Verify Icelandic facts and figures
3. **Keep it relevant** - Students should see the connection clearly
4. **Document additions** - All added content goes in localization log

---

## Localization Log Format

### Required Header

```markdown
# Localization Log - Chapter {N}: {Title}

| Field | Value |
|-------|-------|
| **Chapter** | {number} |
| **Title (EN)** | {original title} |
| **Title (IS)** | {Icelandic title} |
| **Localized by** | {name} |
| **Date** | {date} |
```

### Required Tables

**Unit Conversions:**
| Section | Original | Localized | Notes |
|---------|----------|-----------|-------|

**Cultural Adaptations:**
| Section | Original Context | Icelandic Adaptation | Rationale |
|---------|------------------|---------------------|-----------|

**Added Content:**
| Section | Addition | Type | Description |
|---------|----------|------|-------------|

Types: Æfingadæmi, Dæmi, Samhengi, Athugasemd

### Log Location

Save to: `books/{book}/04-localized-content/localization-logs/ch{NN}-log.md`
