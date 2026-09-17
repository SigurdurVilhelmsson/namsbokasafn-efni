// Census: captioned figures whose MT caption segment exists but whose injected caption is still the 01-source English.
// usage (repo root): node caption_census.cjs <book-slug>
const fs=require("fs");const {DOMParser}=require("@xmldom/xmldom");
const B=`books/${process.argv[2]}`; const P=new DOMParser({onError:()=>{}});
const tally={}, byCh={}, list=[];
const segText=(m,ch,seg)=>{ const f=`${B}/02-mt-output/${ch}/${m}-segments.is.md`; if(!fs.existsSync(f)) return null; const x=fs.readFileSync(f,"utf8"); const i=x.indexOf(`<!-- SEG:${seg} -->`); if(i<0) return null; const out=[]; for(const l of x.slice(i).split("\n").slice(1)){ if(l.startsWith("<!-- SEG:")) break; out.push(l);} return out.join("\n").trim(); };
const tdir=`${B}/03-translated/mt-preview`;
for (const ch of fs.readdirSync(tdir).filter(d=>/^(ch\d\d|appendices)$/.test(d))) for (const f of fs.readdirSync(`${tdir}/${ch}`).filter(f=>/^m\d+\.cnxml$/.test(f))) {
  const m=f.slice(0,-6); const src=`${B}/01-source/${ch}/${m}.cnxml`; if(!fs.existsSync(src)) continue;
  const dS=P.parseFromString(fs.readFileSync(src,"utf8"),"text/xml"), dT=P.parseFromString(fs.readFileSync(`${tdir}/${ch}/${f}`,"utf8"),"text/xml");
  const tF=new Map(Array.from(dT.getElementsByTagName("figure")).map(x=>[x.getAttribute("id"),x]));
  for (const fig of Array.from(dS.getElementsByTagName("figure"))) {
    const id=fig.getAttribute("id"), cap=Array.from(fig.childNodes).find(n=>n.nodeName==="caption"); if(!id||!cap||!cap.textContent.trim()) continue;
    let p=fig.parentNode, ctx="top"; while(p){ if(["example","exercise","note"].includes(p.nodeName)){ctx=p.nodeName+(fig.parentNode.nodeName==="para"?"/para":"/direct");break;} p=p.parentNode; }
    if(!segText(m,ch,`${m}:caption:${id}-caption`)){ tally[ctx+"|noMTseg"]=(tally[ctx+"|noMTseg"]||0)+1; continue; }
    const tc=tF.get(id)&&Array.from(tF.get(id).childNodes).find(n=>n.nodeName==="caption");
    const eng=!!tc&&tc.textContent.trim()===cap.textContent.trim(); const k=ctx+"|"+(eng?"ENGLISH":"translated"); tally[k]=(tally[k]||0)+1;
    if(eng){ byCh[ch]=(byCh[ch]||0)+1; list.push(`${ch}/${m} ${id} ${ctx}`); }
  }
}
console.log(process.argv[2], JSON.stringify(tally)); console.log("ENGLISH by chapter", JSON.stringify(byCh)); console.log(list.join("\n"));
