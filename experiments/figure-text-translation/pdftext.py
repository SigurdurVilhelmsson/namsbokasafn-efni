"""Parse a PDF page content stream into positioned text runs.
Tracks the PDF text-matrix state machine (Tm / Td / TD / TJ / Tj / Tf / colour)
so each run carries its absolute user-space origin, size, rotation and colour.
"""
import re, sys, math, json

TOKEN = re.compile(r'''
   (?P<num>-?\d*\.?\d+)
 | (?P<str>\((?:[^()\\]|\\.)*\))
 | (?P<name>/[^\s/\[\]()<>]+)
 | (?P<arr>\[(?:[^\]\\]|\\.)*\])
 | (?P<op>[A-Za-z'"*]+)
''', re.X)

def mul(m1, m2):
    a1,b1,c1,d1,e1,f1 = m1; a2,b2,c2,d2,e2,f2 = m2
    return (a1*a2+b1*c2, a1*b2+b1*d2,
            c1*a2+d1*c2, c1*b2+d1*d2,
            e1*a2+f1*c2+e2, e1*b2+f1*d2+f2)

def unescape(s):
    s = s[1:-1]
    out=[]; i=0
    while i < len(s):
        if s[i]=='\\':
            n=s[i+1]
            mapping={'n':'\n','r':'\r','t':'\t','b':'\b','f':'\f','(':'(',')':')','\\':'\\'}
            if n in mapping: out.append(mapping[n]); i+=2
            elif n.isdigit():
                j=i+1; oct_=''
                while j<len(s) and len(oct_)<3 and s[j].isdigit(): oct_+=s[j]; j+=1
                out.append(chr(int(oct_,8))); i=j
            else: out.append(n); i+=2
        else: out.append(s[i]); i+=1
    return ''.join(out)

def strip_inline_images(content):
    """Remove BI ... ID <raw bytes> EI blocks.

    An inline image's payload is arbitrary BINARY sitting in the content stream.
    A tokenizer that walks through it finds stray parentheses and reads megabytes
    of pixel data as text: CNX_Chem_01_04_CylGold reported 373 words where the
    figure has about 28, and the junk looked like plausible blocks.
    """
    out = []
    i = 0
    while True:
        m = re.compile(r'(?<![\w/])BI(?![\w])').search(content, i)
        if not m:
            out.append(content[i:]); break
        out.append(content[i:m.start()])
        d = re.compile(r'(?<![\w/])ID(?![\w])').search(content, m.end())
        if not d:
            out.append(content[m.start():]); break
        # payload ends at whitespace-delimited EI
        e = re.compile(r'\sEI(?![\w])').search(content, d.end() + 1)
        if not e:
            break
        i = e.end()
    return ''.join(out)


# WinAnsi (CP1252) is NOT Latin-1 in 0x80-0x9F: that range holds smart quotes,
# dashes and similar. Decoding it as Latin-1 leaves control characters that reach
# the MT and get drawn back as nothing - "\x93Final\x94 volume" is really
# "\u201cFinal\u201d volume", and \x96 is an en dash, not a minus-shaped blank.
_CP1252_HIGH = {c: bytes([c]).decode('cp1252', 'replace') for c in range(0x80, 0xA0)}


def winansi(text):
    return ''.join(_CP1252_HIGH.get(ord(ch), ch) for ch in text)


def parse(content, widths):
    """widths: {fontres: {charcode: width/1000}}  -> returns list of run dicts

    The text rendering matrix is  [size] x Tm x CTM.  Both halves are load-bearing
    and different producers use different halves: Illustrator folds the font size
    and the rotation into Tm and leaves CTM identity; Ghostscript (what you get
    from an EPS) leaves Tm identity and puts the rotation in CTM via `cm`.  Reading
    only Tm makes every Ghostscript run report as unrotated, at the wrong place.
    """
    content = strip_inline_images(content)
    runs=[]; stack=[]
    tm=tlm=(1,0,0,1,0,0); font=None; size=1.0; fill=None; tc=0.0; tw=0.0; tl=0.0
    ctm=(1,0,0,1,0,0); gstack=[]
    in_text=False
    for m in TOKEN.finditer(content):
        kind=m.lastgroup; val=m.group()
        if kind!='op': stack.append(val); continue
        op=val
        def nums(n): return [float(x) for x in stack[-n:]]
        if op=='q': gstack.append((ctm, fill))
        elif op=='Q':
            if gstack: ctm, fill = gstack.pop()
        elif op=='cm' and len(stack)>=6: ctm=mul(tuple(nums(6)), ctm)
        elif op=='BT': tm=tlm=(1,0,0,1,0,0); in_text=True
        elif op=='ET': in_text=False
        elif op=='Tf' and len(stack)>=2: font=stack[-2]; size=float(stack[-1])
        elif op=='Tm' and len(stack)>=6: tm=tlm=tuple(nums(6))
        elif op in ('Td','TD') and len(stack)>=2:
            tx,ty=nums(2)
            if op=='TD': tl=-ty           # TD also SETS the leading
            tlm=mul((1,0,0,1,tx,ty), tlm); tm=tlm
        elif op=='TL' and stack: tl=float(stack[-1])
        elif op=='T*': tlm=mul((1,0,0,1,0,-tl), tlm); tm=tlm
        elif op=='Tc' and stack: tc=float(stack[-1])
        elif op=='Tw' and stack: tw=float(stack[-1])
        elif op in ('k','K') and len(stack)>=4: fill=('cmyk',)+tuple(nums(4)) if op=='k' else fill
        elif op in ('Tj','TJ',"'",'"'):
            # ' and " carry an IMPLICIT line move (T*) before showing. Ghostscript
            # emits them freely - `(constant)'` - and a parser that only shows the
            # text lays every line of a block on one baseline.
            if op=='"' and len(stack)>=3:
                tw=float(stack[-3]); tc=float(stack[-2])
            if op in ("'",'"'):
                tlm=mul((1,0,0,1,0,-tl), tlm); tm=tlm
            kern=0.0
            if op=='TJ':
                arr=stack[-1]; parts=[]
                for el in re.finditer(r'\((?:[^()\\]|\\.)*\)|-?\d*\.?\d+', arr):
                    v=el.group()
                    if v.startswith('('): parts.append(unescape(v))
                    else: kern += float(v)
                text=''.join(parts)
            else:
                text=unescape(stack[-1]) if stack and stack[-1].startswith('(') else ''
            M = mul(tm, ctm)                 # text space -> user space
            scale = math.hypot(M[0], M[1])
            fs  = size * scale               # visual font size in pt
            rot = math.degrees(math.atan2(M[1], M[0]))
            w = widths.get(font, {})
            # tx is the advance in TEXT space; adv is the same length in user space
            tx  = (sum(w.get(ord(ch),0.5) for ch in text) - kern/1000.0)*size \
                  + tc*len(text) + tw*text.count(' ')
            adv = tx * scale
            runs.append(dict(text=winansi(text), font=font, size=round(fs,4),
                             rot=round(rot,3), x=round(M[4],4), y=round(M[5],4),
                             adv=round(adv,3), fill=fill, tm=[round(v,5) for v in M]))
            tm = mul((1,0,0,1, tx, 0), tm)
        stack=[]
    return runs
