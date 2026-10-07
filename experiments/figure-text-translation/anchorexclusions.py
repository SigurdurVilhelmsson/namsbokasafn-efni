"""§C140 '6' R-20 - `anchorExclusions`: block keys whose label M1 (figlayout's source-anchored cuts) must
leave alone, read and checked.

STDLIB ONLY, and it imports nothing from this experiment - in particular not `_deps` - so
figure-compose.py (which must stay free of pikepdf / cairo / Pillow) can import it, and compose.py can
too. The heldvalues.py pattern, which owns the sibling table's format: figure-compose.py parses the
config once (figconfig.load), takes THIS figure's entry by EXACT basename (`for_figure`) and hands it
to compose.py in `<out>/anchor-exclusions.json` (`write_file` / `read_file`), on every run.

THE TABLE (figure-text.config.json `anchorExclusions`; ruling R-20, [USER] 2026-10-05)
--------------------------------------------------------------------------------------
    {"<figure basename>": {"<blocks.json key>": "<reason>", ...}, ...}

An entry turns off M1 - and nothing else - for EVERY block that carries that key in that figure:
compose.py lays the label out without `cues['texts']`, which is exactly M1 switched off
(test_figlayout_anchors.py C2), and records the block in compose-report.json `anchorExcluded`. The
reason is a string of more than MIN_REASON characters that cites the ruling (the validator's
reason rule for the policy tables, mirrored). A key is the block key with '|' between its source
lines - a one-line key never reaches M1, and figure-config-validate.js refuses it in CI; here it is
only inert (compose records `changed: false`), never refused.

REASONS - `AnchorExclusionError.reason` is a CONTRACT: figure-compose.py, compose.py and their tests
key on these strings, and the message names the basename and key wherever one is known.
  load_table    config-not-object, table-not-object
  for_figure    entry-not-object, entry-empty, key-empty, reason-not-string, reason-short
  read_file     unreadable, unparsable, file-not-object, missing-field, bad-field, key-empty,
                reason-not-string
"""
import json
import os
from pathlib import Path

TABLE = 'anchorExclusions'
# The policy tables' reason rule (figure-config-validate.js MIN_REASON): more than this many characters.
MIN_REASON = 40


class AnchorExclusionError(ValueError):
    """A table, entry or hand-off file that cannot be used. `reason` is one of the strings in the
    module docstring; `detail` says where and what."""

    def __init__(self, reason, detail=''):
        self.reason = reason
        self.detail = detail
        super().__init__(f'{reason}: {detail}' if detail else reason)


def _kind(v):
    return 'null' if v is None else type(v).__name__


def load_table(config):
    """-> the config's `anchorExclusions` object as written (entries NOT parsed - `for_figure` parses
    only the entry it is asked for). An ABSENT table is {}; a table that is present but not an object
    (null included) refuses: a table that cannot be read is never read as empty."""
    if not isinstance(config, dict):
        raise AnchorExclusionError('config-not-object', f'the config is {_kind(config)}, not an object')
    if TABLE not in config:
        return {}
    table = config[TABLE]
    if not isinstance(table, dict):
        raise AnchorExclusionError('table-not-object', f'{TABLE} must be an object, not {_kind(table)}')
    return table


def for_figure(table, basename):
    """-> {blockKey: reason} for the EXACT basename - no case fold, no prefix. {} when the figure has
    no entry. Only this entry is read, so a malformed entry for another figure never breaks this one
    (the validator catches it in CI). Raises AnchorExclusionError naming `anchorExclusions.<b>[<key>]`."""
    if basename not in table:
        return {}
    entry = table[basename]
    where = f'{TABLE}.{basename}'
    if not isinstance(entry, dict):
        raise AnchorExclusionError('entry-not-object',
                                   f'{where} must be an object of {{blockKey: reason}}, not {_kind(entry)}')
    if not entry:
        raise AnchorExclusionError('entry-empty', f'{where} must be a non-empty object of {{blockKey: reason}}')
    out = {}
    for key, reason in entry.items():
        if not isinstance(key, str) or key == '':
            raise AnchorExclusionError('key-empty', f'{where}: a block key must be a non-empty string')
        if not isinstance(reason, str):
            raise AnchorExclusionError('reason-not-string',
                                       f'{where}[{key!r}]: the reason must be a string, not {_kind(reason)}')
        if len(reason.strip()) <= MIN_REASON:
            raise AnchorExclusionError('reason-short',
                                       f'{where}[{key!r}]: the reason must be over {MIN_REASON} characters '
                                       f'and cite the ruling')
        out[key] = reason
    return out


def write_file(path, basename, config_path, exclusions):
    """Write the hand-off file `{basename, configPath, exclusions}` (exclusions may be {}), atomically:
    a `.tmp` beside it, then a rename."""
    path = Path(path)
    doc = {'basename': basename, 'configPath': str(config_path), 'exclusions': dict(exclusions)}
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    os.replace(tmp, path)


def read_file(path):
    """-> {'basename': str, 'configPath': str, 'exclusions': {blockKey: reason}}. Raises
    AnchorExclusionError on a missing or unreadable file, invalid JSON, a missing or wrong-typed
    field, an empty key or a non-string reason - never returns {} for a file it could not use."""
    try:
        raw = Path(path).read_bytes()
    except OSError as e:
        raise AnchorExclusionError('unreadable', f'{path}: {e.strerror or e}') from None
    try:
        doc = json.loads(raw.decode('utf-8'))
    except ValueError as e:                     # JSONDecodeError and UnicodeDecodeError
        raise AnchorExclusionError('unparsable', f'{path}: {e}') from None
    if not isinstance(doc, dict):
        raise AnchorExclusionError('file-not-object', f'{path}: {_kind(doc)}, not an object')
    for field in ('basename', 'configPath', 'exclusions'):
        if field not in doc:
            raise AnchorExclusionError('missing-field', f'{path}: no {field!r}')
    if not isinstance(doc['basename'], str) or not doc['basename']:
        raise AnchorExclusionError('bad-field', f'{path}: basename must be a non-empty string')
    if not isinstance(doc['configPath'], str):
        raise AnchorExclusionError('bad-field', f'{path}: configPath must be a string')
    if not isinstance(doc['exclusions'], dict):
        raise AnchorExclusionError('bad-field', f'{path}: exclusions must be an object')
    for key, reason in doc['exclusions'].items():
        if key == '':
            raise AnchorExclusionError('key-empty', f'{path}: a block key must be a non-empty string')
        if not isinstance(reason, str):
            raise AnchorExclusionError('reason-not-string', f'{path} exclusions[{key!r}]: not a string')
    return {'basename': doc['basename'], 'configPath': doc['configPath'],
            'exclusions': dict(doc['exclusions'])}
