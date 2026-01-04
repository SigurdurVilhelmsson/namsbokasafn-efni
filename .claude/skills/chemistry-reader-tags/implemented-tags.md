# Implemented Chemistry Reader Tags

## Callout Blocks

### Note Block (Blue)
```markdown
:::note
Important information students should pay attention to.
:::
```
Renders with: Info icon, "Athugid" title, blue theme

### Warning Block (Amber)
```markdown
:::warning
Caution about safety, common mistakes, or important considerations.
:::
```
Renders with: Warning icon, "Vidvorun" title, amber theme

### Example Block (Gray)
```markdown
:::example
**Example 1.3.1: Title**

Worked example content...
:::
```
Renders with: Lightbulb icon, "Daemi" title, gray theme

---

## Interactive Blocks

### Practice Problem (with Answer)
```markdown
:::practice-problem
Problem statement here.

:::answer
**Solution:**
Step-by-step solution...

**Answer:** Final answer
:::
:::
```
Features:
- Amber header with "Aefingadaemi" title
- "Syna svar" button reveals answer
- Green answer area with animation

### With Hints
```markdown
:::practice-problem
Problem statement.

:::hint
First hint (revealed progressively)
:::

:::hint
Second hint
:::

:::answer
Solution...
:::
:::
```

### With Explanation
```markdown
:::practice-problem
Problem statement.

:::answer
Brief answer
:::

:::explanation
Detailed explanation of why/how...
:::
:::
```

---

## Educational Directive Blocks

### Definition Block (Purple)
```markdown
:::definition{term="Molmassi"}
Definition text explaining the term.
:::
```
Renders with: Book icon, "Skilgreining: Molmassi" title, purple theme

Without term attribute:
```markdown
:::definition
Definition text.
:::
```
Renders with: "Skilgreining" title only

### Key Concept Block (Cyan)
```markdown
:::key-concept
Essential concept students must understand.
:::
```
Renders with: Key icon, "Lykilhugtak" title, cyan theme

### Checkpoint Block (Green)
```markdown
:::checkpoint
Getur thu:
- First self-check item
- Second self-check item
- Third self-check item

Ef ekki, endurskodadu kafla X.Y!
:::
```
Renders with: Checkmark icon, "Sjalfsmat" title, green theme

### Common Misconception Block (Rose)
```markdown
:::common-misconception
**Rangt:** Statement of the misconception

**Rett:** Correct understanding
:::
```
Renders with: X-circle icon, "Algengur misskilningur" title, rose theme

---

## Cross-References

### Creating Anchors
```markdown
$$
E = mc^2
$$ {#eq:einstein}

![Alt text](./image.png) {#fig:diagram}
```

### Using References
```markdown
Sja [ref:eq:einstein] fyrir jofnuna.
Eins og synt er i [ref:fig:diagram]...
```

Reference types: `sec`, `eq`, `fig`, `tbl`, `def`
