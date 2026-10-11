"""Independent dialect canonicaliser (verify-defects).
Legacy -> bracket conversion, then a recursive bracket parser that emits
canonical tokens. Synthetic attrs (term/fn ids, em class) are dropped;
target attrs (xref id, link url, docref target, placeholder index) are kept."""
import re
WRAP={'i','b','u','em','sub','sup','term','fn','link','xref','docref'}
ATOMIC_ARG={'MATH','MEDIA','TABLE'}
ATOMIC_BARE={'BR','SPACE'}
def legacy_to_bracket(t):
    # paired {{x}}...{{/x}}  (innermost first, repeat)
    pat=re.compile(r'\{\{(i|b|u|term|fn|em|sub|sup)\}\}((?:(?!\{\{/?\1\}\}).)*?)\{\{/\1\}\}',re.S)
    for _ in range(10):
        nt=pat.sub(lambda m: f'[[{m.group(1)}:{m.group(2)}]]',t)
        if nt==t: break
        t=nt
    t=re.sub(r'\+\+([^+\n]+?)\+\+',r'[[u:\1]]',t)
    t=re.sub(r'\{=(.+?)=\}',r'[[em:\1]]',t)
    t=re.sub(r'\[#([^\]\s]+)\]',r'[[xref:\1]]',t)
    t=re.sub(r'(?<!\[)\[([^\[\]]+)\]\(doc:([^)\s]*)\)',r'[[docref:\1|\2]]',t)
    t=re.sub(r'(?<!\[)\[(m\d{5}#[^\]\s]+)\](?!\()',r'[[docref:\1]]',t)
    t=re.sub(r'(?<!\[)\[([^\[\]]+)\]\(((?:https?://|www\.|#|/)[^)\s]*)\)',r'[[link:\1|\2]]',t)
    t=re.sub(r'(?<![_\w])__([^_\n]+?)__(?![_\w])',r'[[term:\1]]',t)
    t=re.sub(r'(?<![*\w])\*([^*\s][^*\n]*?)\*(?![*\w])',r'[[i:\1]]',t)
    t=re.sub(r'\^([^\^\s][^\^\n]{0,40}?)\^',r'[[sup:\1]]',t)
    t=re.sub(r'(?<!~)~([^~\s][^~\n]{0,40}?)~(?!~)',r'[[sub:\1]]',t)
    return t
def parse_brackets(t,i=0,stop=False):
    """returns (list of tokens, new index). token = ('txt',s) | ('open',type,attr) | ('close',type) | ('atom',type,arg)"""
    toks=[]; buf=[]
    n=len(t)
    while i<n:
        if t.startswith('[[',i):
            m=re.match(r'\[\[([A-Za-z]+)(\]\]|:)',t[i:])
            if m:
                typ=m.group(1)
                if buf: toks.append(('txt',''.join(buf))); buf=[]
                if m.group(2)==']]':
                    toks.append(('atom',typ,'')); i+=m.end(); continue
                j=i+m.end()
                # find matching ]] with depth
                depth=0; k=j; pipe=-1
                while k<n:
                    if t.startswith('[[',k): depth+=1; k+=2; continue
                    if t.startswith(']]',k):
                        if depth==0: break
                        depth-=1; k+=2; continue
                    if t[k]=='|' and depth==0: pipe=k
                    k+=1
                if k>=n:  # unterminated
                    toks.append(('bad',t[i:])); return toks,n
                body=t[j:k]
                if typ in ATOMIC_ARG or typ in ATOMIC_BARE:
                    toks.append(('atom',typ,body.strip()))
                else:
                    content,attr=(body,'')
                    if pipe>=0: content,attr=t[j:pipe],t[pipe+1:k]
                    if typ=='xref' and pipe<0 and not re.search(r'\s',content):
                        toks.append(('atom','xref',content)); i=k+2; continue
                    if typ=='docref' and pipe<0:
                        toks.append(('atom','docref',content)); i=k+2; continue
                    keep=attr if typ in ('link','xref','docref') else ''
                    toks.append(('open',typ,keep))
                    sub,_=parse_brackets(content)
                    toks.extend(sub)
                    toks.append(('close',typ))
                i=k+2; continue
        buf.append(t[i]); i+=1
    if buf: toks.append(('txt',''.join(buf)))
    return toks,i
def ws(s): return re.sub(r'\s+',' ',s).strip()
def canon(t):
    toks,_=parse_brackets(legacy_to_bracket(t or ''))
    out=[]
    for tk in toks:
        if tk[0]=='txt': out.append(tk[1])
        elif tk[0]=='open': out.append(f'⟨{tk[1]}{":"+tk[2] if tk[2] else ""}⟩')
        elif tk[0]=='close': out.append(f'⟨/{tk[1]}⟩')
        elif tk[0]=='atom': out.append(f'⟨{tk[1]}{":"+tk[2] if tk[2] else ""}/⟩')
        else: out.append('⟨BAD⟩'+tk[1])
    return ws(''.join(out))
def plain(t):
    """text content only: wrappers dropped, placeholders kept with index"""
    c=canon(t)
    c=re.sub(r'⟨/?(?:i|b|u|em|sub|sup|term|fn|link|xref|docref)(?::[^⟩]*)?⟩','',c)
    return ws(c)
def signature(t):
    """multiset of marker types (for conservation checks)"""
    toks,_=parse_brackets(legacy_to_bracket(t or ''))
    from collections import Counter
    c=Counter()
    for tk in toks:
        if tk[0]=='open': c[tk[1]]+=1
        elif tk[0]=='atom': c[tk[1]]+=1
        elif tk[0]=='bad': c['BAD']+=1
    return c
