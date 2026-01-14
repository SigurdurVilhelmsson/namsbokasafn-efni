#!/usr/bin/env python3
"""
Convert Pandoc simple tables to GFM pipe tables.

Pandoc simple table format:
  -----------------------------------------------------------------------
  Header1       Header2       Header3
  ------------- ------------- -------------
  data1         data2         data3

  data4         data5         data6
  -----------------------------------------------------------------------

GFM pipe table format:
| Header1 | Header2 | Header3 |
|---------|---------|---------|
| data1   | data2   | data3   |
| data4   | data5   | data6   |
"""

import re
import sys
from pathlib import Path


def parse_column_boundaries(separator_line: str) -> list[tuple[int, int]]:
    """
    Parse column boundaries from a separator line like:
    '  ----------- ----------- --------------- -------------- ----------- ---------------'

    Returns list of (start, end) tuples for each column.
    """
    boundaries = []
    in_column = False
    start = 0

    for i, char in enumerate(separator_line):
        if char == '-':
            if not in_column:
                start = i
                in_column = True
        else:
            if in_column:
                boundaries.append((start, i))
                in_column = False

    # Handle trailing column
    if in_column:
        boundaries.append((start, len(separator_line)))

    return boundaries


def extract_cell_content(line: str, boundaries: list[tuple[int, int]]) -> list[str]:
    """Extract cell content from a line using column boundaries."""
    cells = []
    for start, end in boundaries:
        # Safely extract content, padding if line is shorter
        if start >= len(line):
            cells.append('')
        elif end > len(line):
            cells.append(line[start:].strip())
        else:
            cells.append(line[start:end].strip())
    return cells


def is_table_border(line: str) -> bool:
    """Check if a line is a table border (all dashes and spaces)."""
    stripped = line.strip()
    return bool(stripped) and all(c in '-' for c in stripped)


def is_separator_row(line: str) -> bool:
    """Check if a line is a column separator (dashes with spaces between column groups)."""
    stripped = line.strip()
    if not stripped:
        return False

    # A separator row should be primarily dashes and spaces, not text
    # Count the ratio of dashes to total characters
    dash_count = stripped.count('-')
    total_chars = len(stripped)

    # Must be at least 50% dashes to be a separator row
    if dash_count < total_chars * 0.5:
        return False

    # Must have multiple dash groups (columns)
    dash_groups = re.findall(r'-{3,}', stripped)  # At least 3 dashes per group
    if len(dash_groups) < 2:
        return False

    # Must have spaces between dash groups
    has_spaces = ' ' in stripped
    return has_spaces


def contains_image(lines: list[str], start: int, end: int) -> bool:
    """Check if any line between start and end contains an image."""
    for i in range(start, end):
        if '![' in lines[i]:
            return True
    return False


def find_pandoc_tables(content: str) -> list[dict]:
    """
    Find all Pandoc simple tables in the content.

    Returns list of dicts with:
    - start: start line index
    - end: end line index (exclusive)
    - title: table title (line before table)
    - caption: table caption (line after table, e.g., "Tafla 1.1")
    """
    lines = content.split('\n')
    tables = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Check for table border start
        if is_table_border(line):
            table_start = i

            # Look for header row (next non-empty line)
            header_idx = i + 1
            while header_idx < len(lines) and not lines[header_idx].strip():
                header_idx += 1

            if header_idx >= len(lines):
                i += 1
                continue

            header_line = lines[header_idx]

            # Skip if this looks like an image (contains ![)
            if '![' in header_line:
                i += 1
                continue

            # Look for separator row (dashes defining columns)
            # The separator should be immediately after the header (at most 1 empty line between)
            sep_idx = header_idx + 1
            empty_lines_after_header = 0
            while sep_idx < len(lines) and not lines[sep_idx].strip():
                sep_idx += 1
                empty_lines_after_header += 1

            # If more than 1 empty line between header and separator, it's not a table
            if empty_lines_after_header > 1:
                i += 1
                continue

            if sep_idx >= len(lines) or not is_separator_row(lines[sep_idx]):
                i += 1
                continue

            separator_line = lines[sep_idx]

            # Additional check: the header line should look like actual column headers
            # (multiple words/terms separated by significant whitespace)
            # If the header is a long paragraph (100+ chars with few whitespace segments), skip
            header_words = header_line.split()
            if len(header_line) > 100 and len(header_words) < 4:
                i += 1
                continue

            # Find table end (another border line)
            end_idx = sep_idx + 1
            while end_idx < len(lines):
                if is_table_border(lines[end_idx]):
                    break
                end_idx += 1

            if end_idx >= len(lines):
                i += 1
                continue

            # Skip if any content between borders contains an image
            if contains_image(lines, table_start, end_idx + 1):
                i = end_idx + 1
                continue

            # Check for title (line before table border)
            title = ''
            title_idx = table_start - 1
            while title_idx >= 0 and not lines[title_idx].strip():
                title_idx -= 1
            if title_idx >= 0:
                potential_title = lines[title_idx].strip()
                # Title shouldn't be another table ending or a paragraph
                if potential_title and not is_table_border(lines[title_idx]) and len(potential_title.split()) <= 10:
                    title = potential_title

            # Check for caption (line after table border)
            caption = ''
            caption_idx = end_idx + 1
            while caption_idx < len(lines) and not lines[caption_idx].strip():
                caption_idx += 1
            if caption_idx < len(lines):
                potential_caption = lines[caption_idx].strip()
                if potential_caption.startswith('Tafla ') or potential_caption.startswith('Table '):
                    caption = potential_caption

            tables.append({
                'start': table_start,
                'end': end_idx + 1,  # exclusive
                'title_idx': title_idx if title else -1,
                'title': title,
                'caption_idx': caption_idx if caption else -1,
                'caption': caption,
                'header_idx': header_idx,
                'separator_line': separator_line,
            })

            i = end_idx + 1
        else:
            i += 1

    return tables


def convert_table_to_gfm(lines: list[str], table_info: dict) -> list[str]:
    """Convert a Pandoc simple table to GFM format."""
    boundaries = parse_column_boundaries(table_info['separator_line'])

    if not boundaries:
        return lines[table_info['start']:table_info['end']]

    # Extract header
    header_line = lines[table_info['header_idx']]
    header_cells = extract_cell_content(header_line, boundaries)

    # Extract data rows (everything between separator and end border)
    data_start = table_info['header_idx'] + 1
    # Skip past the separator line
    while data_start < table_info['end'] and is_separator_row(lines[data_start]):
        data_start += 1
    data_end = table_info['end'] - 1  # Exclude the bottom border

    data_rows = []
    current_row_cells = None

    for i in range(data_start, data_end):
        line = lines[i]

        if not line.strip():
            # Empty line marks end of a row (for multi-line cells)
            if current_row_cells:
                data_rows.append(current_row_cells)
                current_row_cells = None
            continue

        cells = extract_cell_content(line, boundaries)

        if current_row_cells is None:
            current_row_cells = cells
        else:
            # Append to existing cells (multi-line cell content)
            for j, cell in enumerate(cells):
                if j < len(current_row_cells) and cell:
                    if current_row_cells[j]:
                        current_row_cells[j] += ' ' + cell
                    else:
                        current_row_cells[j] = cell

    # Don't forget the last row
    if current_row_cells:
        data_rows.append(current_row_cells)

    # Build GFM table
    num_cols = len(header_cells)

    # Create header row
    gfm_lines = []
    gfm_lines.append('| ' + ' | '.join(header_cells) + ' |')

    # Create separator row
    gfm_lines.append('|' + '|'.join(['---'] * num_cols) + '|')

    # Create data rows
    for row in data_rows:
        # Pad row if needed
        while len(row) < num_cols:
            row.append('')
        # Escape pipes in cell content
        escaped_row = [cell.replace('|', '\\|') for cell in row]
        gfm_lines.append('| ' + ' | '.join(escaped_row) + ' |')

    return gfm_lines


def process_file(filepath: Path, dry_run: bool = False) -> bool:
    """Process a single markdown file, converting Pandoc tables to GFM."""
    content = filepath.read_text(encoding='utf-8')
    lines = content.split('\n')

    tables = find_pandoc_tables(content)

    if not tables:
        return False

    print(f"  Found {len(tables)} table(s) in {filepath.name}")

    # Process tables in reverse order to preserve line indices
    for table_info in reversed(tables):
        print(f"    Converting table at lines {table_info['start']+1}-{table_info['end']}")
        if table_info['title']:
            print(f"      Title: {table_info['title']}")
        if table_info['caption']:
            print(f"      Caption: {table_info['caption']}")

        gfm_lines = convert_table_to_gfm(lines, table_info)

        # Replace the table in the lines
        lines[table_info['start']:table_info['end']] = gfm_lines

    if not dry_run:
        new_content = '\n'.join(lines)
        filepath.write_text(new_content, encoding='utf-8')
        print(f"  Wrote {filepath}")

    return True


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Convert Pandoc simple tables to GFM pipe tables')
    parser.add_argument('paths', nargs='+', help='Files or directories to process')
    parser.add_argument('--dry-run', '-n', action='store_true', help='Show what would be done without making changes')

    args = parser.parse_args()

    files_processed = 0

    for path_str in args.paths:
        path = Path(path_str)

        if path.is_file():
            if path.suffix == '.md':
                if process_file(path, args.dry_run):
                    files_processed += 1
        elif path.is_dir():
            for md_file in path.rglob('*.md'):
                if process_file(md_file, args.dry_run):
                    files_processed += 1

    print(f"\nProcessed {files_processed} file(s)")
    if args.dry_run:
        print("(dry run - no changes made)")


if __name__ == '__main__':
    main()
