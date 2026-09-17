import sys, json
from pathlib import Path
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation')
import pikepdf
import census_lib as C

path = sys.argv[1]
with pikepdf.open(path) as pdf:
    result = C.walk_pdf(pdf)

any_k_flag = False
for s in result['streams']:
    for e in s['events']:
        if e['op'] in ('k', 'K') and e['armed'] and not e['closed'] and e['paints_in_window'] >= 1:
            print('FOUND', s['stream'], e)
            any_k_flag = any_k_flag or e['paints_in_window'] >= 7

print('forms_visited', result['forms_visited'], 'unparsable', result['unparsable'])
for s in result['streams']:
    print(s['stream'], 'bt_et_count', s['bt_et_count'], 'class_counts', s['class_counts'])

print('DONE any_k_flag_ge7=', any_k_flag)
