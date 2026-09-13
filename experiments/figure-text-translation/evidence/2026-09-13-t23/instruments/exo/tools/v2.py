"""V2 (probe, not the recommended fix): same trivial-lerp ops as V1, but replace the use site
<g filter="url(#F_add)" transform="T"><rect .../></g>  with
<g transform="T" clip-path="url(#v2clip-k)" style="isolation:isolate"><use xlink:href="#D"/><g style="mix-blend-mode:M"><use xlink:href="#S"/></g></g>
(clip = the filter region). No feImage on the path. Non-trivial ops left as cairo wrote them."""
import sys, re, json
exec(open('/home/siggi/dev/scratch-c140/exo/tools/v1.py').read().split('out=txt; n=0')[0].replace("src, dst = sys.argv[1], sys.argv[2]","src, dst = sys.argv[1], sys.argv[2]"))
# plan: fa -> (fb, ma); need S, D, mode, W, H
out=txt; defs=[]; n=0
for fa,(fb,ma) in plan.items():
    bf=ids[fb]; bfe=[x for x in bf if tag(x)=='feImage']; mode=[x for x in bf if tag(x)=='feBlend'][0].get('mode')
    S=ref(bfe[0]); D=ref(bfe[1]); W=bfe[0].get('width'); H=bfe[0].get('height')
    pat=re.compile(r'<g filter="url\(#%s\)" transform="([^"]*)">\n<rect x="0" y="0" width="%s" height="%s" fill="rgb\(0%%, 0%%, 0%%\)" fill-opacity="1"/>\n</g>' % (re.escape(fa), re.escape(W), re.escape(H)))
    k=len(pat.findall(out)); rep.setdefault('v2sites',0); rep['v2sites']+=k
    cid=f'v2clip-{fa}'
    defs.append(f'<clipPath id="{cid}"><rect x="0" y="0" width="{W}" height="{H}"/></clipPath>')
    out=pat.sub(lambda m: f'<g transform="{m.group(1)}" clip-path="url(#{cid})" style="isolation:isolate">\n<use xlink:href="#{D}"/>\n<g style="mix-blend-mode:{mode}"><use xlink:href="#{S}"/></g>\n</g>', out)
    n+=1
i=out.index('<defs>')+len('<defs>')
out=out[:i]+'\n'+'\n'.join(defs)+out[i:]
rep['rewrittenV2']=n
open(dst,'w',encoding='utf-8').write(out); print(json.dumps(rep))
