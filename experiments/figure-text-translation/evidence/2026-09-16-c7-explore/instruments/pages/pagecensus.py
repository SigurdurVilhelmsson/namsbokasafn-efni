import json, re, subprocess, sys, os
from pathlib import Path
from multiprocessing import Pool
sys.path.insert(0, '/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/pylibs')
from PIL import Image
MEDIA = Path('/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/01-source/media')
CHROME = re.compile(r'Art Dialogue|Dialogue Sheet|Pick up from|Page \d+ of \d+|Art Pass|Revision \d|Words & Numbers|InDesign|\.indd\b|\b[\w-]+\.(?:jpg|jpeg|eps|ai|pdf|png|tif|tiff|psd)\b|ID\s*#|CNX_Chem_\d', re.I)
BOXRE = re.compile(r'^(MediaBox|CropBox|BleedBox|TrimBox|ArtBox):\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)', re.M)

def eps_header(p):
    b = p.read_bytes()
    if b[:4] == b'\xc5\xd0\xd3\xc6':
        off = int.from_bytes(b[4:8], 'little'); ln = int.from_bytes(b[8:12], 'little')
        b = b[off:off+ln]
    head = b[:200000].decode('latin-1')
    out = {}
    for key in ('BoundingBox', 'HiResBoundingBox', 'Creator', 'CropBox'):
        m = re.search(r'^%%' + key + r':\s*(.+?)\s*$', head, re.M)
        if m: out[key] = m.group(1)
    return out

def one(r):
    art = Path(r['artwork']); rec = {k: r[k] for k in ('chapter', 'basename', 'artwork', 'edition', 'via')}
    ras = MEDIA / Path(r['src']).name
    try:
        im = Image.open(ras); rec['raster'] = list(im.size); d = im.info.get('dpi'); rec['rasterDpi'] = [float(x) for x in d] if d else None
    except Exception as e:
        rec['raster'] = None; rec['rasterErr'] = str(e)
    if art.suffix.lower() == '.pdf':
        rec['kind'] = 'pdf'
        o = subprocess.run(['pdfinfo', '-box', str(art)], capture_output=True, text=True, errors='replace').stdout
        m = re.search(r'^Creator:\s*(.*)$', o, re.M); rec['creator'] = m.group(1) if m else None
        m = re.search(r'^Pages:\s*(\d+)', o, re.M); rec['pages'] = int(m.group(1)) if m else None
        boxes = {k: [float(a), float(b), float(c), float(d)] for k, a, b, c, d in BOXRE.findall(o)}
        rec['boxes'] = boxes
        cb = boxes.get('CropBox') or boxes.get('MediaBox')
        rec['page'] = [cb[2]-cb[0], cb[3]-cb[1]] if cb else None
        txt = subprocess.run(['pdftotext', '-layout', str(art), '-'], capture_output=True, text=True, errors='replace', timeout=120).stdout
    else:
        rec['kind'] = 'eps'
        h = eps_header(art); rec['eps'] = h; rec['creator'] = h.get('Creator')
        bb = h.get('HiResBoundingBox') or h.get('BoundingBox')
        if bb:
            x0, y0, x1, y1 = map(float, bb.split()[:4]); rec['page'] = [x1-x0, y1-y0]
        else:
            rec['page'] = None
        try:
            txt = subprocess.run(['gs', '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-dEPSCrop', '-sDEVICE=txtwrite', '-o', '-', str(art)],
                                 capture_output=True, text=True, errors='replace', timeout=180).stdout
        except subprocess.TimeoutExpired:
            txt = None; rec['txtErr'] = 'timeout'
    if txt is not None:
        rec['nchars'] = len(''.join(txt.split()))
        rec['chrome'] = sorted({m.group(0) for m in CHROME.finditer(txt)})
    return rec

if __name__ == '__main__':
    rows = [r for r in json.load(open('resolved.json')) if r['artwork']]
    with Pool(4) as pool, open('pagecensus.jsonl', 'w') as f:
        for i, rec in enumerate(pool.imap_unordered(one, rows, chunksize=4)):
            f.write(json.dumps(rec) + '\n')
            if i % 100 == 0: print(i, flush=True)
    print('DONE', len(rows), flush=True)
