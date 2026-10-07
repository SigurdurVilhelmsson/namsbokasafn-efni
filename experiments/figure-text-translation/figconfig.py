"""The ONE parse of `figure-text.config.json` for the composer's tools (§C140 '6', G7).

STDLIB ONLY, and it imports nothing from this experiment - in particular not `_deps` - so
figure-compose.py (which must stay free of pikepdf / cairo / Pillow) can import it, and so can
figure-prepare.py. Every table reader (heldvalues.py, anchorexclusions.py) takes the object `load`
returns; none of them opens the file itself, so a config is read once per run, with one rule and one
wording for what cannot be read.

A REPEATED KEY IS REFUSED, NEVER COLLAPSED (a skeptic's finding, 2026-10-03, first enforced in
figure-compose.py's heldBlockValues pre-flight). json.loads - and JSON.parse in the validator - keeps
only the LAST of two equal keys, so a figure's entry written twice (say one per value-sheet row), or
a block key repeated inside one, silently drops the first value. The hook sees every object's keys
AFTER decoding, so two spellings of one key (a JSON escape) collide as JSON itself collides them;
`dict(pairs)` keeps json's own last-wins result. ANY depth, deliberately: like a syntax error, a
repeat anywhere is a file JSON cannot read faithfully, so it refuses every figure - unlike a malformed
entry for ANOTHER figure, which a table reader never reads. tools/lib/figure-config-validate.js's
`repeatedKeyProblems` is the CI half of the same rule.

`ConfigError` carries the whole message; a caller wraps it (figure-compose.py: ComposeError) and adds
nothing to the wording, so every tool says the same thing about the same file.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent          # never process.cwd() - repo rule
# The committed policy config: the SAME file sources.load_config and heldvalues.CONFIG_PATH name.
CONFIG_PATH = HERE / 'figure-text.config.json'


class ConfigError(ValueError):
    """The policy config cannot be used: unreadable, invalid JSON, or a repeated key."""


def load(config_path=CONFIG_PATH):
    """-> the parsed config (any JSON value; a table reader checks the shape it needs). Raises
    ConfigError: a config that cannot be read is never read as empty, and one that repeats a key at
    any depth is never read at all."""
    repeated = []

    def _note_repeats(pairs):
        seen = set()
        for k, _ in pairs:
            if k in seen:
                repeated.append(k)
            seen.add(k)
        return dict(pairs)

    try:
        config = json.loads(Path(config_path).read_text(encoding='utf-8'), object_pairs_hook=_note_repeats)
    except Exception as exc:                      # noqa: BLE001 - reported, not raised
        raise ConfigError(
            f'the policy config {config_path} cannot be read ({type(exc).__name__}: {exc}) - a policy '
            f'table that cannot be read is never read as empty') from None
    if repeated:
        raise ConfigError(
            f'the policy config {config_path} repeats the key(s) {sorted(set(repeated))!r} - JSON keeps '
            f'only the last of a repeated key, so an earlier entry or value would be dropped silently; '
            f'merge them into one')
    return config
