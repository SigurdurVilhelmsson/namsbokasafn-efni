# Archived Documentation

This directory contains documentation from previous project iterations that describes workflows, tools, or architectures that are no longer current.

## Why Archive Instead of Delete

We archive rather than delete documentation because:
1. **Historical context** - Understanding why decisions were made
2. **Migration reference** - Comparing old vs new approaches
3. **Restoration** - If we need to recover old processes
4. **Learning** - Documenting what didn't work

## Archived Documents

### Phase 8 Migration (2026-02-08)

**`vefur-renderer-updates-needed.md`**
- **Original location:** `docs/technical/`
- **Archived:** 2026-02-08
- **Reason:** Superseded by Phase 8 CNXML→HTML pipeline
- **Context:** Described markdown directive updates for the vefur markdown renderer. Publication output changed from markdown to semantic HTML, making directive updates irrelevant.

**`openstax-tag-mapping-markdown.md`**
- **Original location:** `docs/technical/openstax-tag-mapping.md`
- **Archived:** 2026-02-08
- **Reason:** Legacy markdown pipeline reference
- **Context:** Documented CNXML → markdown directive mappings. Current pipeline uses `cnxml-extract.js` and `cnxml-render.js` for direct HTML rendering. Tag mapping concepts still apply but implementation differs significantly.

## Archive Format

Each archived document includes a header comment:
```markdown
<!-- ARCHIVED: [date] - [reason]. Moved from [original location]. -->
```

This provides immediate context when viewing the file.

## When to Archive

Archive documentation when:

1. **Workflow changes** - Process described no longer exists (e.g., docx-based workflow → segment editor)
2. **Tool deprecation** - Tools referenced are in `tools/_archived/`
3. **Architecture shift** - System design fundamentally changed (e.g., markdown → HTML)
4. **Superseded** - New doc explicitly replaces old one

**Don't archive** documentation that is merely:
- Slightly out of date (update it instead)
- Missing recent features (add them)
- Using old examples (update examples)

## Active Documentation

For current, maintained documentation, see:
- [docs/README.md](../README.md) - Documentation index
- [docs/workflow/simplified-workflow.md](../workflow/simplified-workflow.md) - Current pipeline
- [docs/workflow/master-pipeline.md](../workflow/master-pipeline.md) - Comprehensive pipeline reference
- [docs/technical/architecture.md](../technical/architecture.md) - System architecture

## Restoration Process

To restore archived documentation:
1. Review why it was archived
2. Determine if restoration is appropriate or if new documentation is better
3. Update all references to reflect current architecture
4. Remove archive header comment
5. Move back to original location (or appropriate new location)
6. Update relevant indexes and cross-references

## See Also

- [tools/_archived/README.md](../../tools/_archived/README.md) - Archived tools
- [CHANGELOG.md](../../CHANGELOG.md) - Version history and deprecations
- [ROADMAP.md](../../ROADMAP.md) - Phase completion timeline
- [docs/contributing/freshness-policy.md](../contributing/freshness-policy.md) - Documentation maintenance policy
