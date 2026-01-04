# Localization Log Format

Based on `templates/localization-log.md`. Every localized chapter needs a complete log.

## Required Sections

### Header
```markdown
# Localization Log - Chapter {N}: {Title}

| Field | Value |
|-------|-------|
| **Chapter** | {number} |
| **Title (EN)** | {original title} |
| **Title (IS)** | {Icelandic title} |
| **Localized by** | {name} |
| **Date** | {date} |
| **Pass 1 Editor** | {name} |
| **Pass 1 Date** | {date} |
```

### Summary
Brief overview:
- Total unit conversions: X
- Cultural adaptations: X
- Added content: X
- Terminology decisions: X

### Unit Conversions Table
| Section | Original | Localized | Notes |
|---------|----------|-----------|-------|
| {id} | {value + unit} | {converted} | {any notes} |

### Cultural Adaptations Table
| Section | Original Context | Icelandic Adaptation | Rationale |
|---------|------------------|---------------------|-----------|
| {id} | {original} | {adapted} | {why} |

### Added Content Table
| Section | Addition | Type | Description |
|---------|----------|------|-------------|
| {id} | {name} | {type} | {what was added} |

Types: Aefingadaemi, Daemi, Samhengi, Athugasemd

### Calculations Verified
| Section | Original | Converted | Verified |
|---------|----------|-----------|----------|
| {id} | {calc} | {new calc} | yes/no |

## Log Location

Save to: `books/{book}/04-localized/localization-logs/ch{NN}-log.md`
