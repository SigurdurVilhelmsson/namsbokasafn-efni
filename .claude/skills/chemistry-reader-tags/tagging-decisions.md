# Tagging Decision Guide

## Note vs. Key Concept vs. Definition

| Use | When |
|-----|------|
| `:::note` | General important information, tips, reminders |
| `:::key-concept` | Fundamental concept that will be built upon later |
| `:::definition` | Specific term being formally defined |

**Example:**
- "Water is polar" -> `:::key-concept` (fundamental idea)
- "Polarity: uneven distribution of charge" -> `:::definition{term="Polarity"}`
- "Remember: like dissolves like" -> `:::note`

## Example vs. Practice Problem

| Use | When |
|-----|------|
| `:::example` | Worked example showing how to solve |
| `:::practice-problem` | Student should attempt before seeing answer |

**Guideline:** If showing step-by-step solution as teaching -> `:::example`
If student should try first -> `:::practice-problem`

## When to Add Hints

Add `:::hint` blocks when:
- Problem has multiple steps
- Students commonly get stuck
- There's a key insight needed

Structure hints progressively:
1. First hint: General direction
2. Second hint: More specific guidance
3. Third hint: Nearly gives it away

## When NOT to Tag

Don't tag:
- Every paragraph (over-tagging)
- Simple transitional text
- Standard explanations that flow naturally
- Content that doesn't fit tag categories

**Rule of thumb:** If you're unsure, don't tag. Tags should enhance, not clutter.

## Checkpoint Placement

Place `:::checkpoint` blocks:
- After major concept sections
- Before moving to applications
- At natural "do you understand?" moments

Not:
- After every subsection
- In the middle of explanations
- Multiple times per page

## Misconception Blocks

Use `:::common-misconception` when:
- Research shows students commonly err
- The error is understandable but problematic
- Explicit correction is more effective than hoping they get it right

Format:
```markdown
:::common-misconception
**Rangt:** [What students often think]

**Rett:** [Correct understanding]
:::
```
