"""Census, per PDF content stream, of which operators occur INSIDE a BT..ET text object
(text depth > 0) and are NOT text-showing/positioning operators, plus a q/Q-stack-aware
"does a later paint depend on this persisted graphics state" flag.

This is a READ-ONLY measurement instrument. It does not strip anything and does not
import strip-text.py's `strip_text_ops` (that file is never edited or executed for its
side effects here) -- it re-implements the SAME walk shape (BT/ET depth tracking, one
instruction at a time via pikepdf.parse_content_stream) for a different purpose: tallying
instead of deleting.

Text operators (never counted, never trigger persistent-state tracking):
    Tc Tw Tz TL Tf Tr Ts Td TD Tm T* Tj TJ ' "
(BT and ET themselves are structural depth markers, not counted as "in class" ops.)

Persistent-state categories (a value that survives past ET -- deleting the BT..ET that
set it changes what later, unrelated painting looks like):
    fill-colour:       g rg k sc scn
    stroke-colour:     G RG K SC SCN
    fill-colourspace:  cs
    stroke-colourspace:CS
    extgstate:         gs
    linewidth:         w
    linecap:           J
    linejoin:          j
    miterlimit:        M
    dash:              d
    renderintent:      ri
    flatness:          i

Special graphics state (its own class, not "persistent-state" for the flag purposes,
because q/Q/cm are what SCOPE persistence, not what CARRIES it):
    q Q cm

Marked content:     BMC BDC EMC MP DP
Path construction/painting/clipping:
    m l c v y h re S s f F f* B B* b b* n W W*
XObject/shading/inline image:
    Do sh   (+ a pikepdf.ContentStreamInlineImage instruction, treated as the "BI" case)
Compatibility:      BX EX
Other:              anything else, named as found.

── THE "LATER PAINT DEPENDS ON IT" FLAG ────────────────────────────────────────────────
For every persistent-state operator found while text depth > 0 (i.e. inside some BT..ET),
we open an event, UNARMED. It becomes ARMED only when the ET that closes ITS OWN text
object is reached (never before -- a paint or a q/Q happening while still inside the same
BT does not yet count, so a mode-7 clip-then-Do-in-the-same-BT pattern cannot masquerade
as "a later paint after ET").

Once armed, the event is resolved by whichever of these happens FIRST, scanning forward
in the SAME content stream (page and each /Form are independent scopes, exactly as
strip-text.py strips them independently -- state set inside a Form does not leak to the
page or to a sibling Form):

  * a q/Q IMBALANCE: the running q/Q-stack depth (gsdepth, tracked across the WHOLE
    stream regardless of text nesting) drops below the depth the event was set at
    (setDepth). This is what makes the flag "q/Q-aware": a q pushed BEFORE the BT and
    popped by a Q after the ET reverts whatever ambient state was in effect before the
    q, which silently un-does the persisted value with no operator ever "resetting" it
    by name. -> closed_by = 'Q'
  * the SAME CATEGORY being set again, at gsdepth EXACTLY EQUAL to the event's setDepth
    (an exact-scope overwrite -- a nested, deeper set is its own new event and does not
    retire this one, since a later Q could still restore THIS value). This check fires
    whether the re-set happens at text depth 0 or inside a later BT (colour is colour
    regardless of what nests it). -> closed_by = 'reset'

Until closed, every paint-equivalent instruction seen (f F f* B B* b b* S s sh Do, or an
inline image), AT ANY TEXT DEPTH, while gsdepth <= setDepth (i.e. the persisted value is
still in the ambient scope, not shadowed by a still-open nested q), increments
`paints_in_window`. This is a COUNT, not a first-hit boolean, on purpose: it is a
predicted number (>=7 on the combustion positive control) rather than a bare "yes".

▶ THIS IS A DELIBERATE OVER-APPROXIMATION, documented so nobody reads it as a formal
verifier: (1) a nested q that both sets the SAME category to a DIFFERENT value and later
paints, then Qs back out, is invisible to this pass (its own event, correctly opened and
resolved, is separate bookkeeping) but the outer event keeps counting paints inside that
nested scope too, even though those paints are visually using the NESTED value, not the
outer one -- the outer event's paint count can therefore over-state how many paints truly
still show the outer colour. (2) `cs`/`CS` resetting a colour space can itself reset the
ambient colour to a space-specific default without any `g`/`rg`/`k` appearing, which this
does not model. The render step -- rendering the artwork with and without the BT..ET
content and diffing pixels -- is the arbiter of ACTUAL visual impact; this census exists
to say WHERE to look, not to replace that comparison.
"""
import collections

import pikepdf

TEXT_OPS = {
    'Tc', 'Tw', 'Tz', 'TL', 'Tf', 'Tr', 'Ts', 'Td', 'TD', 'Tm', 'T*', 'Tj', 'TJ', "'", '"',
}

CATEGORY = {
    'g': 'fill-colour', 'rg': 'fill-colour', 'k': 'fill-colour',
    'sc': 'fill-colour', 'scn': 'fill-colour',
    'G': 'stroke-colour', 'RG': 'stroke-colour', 'K': 'stroke-colour',
    'SC': 'stroke-colour', 'SCN': 'stroke-colour',
    'cs': 'fill-colourspace', 'CS': 'stroke-colourspace',
    'gs': 'extgstate', 'w': 'linewidth', 'J': 'linecap', 'j': 'linejoin',
    'M': 'miterlimit', 'd': 'dash', 'ri': 'renderintent', 'i': 'flatness',
}
PERSISTENT_GS = set(CATEGORY)

SPECIAL_GS = {'q', 'Q', 'cm'}
MARKED_CONTENT = {'BMC', 'BDC', 'EMC', 'MP', 'DP'}
PATH_OPS = {
    'm', 'l', 'c', 'v', 'y', 'h', 're',
    'S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'n', 'W', 'W*',
}
XOBJECT_OPS = {'Do', 'sh'}
COMPAT_OPS = {'BX', 'EX'}
PAINT_OPS = {'f', 'F', 'f*', 'B', 'B*', 'b', 'b*', 'S', 's', 'sh', 'Do'}  # BI is separate

CLASS_LABELS = {
    'persistent-gstate': 'persistent graphics state',
    'special-gstate': 'special graphics state',
    'marked-content': 'marked content',
    'path': 'path construction/painting/clipping',
    'xobject': 'XObject/shading/inline image',
    'compat': 'compatibility',
    'other': 'other',
}


def classify(op):
    if op in PERSISTENT_GS:
        return 'persistent-gstate'
    if op in SPECIAL_GS:
        return 'special-gstate'
    if op in MARKED_CONTENT:
        return 'marked-content'
    if op in PATH_OPS:
        return 'path'
    if op in XOBJECT_OPS:
        return 'xobject'
    if op in COMPAT_OPS:
        return 'compat'
    return 'other'


def census_stream(source, stream_label):
    """`source` is bytes/bytearray, or a pikepdf.Stream/Page-like object accepted by
    `pikepdf.parse_content_stream`. -> dict of per-stream tallies. Never mutates `source`
    when it is already a pikepdf object; a throwaway Pdf owns any stream built from bytes
    and is kept alive for the duration of this call (mirrors strip-text.py's `owner`
    pattern -- `make_stream(...)` inline would let the owner die mid-parse).
    """
    owner = None
    if isinstance(source, (bytes, bytearray)):
        owner = pikepdf.new()
        source = owner.make_stream(bytes(source))
    ops = list(pikepdf.parse_content_stream(source))

    depth = 0          # BT..ET nesting depth (text depth)
    gsdepth = 0        # q/Q stack depth, tracked across the WHOLE stream
    bt_et_count = 0
    tr_modes = set()
    op_counts = collections.Counter()
    class_counts = collections.Counter()
    all_events = []     # every persistent-gstate-inside-BT event ever opened, in order
    bt_net_q = []        # net q-Q strictly inside each TOP-LEVEL BT..ET, in order
    cur_bt_net = None    # active only while depth == 1 (top-level BT open)
    malformed_unclosed_bt = 0   # BT open at EOF (never reached matching ET)

    def resolve_reset(op_name, at_gsdepth):
        cat = CATEGORY[op_name]
        for e in all_events:
            if e['armed'] and not e['closed'] and e['category'] == cat and e['setDepth'] == at_gsdepth:
                e['closed'] = True
                e['closed_by'] = 'reset'

    def resolve_paint():
        # NOTE: no gsdepth comparison here on purpose. `resolve_qpop` already closes an
        # event the instant gsdepth drops BELOW its setDepth, so by the invariant it
        # maintains, every event that is still `armed and not closed` at this point is
        # necessarily at a gsdepth >= its setDepth (still within, or nested inside, the
        # scope where it was set) -- a bare `q` pushed AFTER the set does not clear the
        # inherited value, so a paint inside that nested q still shows it and must count.
        for e in all_events:
            if e['armed'] and not e['closed']:
                e['paints_in_window'] += 1

    def resolve_qpop():
        for e in all_events:
            if e['armed'] and not e['closed'] and e['setDepth'] > gsdepth:
                e['closed'] = True
                e['closed_by'] = 'Q'

    for ins in ops:
        if isinstance(ins, pikepdf.ContentStreamInlineImage):
            if depth > 0:
                op_counts['BI'] += 1
                class_counts['xobject'] += 1
            else:
                resolve_paint()
            continue

        op = str(ins.operator)
        operands = [str(o) for o in ins.operands]

        if op == 'BT':
            if depth == 0:
                bt_et_count += 1
                cur_bt_net = 0
            depth += 1
            continue
        if op == 'ET':
            depth = max(0, depth - 1)
            if depth == 0:
                if cur_bt_net is not None:
                    bt_net_q.append(cur_bt_net)
                    cur_bt_net = None
                # Arm every not-yet-armed event: only events from the just-closed BT can
                # be unarmed at this point (a text object cannot legally re-open before
                # its own ET, so nothing else is left unarmed in between).
                for e in all_events:
                    if not e['armed']:
                        e['armed'] = True
            continue

        if op == 'Tr' and depth > 0:
            try:
                tr_modes.add(int(operands[0]))
            except (ValueError, IndexError):
                pass

        if depth > 0:
            if op not in TEXT_OPS:
                op_counts[op] += 1
                class_counts[classify(op)] += 1
                if op in PERSISTENT_GS:
                    resolve_reset(op, gsdepth)   # a re-set, even inside a later BT, retires a matching-scope event
                    all_events.append({
                        'op': op, 'operands': operands, 'category': CATEGORY[op],
                        'setDepth': gsdepth, 'armed': False, 'closed': False,
                        'closed_by': None, 'paints_in_window': 0,
                    })
            if op == 'q':
                gsdepth += 1
                if depth == 1 and cur_bt_net is not None:
                    cur_bt_net += 1
            elif op == 'Q':
                gsdepth = max(0, gsdepth - 1)
                if depth == 1 and cur_bt_net is not None:
                    cur_bt_net -= 1
                resolve_qpop()
            elif op in PAINT_OPS:
                resolve_paint()
        else:
            # depth == 0
            if op == 'q':
                gsdepth += 1
            elif op == 'Q':
                gsdepth = max(0, gsdepth - 1)
                resolve_qpop()
            elif op in PAINT_OPS:
                resolve_paint()
            elif op in PERSISTENT_GS:
                resolve_reset(op, gsdepth)

    if cur_bt_net is not None:
        # a BT with no matching ET before EOF: real, and must not be silently dropped.
        malformed_unclosed_bt += 1

    del owner
    return {
        'stream': stream_label,
        'bt_et_count': bt_et_count,
        'malformed_unclosed_bt': malformed_unclosed_bt,
        'tr_modes': sorted(tr_modes),
        'op_counts': dict(op_counts),
        'class_counts': dict(class_counts),
        'bt_net_q': bt_net_q,
        'events': all_events,   # every field above is JSON-serialisable already
    }


def walk_pdf(pdf):
    """Census page 1's content stream and every reachable /Form XObject, recursively,
    objgen-deduplicated -- the SAME reachability strip-text.py's `strip_text` walks
    (page /Resources -> /XObject -> /Subtype /Form -> that form's own /Resources; no
    /Pattern, no annotation appearance streams, no /SMask soft-mask groups). One
    census_stream() call per reachable stream; page and each form are independent scopes.

    -> {'streams': [per-stream dict, ...], 'forms_visited': int, 'unparsable': [str, ...]}
    `unparsable` names any /Form whose content stream could not be tokenised (objgen +
    exception) -- recorded, never silently skipped, matching strip-text.py's own R-9-era
    discipline. A page content-stream parse failure is NOT caught here; it is the
    caller's job to decide the whole figure is parse-fail (mirrors strip_text raising
    UnparsableStream on the page).
    """
    from _deps import read_content

    page = pdf.pages[0]
    content = read_content(page).encode('latin-1')
    streams = [census_stream(content, 'PAGE')]

    seen = set()
    unparsable = []
    forms_visited = 0

    def walk(res):
        nonlocal forms_visited
        xobjects = res.get('/XObject')
        if xobjects is None:
            return
        for name, xobj in xobjects.items():
            if str(xobj.get('/Subtype', '')) != '/Form':
                continue
            if not isinstance(xobj, pikepdf.Stream):
                continue
            objgen = xobj.objgen
            if objgen in seen:
                continue
            seen.add(objgen)
            forms_visited += 1
            label = f'FORM{name}:{objgen}'
            try:
                data = xobj.read_bytes()
                streams.append(census_stream(data, label))
            except Exception as exc:  # noqa: BLE001 - named and recorded, never swallowed
                unparsable.append(f'{objgen} ({name}): {type(exc).__name__}: {exc}')
                continue
            sub = xobj.get('/Resources')
            if sub is not None:
                walk(sub)

    res = pikepdf.Page(page).obj.get('/Resources')
    if res is not None:
        walk(res)

    return {'streams': streams, 'forms_visited': forms_visited, 'unparsable': unparsable}
