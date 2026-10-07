"""§C140 '6' R-5c2 - `sourceAlignedBoxes`: figures whose schematic boxes keep the SOURCE's alignment,
read and checked.

STDLIB ONLY, and it imports nothing from this experiment - in particular not `_deps` - so
figure-compose.py (which must stay free of pikepdf / cairo / Pillow) can import it, and compose.py can
too. The anchorexclusions.py pattern: figure-compose.py parses the config once (figconfig.load), takes THIS
figure's entry by EXACT basename (`for_figure`) and hands it to compose.py in `<out>/source-boxes.json`
(`write_file` / `read_file`), on every run.

THE TABLE (figure-text.config.json `sourceAlignedBoxes`; ruling R-5c2, [USER] 2026-10-07, recorded in
docs/decisions/2026-10-07-hazdiamond-keeps-source-box-alignment.md)
--------------------------------------------------------------------------------------------------
    {"<figure basename>": "<reason>", ...}

An entry lays out EVERY schematic box of that figure - a box holding one label (R2: centred in the box)
and a shared box (R-2a: centred on each label's own source centre) alike - on the cell path with the
source's alignment (R3, figcontainers.cell_alignment); the container's `why` ends '+source-boxes', and
compose.py names each such block in compose-report.json `sourceAligned`. Cells and open labels are not
touched. The reason is a string of more than MIN_REASON characters that cites the ruling (the
validator's reason rule for the policy tables, mirrored). An entry that reaches no box is refused by
figure-compose.py's verify, never left inert.

REASONS - `SourceBoxesError.reason` is a CONTRACT: figure-compose.py, compose.py and their tests key on
these strings, and the message names the basename wherever one is known.
  load_table    config-not-object, table-not-object
  for_figure    reason-not-string, reason-short
  read_file     unreadable, unparsable, file-not-object, missing-field, bad-field
"""
import json
import os
from pathlib import Path

TABLE = 'sourceAlignedBoxes'
# The policy tables' reason rule (figure-config-validate.js MIN_REASON): more than this many characters.
MIN_REASON = 40


class SourceBoxesError(ValueError):
    """A table, entry or hand-off file that cannot be used. `reason` is one of the strings in the module
    docstring; `detail` says where and what."""

    def __init__(self, reason, detail=''):
        self.reason = reason
        self.detail = detail
        super().__init__(f'{reason}: {detail}' if detail else reason)


def _kind(v):
    return 'null' if v is None else type(v).__name__


def load_table(config):
    """-> the config's `sourceAlignedBoxes` object as written (entries NOT parsed - `for_figure` parses only
    the entry it is asked for). An ABSENT table is {}; a table that is present but not an object (null
    included) refuses: a table that cannot be read is never read as empty."""
    if not isinstance(config, dict):
        raise SourceBoxesError('config-not-object', f'the config is {_kind(config)}, not an object')
    if TABLE not in config:
        return {}
    table = config[TABLE]
    if not isinstance(table, dict):
        raise SourceBoxesError('table-not-object', f'{TABLE} must be an object, not {_kind(table)}')
    return table


def for_figure(table, basename):
    """-> the reason (str) for the EXACT basename - no case fold, no prefix - or None when the figure has
    no entry. Only this entry is read, so a malformed entry for another figure never breaks this one (the
    validator catches it in CI). Raises SourceBoxesError naming `sourceAlignedBoxes.<basename>`."""
    if basename not in table:
        return None
    reason = table[basename]
    where = f'{TABLE}.{basename}'
    if not isinstance(reason, str):
        raise SourceBoxesError('reason-not-string', f'{where}: the entry is a reason string, not {_kind(reason)}')
    if len(reason.strip()) <= MIN_REASON:
        raise SourceBoxesError('reason-short', f'{where}: the reason must be over {MIN_REASON} characters '
                                               f'and cite the ruling')
    return reason


def write_file(path, basename, config_path, reason):
    """Write the hand-off file `{basename, configPath, reason}` - `reason` None when the figure has no entry
    - atomically: a `.tmp` beside it, then a rename."""
    path = Path(path)
    doc = {'basename': basename, 'configPath': str(config_path), 'reason': reason}
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    os.replace(tmp, path)


def read_file(path):
    """-> {'basename': str, 'configPath': str, 'reason': str | None}. Raises SourceBoxesError on a missing
    or unreadable file, invalid JSON, a missing or wrong-typed field - never returns "off" for a file it
    could not use. An ABSENT `reason` is refused, and so is a blank one: only an explicit null means off."""
    try:
        raw = Path(path).read_bytes()
    except OSError as e:
        raise SourceBoxesError('unreadable', f'{path}: {e.strerror or e}') from None
    try:
        doc = json.loads(raw.decode('utf-8'))
    except ValueError as e:                     # JSONDecodeError and UnicodeDecodeError
        raise SourceBoxesError('unparsable', f'{path}: {e}') from None
    if not isinstance(doc, dict):
        raise SourceBoxesError('file-not-object', f'{path}: {_kind(doc)}, not an object')
    for field in ('basename', 'configPath', 'reason'):
        if field not in doc:
            raise SourceBoxesError('missing-field', f'{path}: no {field!r}')
    if not isinstance(doc['basename'], str) or not doc['basename']:
        raise SourceBoxesError('bad-field', f'{path}: basename must be a non-empty string')
    if not isinstance(doc['configPath'], str):
        raise SourceBoxesError('bad-field', f'{path}: configPath must be a string')
    if doc['reason'] is not None and (not isinstance(doc['reason'], str) or not doc['reason'].strip()):
        # ONE representation of "off": null. A blank string would switch compose.py ON (it tests `is not
        # None`) while the wrapper's verify reads it as off - two readings of one value.
        raise SourceBoxesError('bad-field', f'{path}: reason must be a non-blank string or null')
    return {'basename': doc['basename'], 'configPath': doc['configPath'], 'reason': doc['reason']}
