"""Controls for the Part 1 zero: (1) synthetic perturbation must flip every match to no-match;
(2) a stricter normaliser that keeps xref/docref TARGETS and MATH counts must agree."""
import sys, json, re, collections
sys.path.insert(0, '.')
from segs import parse, norm_en, git_show, git_ls
R = json.load(open('data/reattach.json'))
NEW='98a5fe2ff'; BOOK='books/efnafraedi-2e'
# index new EN, per module, both normalisers
def strict(s):
    x = s
    x = re.sub(r'\[\[xref:([^\]|]+)\]\]', r'<XREF \1>', x)
    x = re.sub(r'\[\[docref:([^\]]+)\]\]', r'<DOCREF \1>', x)
    x = re.sub(r'\[#([^\]]+)\]', r'<XREF \1>', x)   # legacy [#id]
    n = norm_en(x)
    return n
idx_n, idx_s = collections.defaultdict(set), collections.defaultdict(set)
for f in git_ls(NEW, f'{BOOK}/02-for-mt/'):
    m = re.match(rf'{BOOK}/02-for-mt/([^/]+)/([^/()]+)-segments\.en\.md$', f)
    if not m: continue
    for i, t in parse(git_show(NEW, f)):
        idx_n[m.group(2)].add(norm_en(t)); idx_s[m.group(2)].add(strict(t))
c = collections.Counter()
for r in R:
    if not r.get('enOld') or r['module'] == 'chapter-metadata': continue
    mod = r['module']; en = r['enOld']
    c['records'] += 1
    c['norm match'] += norm_en(en) in idx_n[mod]
    c['strict match (xref/docref targets kept)'] += strict(en) in idx_s[mod]
    # perturbation control: change one interior word character, append a token
    words = en.split(' ')
    j = len(words)//2
    pert1 = ' '.join(words[:j] + [words[j] + 'q'] + words[j+1:]) if words else en + 'q'
    pert2 = en + ' ZZZ'
    c['perturbed(word+q) still matches'] += norm_en(pert1) in idx_n[mod]
    c['perturbed(+ZZZ) still matches'] += norm_en(pert2) in idx_n[mod]
print(dict(c))
