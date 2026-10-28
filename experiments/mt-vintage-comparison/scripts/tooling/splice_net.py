import sys, os, json, re, collections
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import tcmeasure as M
REPO = '/home/siggi/dev/repos/namsbokasafn-efni'; os.chdir(REPO)
OLD, NEW, BOOK = '9a69414d5', '98a5fe2ff', 'efnafraedi-2e'
CONTENT = {'i','b','u','em','sub','sup','term','link','docref','fn','span'}
def plainx(s):
    s = re.sub(r'\{\{(/?)(\w+)\}\}', ' ', s); s = re.sub(r'\+\+([^+]+?)\+\+', r'\1', s)
    for _ in range(6):
        s2 = re.sub(r'\[\[(\w+):([^\[\]]*)\]\]', lambda m: (m.group(2).split('|')[0] if m.group(1) in CONTENT else ' ' + m.group(1).upper() + ' '), s)
        s2 = re.sub(r'\[\[(\w+)\]\]', ' ', s2)
        if s2 == s: break
        s = s2
    return re.sub(r'\s+', ' ', s).strip()
V = json.load(open('experiments/terminology-consistency/results/2026-10-10/verdicts-2026-10-10.json'))['answers']
bych = collections.defaultdict(list)
for a in V: bych[a['chapter']].append(a)
T = collections.Counter(); chars_spliced = 0
for ch, answers in sorted(bych.items()):
    mods = sorted({n.split('-segments')[0] for n in M.git_ls(NEW, f'books/{BOOK}/02-mt-output/{ch}') if n.endswith('-segments.is.md') and n.startswith('m')})
    data = {m: {'old': M.load_vintage(OLD, BOOK, ch, m), 'new': M.load_vintage(NEW, BOOK, ch, m)} for m in mods}
    terms = [(M.en_pattern(M.norm_en(a['en'])), M.stems(a['targetIcelandic'])) for a in answers]
    for m, d in data.items():
        en_n, is_n = d['new']; en_o, is_o = d['old']
        for key, etxt in en_n.items():
            if key.startswith(('glossary-term:', 'glossary-def:')) or key not in is_n: continue
            pe = M.plain(etxt)
            hits = [(p, s) for p, s in terms if p and p.search(pe)]
            if not hits: continue
            T['segments_touched'] += 1
            juneOK = key in en_o and key in is_o and is_o[key] and plainx(en_o[key]) == plainx(etxt)
            new_c = [M.carries(is_n[key], s) for _, s in hits]
            T['occ'] += len(hits); T['occ_miss_new'] += sum(1 for c in new_c if not c)
            if not juneOK:
                T['occ_miss_after'] += sum(1 for c in new_c if not c); continue
            old_c = [M.carries(is_o[key], s) for _, s in hits]
            fix = sum(1 for n, o in zip(new_c, old_c) if not n and o)
            brk = sum(1 for n, o in zip(new_c, old_c) if n and not o)
            if fix > brk:
                T['segments_spliced'] += 1; T['fixes'] += fix; T['breaks'] += brk; chars_spliced += len(is_o[key])
                LEG = re.compile(r'\{\{/?\w+\}\}|\[#[^\]\s]+\]|\]\((?:https?:|#|/)|__[^_\s][^_]*?__|\^[^^\s][^^]*?\^')
                if LEG.search(is_o[key]): T['spliced_with_legacy_markers'] += 1
                if '[[' in is_o[key] or '{{' in is_o[key]: T['spliced_with_any_markers'] += 1
                T['occ_miss_after'] += sum(1 for o in old_c if not o)
            else:
                T['occ_miss_after'] += sum(1 for c in new_c if not c)
T['june_chars_spliced'] = chars_spliced
print(json.dumps(T, indent=1))
