import json, collections
rows = [json.loads(l) for l in open('figs.jsonl')]
ok = [r for r in rows if r['status'] == 'read-ok']
bought = set(open('/home/siggi/dev/scratch-c140/c2/names34.txt').read().split())
C = collections.Counter()
italic_send = []; mixed_bold_send = []; arc_send = []; nobase = []; orphan_send = []
for f in ok:
    blocks = f.get('blocks') or []
    composed = any(b['send'] for b in blocks)
    for b in blocks:
        C['blocks'] += 1
        if composed: C['blocks in composed figs'] += 1
        if b['send']: C['send:true'] += 1
        if b['send'] and b['has_italic']:
            C['send:true italic'] += 1
            italic_send.append((f['basename'], b['key'], b['c2_italic_mixed_line'], b['c2_italic_whole_block'], b['c2_italic_texts'], b['c2_token_kinds']))
        if b['send'] and b['has_mixed_weight_line']:
            mixed_bold_send.append((f['basename'], b['key']))
        if b['arc']:
            C['arc'] += 1
            if b['send']:
                arc_send.append((f['basename'], b['key'], b['arc_mixed_size'], b['c2_script_chars'], b['sizes']))
        if b['send'] and b['c2_nobase_tokens']:
            nobase.append((f['basename'], b['key'], b['c2_nobase_tokens']))
        if b['send'] and b['c2_script_only_line']:
            orphan_send.append((f['basename'], b['key']))
        if b['send'] and b['c2_script_chars']:
            C['send:true with c2-rule script chars'] += 1
# control on the 34
b34 = [b for f in ok if f['basename'] in bought for b in f['blocks']]
print('CONTROL 34: blocks', len(b34), 'send:true', sum(b['send'] for b in b34), 'blocks with c2 script chars', sum(1 for b in b34 if b['c2_script_chars']), 'script chars', sum(b['c2_script_chars'] for b in b34))
print(dict(C))
im = collections.Counter((x[2], x[3]) for x in italic_send)
print('send:true italic blocks by (italic mixed within a line, whole block italic):', dict(im))
print('  figures:', len({x[0] for x in italic_send}))
mixed = [x for x in italic_send if x[2]]
uniform_not_whole = [x for x in italic_send if not x[2] and not x[3]]
print('  mixed-in-line examples (first 25):')
for x in mixed[:25]: print('    ', x[0][9:], repr(x[1]), 'italic runs', x[4], 'token kinds', x[5])
print('  italic but not mixed in any line and not whole block (lines differ):', len(uniform_not_whole))
for x in uniform_not_whole[:10]: print('    ', x[0][9:], repr(x[1]), x[4])
print('  mixed-in-line by chapter:', collections.Counter(x[0][9:11] for x in mixed))
print('send:true bold-mixed-in-line blocks:', len(mixed_bold_send), mixed_bold_send)
print('send:true arc blocks:', len(arc_send), 'with size variation', sum(1 for x in arc_send if x[2]))
for x in arc_send: print('    ', x)
print('send:true blocks with a no-base (all-styled) token:', len(nobase)); [print('    ', x) for x in nobase[:30]]
print('send:true blocks with a line made only of script-sized runs:', len(orphan_send)); [print('    ', x) for x in orphan_send[:30]]
