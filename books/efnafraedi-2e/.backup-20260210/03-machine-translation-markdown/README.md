# 03-machine-translation

This directory contains **unreviewed machine translation output** that has been joined from segments into complete markdown modules.

## Purpose

This is the **intermediate step** between MT output and editorial review:

1. **Source:** Segments from `02-mt-output/` (raw MT from Erlendur/malstadur.is)
2. **Processing:** Joined using structure from `02-structure/` by `join-mt-output.js` tool
3. **Output:** Complete markdown modules with frontmatter

## Status

- **Quality level:** Unreviewed machine translation
- **Format:** Markdown with YAML frontmatter
- **Completeness:** May have `[EQUATION]`, `[TABLE]`, `[EXERCISE]` placeholders for complex elements

## Workflow

### Step 1: Generate MT modules (this directory)
```bash
# Join segments into complete markdown modules
node tools/join-mt-output.js --chapter 12
```

### Step 2: Publish to MT-Preview
```bash
# Render markdown to HTML for MT preview
node tools/markdown-to-html.js --chapter 12 --track mt-preview
```

### Step 3: Editorial Review
- Review content in `03-machine-translation/`
- Fix translation errors, grammar, terminology
- When chapter review is complete, copy to `03-faithful/`

### Step 4: Publish Faithful version
```bash
# Render reviewed markdown to HTML for faithful track
node tools/markdown-to-html.js --chapter 12 --track faithful
```

## File Structure

```
03-machine-translation/
├── ch01/
│   ├── m68663.md
│   ├── m68664.md
│   └── ...
├── ch02/
│   ├── m68684.md
│   └── ...
└── ...
```

## Frontmatter Format

Each markdown file includes:

```yaml
---
moduleId: "m68785"
title: "Introduction"
chapter: 12
documentClass: "introduction"
version: "machine-translation"
generatedDate: "2026-02-10"
---
```

## Next Steps

1. **Create `markdown-to-html.js` tool** to render these markdown files to HTML for publication
2. **Create editorial workflow** to move reviewed content from `03-machine-translation/` to `03-faithful/`
3. **Update status tracking** to reflect MT → Faithful → Localized progression

## Quality Notes

**Known limitations:**
- Complex elements (equations, tables, exercises) are represented as placeholders
- Images use relative paths that need to be resolved during rendering
- MathML notation needs to be preserved/converted during rendering

**For editorial review:**
- Focus on linguistic quality and terminology
- Structural/formatting issues will be handled during rendering
- Mathematical notation and complex elements will be properly rendered from CNXML source
