#!/usr/bin/env python3
"""
Apply Chemistry Reader tags to markdown files.
Transforms OpenStax-style content to tagged format.
"""

import re
import sys
from pathlib import Path

def apply_tags(content: str) -> str:
    """Apply chemistry reader tags to markdown content."""

    # 1. Wrap Námsmarkmið (Learning Objectives) in :::note
    content = re.sub(
        r'### Námsmarkmið\n\n((?:.*?\n)*?)(?=\n[^-\n]|\n\n[A-ZÞÆÐÖÁÍÚÉÓ])',
        r':::note\n### Námsmarkmið\n\n\1:::\n\n',
        content,
        flags=re.MULTILINE
    )

    # 2. Clean up CSS class artifacts like {#dæmi-2.1 .Heading3Grey}
    content = re.sub(r'\s*\{#[^}]+\.Heading\d+Grey\}', '', content)
    content = re.sub(r'\s*\{#[^}]+\}', '', content)

    # 3. Convert Examples (Dæmi X.X) to :::example blocks
    # This is complex because we need to find the end of each example

    # Pattern for example start
    example_pattern = r'### Dæmi (\d+\.\d+)\s*\n\n#### ([^\n]+)\n\n(.*?)#### Lausn\s*\n\n(.*?)(?=\n\n#### Kannaðu þekkingu þína|\n\n###|\n\n:::|\Z)'

    def replace_example(match):
        num = match.group(1)
        title = match.group(2)
        problem = match.group(3).strip()
        solution = match.group(4).strip()
        return f''':::example
### Dæmi {num}: {title}

{problem}

**Lausn**

{solution}
:::

'''

    content = re.sub(example_pattern, replace_example, content, flags=re.DOTALL)

    # 4. Convert "Kannaðu þekkingu þína" + "Svar:" to :::practice-problem with :::answer
    practice_pattern = r'#### Kannaðu þekkingu þína\s*\n\n(.*?)### Svar:\s*\n\n(.*?)(?=\n\n[A-ZÞÆÐÖÁÍÚÉÓ]|\n\n###|\n\n:::|\Z)'

    def replace_practice(match):
        problem = match.group(1).strip()
        answer = match.group(2).strip()
        return f''':::practice-problem
**Kannaðu þekkingu þína**

{problem}

:::answer
{answer}
:::
:::

'''

    content = re.sub(practice_pattern, replace_practice, content, flags=re.DOTALL)

    # 5. Clean up table formatting (remove +---+ borders)
    content = re.sub(r'\+[-+]+\+\n\|\s*-\s*', '', content)
    content = re.sub(r'\n\+[-+]+\+', '', content)

    # 6. Clean up multiple blank lines
    content = re.sub(r'\n{4,}', '\n\n\n', content)

    # 7. Fix any remaining malformed blocks
    content = re.sub(r':::\n\n:::', ':::\n:::', content)

    return content


def process_file(filepath: Path) -> bool:
    """Process a single markdown file."""
    print(f"Processing: {filepath.name}")

    try:
        content = filepath.read_text(encoding='utf-8')

        # Check if already tagged
        if ':::note' in content or ':::example' in content:
            print(f"  Already tagged, skipping")
            return False

        # Apply tags
        new_content = apply_tags(content)

        # Update lastUpdated date
        new_content = re.sub(
            r'lastUpdated: "[^"]+"',
            'lastUpdated: "2026-01-13"',
            new_content
        )

        # Write back
        filepath.write_text(new_content, encoding='utf-8')
        print(f"  Tagged successfully")
        return True

    except Exception as e:
        print(f"  Error: {e}")
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python apply-chemistry-tags.py <directory>")
        sys.exit(1)

    directory = Path(sys.argv[1])

    if not directory.exists():
        print(f"Directory not found: {directory}")
        sys.exit(1)

    # Find all markdown files
    md_files = sorted(directory.glob("*.md"))

    # Skip certain files
    skip_files = {'2-key-terms.md', '2-key-equations.md', '2-summary.md',
                  '2-exercises.md', 'chapter-2.md', '2-introduction.md'}

    processed = 0
    for filepath in md_files:
        if filepath.name in skip_files:
            print(f"Skipping: {filepath.name}")
            continue
        if process_file(filepath):
            processed += 1

    print(f"\nProcessed {processed} files")


if __name__ == "__main__":
    main()
