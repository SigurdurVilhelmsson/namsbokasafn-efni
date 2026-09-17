"""Synthetic-fixture self-test for census_lib.census_stream: every operator class,
plus the four documented flag scenarios. Run standalone; prints PASS/FAIL per case and
a final DONE marker. No PDF file is needed -- census_stream accepts raw bytes directly.
"""
import sys
from pathlib import Path

sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
sys.path.insert(0, str(Path(__file__).resolve().parent))
import census_lib as C

FAILS = []


def check(label, cond, detail=''):
    status = 'PASS' if cond else 'FAIL'
    print(f'{status}  {label}  {detail}')
    if not cond:
        FAILS.append(label)


# ── A. one of every class, some INSIDE BT (text depth > 0) ─────────────────────────────
stream_a = b"""
1 0 0 RG
q 1 0 0 1 10 10 cm Q
BDC /Span <</ActualText (x)>>
0 0 100 100 re f
EMC
/Fm0 Do
/Sh0 sh
BX /Unknown true EX
BT
1 0 0 1 0 0 Tm
1 0 0 rg
0.5 w
0 J
0 j
1 1 M
[] 0 d
0 ri
0 i
q Q
BX EX
BMC /P
EMC
0 0 10 10 re f
100 0 d0
BI /W 1 /H 1 /BPC 8 /CS /G ID \xff EI
ET
"""
res_a = C.census_stream(stream_a, 'A')
print('A op_counts:', res_a['op_counts'])
print('A class_counts:', res_a['class_counts'])
check('A: bt_et_count == 1', res_a['bt_et_count'] == 1)
for cls in ('persistent-gstate', 'special-gstate', 'marked-content', 'path', 'xobject', 'compat', 'other'):  # noqa: E501 -- keys must match census_lib.classify()'s return values exactly
    check(f'A: class {cls} present with count > 0', res_a['class_counts'].get(cls, 0) > 0,
          f"got {res_a['class_counts'].get(cls, 0)}")
check('A: BI counted as xobject op', res_a['op_counts'].get('BI', 0) == 1)
check('A: d0 counted as other', res_a['op_counts'].get('d0', 0) == 1)
# The FIRST `q ... cm ... Q` block is entirely OUTSIDE any BT (depth 0 throughout), and
# the spec counts only instructions at text depth > 0 -- so only the SECOND `q Q` pair
# (the one written inside the BT block) may be tallied. q=1, Q=1 is therefore correct,
# not q=2, Q=2; this assertion pins that (depth-0 ops must NOT be tallied at all).
check('A: only the q/Q pair written INSIDE BT is tallied (depth-0 q/cm/Q are not counted)',
      res_a['op_counts'].get('q', 0) == 1 and res_a['op_counts'].get('Q', 0) == 1
      and res_a['op_counts'].get('cm', 0) == 0,
      f"q={res_a['op_counts'].get('q')} Q={res_a['op_counts'].get('Q')} cm={res_a['op_counts'].get('cm')}")
check('A: net q/Q inside the single BT is 0 (q Q balanced, plus BX/EX/BMC/EMC/re/f/d0/BI unaffected)',
      res_a['bt_net_q'] == [0], f"bt_net_q={res_a['bt_net_q']}")
check('A: no malformed unclosed BT', res_a['malformed_unclosed_bt'] == 0)
# 8 persistent-gstate ops were written inside BT: rg w J j M d ri i (each its own category
# except none share one here) -> 8 events, one per occurrence.
persistent_events = [e for e in res_a['events']]
check('A: 8 persistent-gstate-inside-BT events opened (rg w J j M d ri i)',
      len(persistent_events) == 8, f"count={len(persistent_events)} ops={[e['op'] for e in persistent_events]}")


# ── B1. paint after ET, before any reset -> flag True, count >= 1 ──────────────────────
stream_b1 = b"""
0 0 0 k
BT
1 0 0 1 0 0 Tm
0 0 0 k
ET
0 0 10 10 re
f
"""
res_b1 = C.census_stream(stream_b1, 'B1')
ev = res_b1['events'][0]
check('B1: event armed', ev['armed'])
check('B1: event NOT closed (nothing reset it)', not ev['closed'])
check('B1: paints_in_window >= 1', ev['paints_in_window'] >= 1, f"got {ev['paints_in_window']}")

# ── B2. reset at depth 0, THEN paint -> closed by reset, paint not counted ─────────────
stream_b2 = b"""
BT
1 0 0 1 0 0 Tm
0 0 0 k
ET
1 1 1 k
0 0 10 10 re
f
"""
res_b2 = C.census_stream(stream_b2, 'B2')
ev = res_b2['events'][0]
check('B2: event closed by reset', ev['closed'] and ev['closed_by'] == 'reset',
      f"closed={ev['closed']} by={ev['closed_by']}")
check('B2: paints_in_window == 0 (paint came after the reset)', ev['paints_in_window'] == 0,
      f"got {ev['paints_in_window']}")

# ── B3. q BEFORE BT, Q AFTER ET, then paint -> Q invalidates, paint not counted ────────
stream_b3 = b"""
q
BT
1 0 0 1 0 0 Tm
0 0 0 k
ET
Q
0 0 10 10 re
f
"""
res_b3 = C.census_stream(stream_b3, 'B3')
ev = res_b3['events'][0]
check('B3: event closed by Q', ev['closed'] and ev['closed_by'] == 'Q',
      f"closed={ev['closed']} by={ev['closed_by']}")
check('B3: paints_in_window == 0 (paint came after the invalidating Q)', ev['paints_in_window'] == 0,
      f"got {ev['paints_in_window']}")

# ── B4. paint INSIDE the same BT (before its own ET), then nothing after -> not counted
#        (arming happens only at ET, so a pre-ET paint must not retroactively count) ───
stream_b4 = b"""
BT
1 0 0 1 0 0 Tm
0 0 0 k
0 0 10 10 re
f
ET
"""
res_b4 = C.census_stream(stream_b4, 'B4')
ev = res_b4['events'][0]
check('B4: event armed (ET reached)', ev['armed'])
check('B4: event NOT closed', not ev['closed'])
check('B4: paints_in_window == 0 (the paint was BEFORE arming)', ev['paints_in_window'] == 0,
      f"got {ev['paints_in_window']}")

# ── B5. nested q AFTER ET does not retire the event by itself, but a Q popping past
#         setDepth does -- and a paint INSIDE that nested q still counts (over-approx,
#         documented) ─────────────────────────────────────────────────────────────────
stream_b5 = b"""
BT
1 0 0 1 0 0 Tm
0 0 0 k
ET
q
0 0 10 10 re
f
Q
0 0 10 10 re
f
"""
res_b5 = C.census_stream(stream_b5, 'B5')
ev = res_b5['events'][0]
check('B5: not closed (net q/Q balanced, ends at gsdepth 0 == setDepth)', not ev['closed'])
check('B5: both paints counted (2)', ev['paints_in_window'] == 2, f"got {ev['paints_in_window']}")

# ── C. positive control for bt_net_q: a q with NO matching Q inside one BT must show
#      up as a NONZERO net, not just correctly report zero when balanced (A and B5 above
#      only exercise the balanced case) ───────────────────────────────────────────────
stream_c = b"""
BT
1 0 0 1 0 0 Tm
q
0 0 0 k
ET
"""
res_c = C.census_stream(stream_c, 'C')
check('C: bt_net_q == [1] (one q, no matching Q, inside the BT)', res_c['bt_net_q'] == [1],
      f"got {res_c['bt_net_q']}")
ev_c = res_c['events'][0]
check('C: the k event still armed at ET despite the unbalanced q', ev_c['armed'] and not ev_c['closed'])

print(f"\nDONE fails={len(FAILS)} {'ALL PASS' if not FAILS else FAILS}")
