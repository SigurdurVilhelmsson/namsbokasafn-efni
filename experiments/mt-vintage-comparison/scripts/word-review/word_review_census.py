#!/usr/bin/env python3
"""What the ch01-ch02 professional review in Word actually changed (plan 0.2, D10; 2026-10-11).

Question: the plan assumed the reviewers worked in tracked changes. Which text did they start
from, what did they change, and where do the comments sit? (Record:
docs/decisions/2026-10-11-chemistry-finish-preparation-answers.md, D10.)

Inputs:
  * the 25 reviewed Word files, OFF-REPO (one level up from the repository; they carry the
    reviewer's name, so they are never committed);
  * their starting text, in git history only: the 25 MT .docx files uploaded on 2026-01-12
    (b37ab8cc8 ch1, 9ca3fb2ef ch2) and deleted in 265a2496e. Read here at 265a2496e^.

Instruments, per reviewed file and its base (PAIRS below; the pairing was measured as the
best paragraph overlap, 25 of 25, and this script re-checks it through equal paragraph counts):
  * revision marks: w:ins, w:del, w:moveFrom, w:moveTo, w:rPrChange, w:pPrChange, w:delText,
    counted as parsed elements in every XML part (a substring grep for "<w:ins" would also hit
    the table-border tag <w:insideH>);
  * Track Changes: settings.xml <w:trackRevisions w:val>;
  * comments: count, distinct author count (names are never printed), PARSED dates (two stamps
    are US-format, so a string minimum is wrong), and the paragraphs a comment spans;
  * byte identity with the base, and whether the reviewed file's git object exists in the repo;
  * paragraph text compared POSITIONALLY with the base after folding (NFC; NBSP and other spaces
    to a space; soft hyphen and zero-width characters dropped; whitespace collapsed). Math
    (m:oMath) is excluded from the text. A differing paragraph is then one of:
      - insertion: the base paragraph was empty (url = a bare URL Word filled into an empty
        hyperlink on conversion; other = anything else);
      - minor: equal once case, punctuation and all whitespace are ignored;
      - wording: everything else.
Prints JSON with no names and no text. Exit code 1 unless the run completes.

Usage:
  python3 -I experiments/mt-vintage-comparison/scripts/word-review/word_review_census.py \\
      --repo . --ch01 '../1._kafli_OpenStax til yfirlestrar' --ch02 '../2. kafli OpenStax'
"""
import argparse, collections, datetime, hashlib, io, json, os, re, subprocess, sys, unicodedata, zipfile
from defusedxml.ElementTree import fromstring

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
M = '{http://schemas.openxmlformats.org/officeDocument/2006/math}'
BASE_DIR = 'books/efnafraedi/02-mt-output/docx'
REVISION_TAGS = ('ins', 'del', 'moveFrom', 'moveTo', 'rPrChange', 'pPrChange', 'delText')
PAIRS = [  # (chapter, reviewed file, base file)
    ('ch01', '1-Inngangur V1.docx', '1-introduction.docx'),
    ('ch01', '1-1-Efnafræði í samhengi V1.docx', '1-1-chemistry-in-context.docx'),
    ('ch01', '1-2-Fasar og flokkun efna V1.docx', '1-2-phases-and-classification-of-matter.docx'),
    ('ch01', '1-3-Eðlis- og efnaeiginleikar V1.docx', '1-3-physical-and-chemical-properties.docx'),
    ('ch01', '1-4-Mælingar V1.docx', '1-4-measurements.docx'),
    ('ch01', '1-5-Óvissa í mælingum, hittni og nákvæmni V1.docx',
     '1-5-measurement-uncertainty-accuracy-and-precision.docx'),
    ('ch01', '1-6-Stærðfræðileg meðferð á niðurstöðum mælinga V1.docx',
     '1-6-mathematical-treatment-of-measurement-results.docx'),
    ('ch01', '1-Dæmi.docx', '1-exercises.docx'),
    ('ch01', '1-Lykilhugtök V1.docx', '1-key-terms.docx'),
    ('ch01', '1-Lykiljöfnur V1.docx', '1-key-equations.docx'),
    ('ch01', '1-Samantekt V1summary.docx', '1-summary.docx'),
    ('ch01', '1-Svör við dæmum V1.docx', 'chapter-1.docx'),
    ('ch02', '2-introduction.docx', '2-introduction.docx'),
    ('ch02', '2-1-early-ideas-in-atomic-theory.docx', '2-1-early-ideas-in-atomic-theory.docx'),
    ('ch02', '2-2-evolution-of-atomic-theory.docx', '2-2-evolution-of-atomic-theory.docx'),
    ('ch02', '2-3-atomic-structure-and-symbolism.docx', '2-3-atomic-structure-and-symbolism.docx'),
    ('ch02', '2-4-chemical-formulas.docx', '2-4-chemical-formulas.docx'),
    ('ch02', '2-5-the-periodic-table.docx', '2-5-the-periodic-table.docx'),
    ('ch02', '2-6-ionic-and-molecular-compounds.docx', '2-6-ionic-and-molecular-compounds.docx'),
    ('ch02', '2-7-chemical-nomenclature.docx', '2-7-chemical-nomenclature.docx'),
    ('ch02', '2-exercises.docx', '2-exercises.docx'),
    ('ch02', '2-key-equations.docx', '2-key-equations.docx'),
    ('ch02', '2-key-terms.docx', '2-key-terms.docx'),
    ('ch02', '2-summary.docx', '2-summary.docx'),
    ('ch02', 'chapter-2.docx', 'chapter-2.docx'),
]
ZERO_WIDTH = dict.fromkeys(map(ord, '­​‌‍⁠﻿'))


def fold(text):
    text = unicodedata.normalize('NFC', text).translate(ZERO_WIDTH)
    text = ''.join(' ' if unicodedata.category(c) == 'Zs' else c for c in text)
    return re.sub(r'\s+', ' ', text).strip()


def minor_key(text):
    """Equal under this key = the change touched only case, punctuation or spacing."""
    return ''.join(c for c in fold(text).casefold()
                   if not unicodedata.category(c).startswith('P') and not c.isspace())


def paragraphs(document_root):
    """Paragraph texts in document order (tables included), math excluded."""
    out = []
    body = document_root.find(f'{W}body')
    for p in body.iter(f'{W}p'):
        parts = []
        def walk(node):
            if node.tag in (f'{M}oMath', f'{M}oMathPara'):
                return
            if node.tag == f'{W}t' and node.text:
                parts.append(node.text)
            elif node.tag == f'{W}tab':
                parts.append('\t')
            for child in node:
                if child.tag != f'{W}p':  # a nested paragraph is visited on its own
                    walk(child)
        walk(p)
        out.append(''.join(parts))
    return out


def anchored_paragraphs(document_root):
    """Indices of paragraphs a comment spans, or that hold a comment reference."""
    body = document_root.find(f'{W}body')
    anchored, open_ids = set(), set()
    for i, p in enumerate(body.iter(f'{W}p')):
        starts = {e.get(f'{W}id') for e in p.iter(f'{W}commentRangeStart')}
        ends = {e.get(f'{W}id') for e in p.iter(f'{W}commentRangeEnd')}
        refs = [e for e in p.iter(f'{W}commentReference')]
        if open_ids or starts or ends or refs:
            anchored.add(i)
        open_ids |= starts
        open_ids -= ends
    return anchored


def parse_date(value):
    for fmt in ('%Y-%m-%dT%H:%M:%SZ', '%Y-%m-%dT%H:%M:%S', '%m/%d/%Y %H:%M:%S'):
        try:
            return datetime.datetime.strptime(value.strip(), fmt)
        except ValueError:
            pass
    raise ValueError('unparsed comment date')


def git(repo, *args, data=None):
    return subprocess.run(['git', '-C', repo, *args], input=data, capture_output=True)


def describe(zf):
    names = set(zf.namelist())
    marks = collections.Counter()
    for name in names:
        if name.endswith('.xml'):
            root = fromstring(zf.read(name))
            for tag in REVISION_TAGS:
                marks[tag] += sum(1 for _ in root.iter(f'{W}{tag}'))
    doc = fromstring(zf.read('word/document.xml'))
    track = 'absent'
    if 'word/settings.xml' in names:
        tr = fromstring(zf.read('word/settings.xml')).find(f'{W}trackRevisions')
        if tr is not None:
            track = tr.get(f'{W}val', 'true')
    dates, authors = [], set()
    if 'word/comments.xml' in names:
        for c in fromstring(zf.read('word/comments.xml')).iter(f'{W}comment'):
            authors.add(c.get(f'{W}author'))
            dates.append(parse_date(c.get(f'{W}date')))
    core = zf.read('docProps/core.xml').decode('utf-8') if 'docProps/core.xml' in names else ''
    created = re.search(r'<dcterms:created[^>]*>([^<]+)<', core)
    return {
        'doc': doc, 'marks': sum(marks.values()), 'track': track, 'dates': dates,
        'authorCount': len(authors), 'created': created.group(1) if created else None,
    }


def main():
    # Any exception, or a SystemExit with a message, exits non-zero; only a finished run exits 0.
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ap.add_argument('--ch01', required=True)
    ap.add_argument('--ch02', required=True)
    ap.add_argument('--base-ref', default='265a2496e^')
    args = ap.parse_args()
    dirs = {'ch01': args.ch01, 'ch02': args.ch02}
    rows, all_dates = [], []
    for ch, reviewed_name, base_name in PAIRS:
        path = os.path.join(dirs[ch], reviewed_name)
        raw = open(path, 'rb').read()
        base_raw = git(args.repo, 'show', f'{args.base_ref}:{BASE_DIR}/{ch}/{base_name}').stdout
        if not base_raw:
            raise SystemExit(f'base not found at {args.base_ref}: {ch}/{base_name}')
        oid = git(args.repo, 'hash-object', '--no-filters', '--stdin', data=raw).stdout.decode().strip()
        in_repo = git(args.repo, 'cat-file', '-e', oid).returncode == 0
        rv, bs = describe(zipfile.ZipFile(io.BytesIO(raw))), describe(zipfile.ZipFile(io.BytesIO(base_raw)))
        rp, bp = paragraphs(rv['doc']), paragraphs(bs['doc'])
        if len(rp) != len(bp):
            raise SystemExit(f'paragraph counts differ, pairing is wrong: {ch}/{base_name}')
        classes = collections.Counter()
        for r, b in zip(rp, bp):
            fr, fb = fold(r), fold(b)
            if fr == fb:
                continue
            if not fb:
                classes['insertion-url' if re.fullmatch(r'https?://\S+', fr) else 'insertion-other'] += 1
            elif minor_key(r) == minor_key(b):
                classes['minor'] += 1
            else:
                classes['wording'] += 1
        all_dates += rv['dates']
        rows.append({
            'chapter': ch, 'reviewed': reviewed_name, 'base': base_name,
            'byteIdenticalToBase': hashlib.sha256(raw).digest() == hashlib.sha256(base_raw).digest(),
            'reviewedObjectInRepo': in_repo,
            'createdMatchesBase': ('second' if (rv['created'] or '')[:19] == (bs['created'] or '-')[:19]
                                   else 'minute' if (rv['created'] or '')[:16] == (bs['created'] or '-')[:16]
                                   else 'no'),
            'paragraphs': len(rp), 'nonEmptyParagraphs': sum(1 for t in rp if fold(t)),
            'differingParagraphs': sum(classes.values()), 'differingByClass': dict(sorted(classes.items())),
            'revisionMarks': rv['marks'], 'trackRevisions': rv['track'],
            'comments': len(rv['dates']), 'commentAuthors': rv['authorCount'],
            'commentAnchoredParagraphs': len(anchored_paragraphs(rv['doc'])),
            'commentDates': [min(rv['dates']).isoformat(), max(rv['dates']).isoformat()] if rv['dates'] else None,
        })
    totals = collections.Counter()
    for r in rows:
        for k in ('paragraphs', 'nonEmptyParagraphs', 'differingParagraphs', 'revisionMarks', 'comments',
                  'commentAnchoredParagraphs'):
            totals[f'{r["chapter"]}.{k}'] += r[k]
            totals[k] += r[k]
        for k, v in r['differingByClass'].items():
            totals[f'differing.{k}'] += v
    report = {
        'baseRef': args.base_ref,
        'files': rows,
        'totals': dict(sorted(totals.items())),
        'filesWithComments': sum(1 for r in rows if r['comments']),
        'byteIdenticalToBase': sum(1 for r in rows if r['byteIdenticalToBase']),
        'reviewedObjectsInRepo': sum(1 for r in rows if r['reviewedObjectInRepo']),
        'trackRevisions': dict(collections.Counter(r['trackRevisions'] for r in rows)),
        'createdMatchesBase': dict(collections.Counter(r['createdMatchesBase'] for r in rows)),
        'commentDateRange': [min(all_dates).isoformat(), max(all_dates).isoformat()],
        'complete': True,
    }
    json.dump(report, sys.stdout, ensure_ascii=False, indent=1)
    print()
    sys.exit(0)


if __name__ == '__main__':
    main()
