import sys, json, subprocess
exec(open('/home/siggi/dev/scratch-c140/exo/fix/collapse_blend_lerp.py').read())
for p in sys.argv[1:]:
    t=open(p,encoding='utf-8').read()
    out,rep=collapse_blend_lerp(t)
    ref=subprocess.run([sys.executable,'/home/siggi/dev/scratch-c140/exo/tools/v1b.py',p,'/dev/stdout'],capture_output=True,text=True).stdout
    refsvg=ref[:ref.rfind('{"addOps"')] if '{"addOps"' in ref else ref
    print(p.split('/')[-2] if p.endswith('artwork.svg') else p.split('/')[-1], 'same-as-v1b' if out==refsvg else 'DIFFERS', 'identical-to-input' if out==t else 'changed', json.dumps(rep)[:300])
