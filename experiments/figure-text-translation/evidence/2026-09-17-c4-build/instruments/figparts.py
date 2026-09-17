#!/usr/bin/env python3
"""Split a composed figure SVG into ARTWORK PART, STYLE and TEXT GROUP, and hash the parts that are stable.

    python3 figparts.py <svg> [<svg> ...]                    one JSON object per file, keyed by path
    python3 figparts.py --prove <artwork.svg> <composed.svg>  check the artwork relation for one pair

Input: a translated.svg from compose.py --svg, or a committed books/<slug>/media/<b>_IS.svg — both are
written by svgout.write_svg, which does exactly

    art = artwork_svg_text.rstrip()
    out = art[:art.rfind('</svg>')] + '<style>…</style>' + '\\n' + '<g …>' + '\\n' + '<text …>…</text>' …
          + '\\n' + '</g>' + '\\n</svg>\\n'

so the file is: artwork body, then svgout's "<style>", then the text group, then "</svg>". The split
locates the LAST b"<style>" (svgout's — the base64 woff2 and every <text> body are escaped, so neither can
contain "<"), the first b"</style>" after it, and requires the remainder to be exactly
b"\\n" + <g …> … b"</g>" + b"\\n</svg>\\n". Anything else raises.

Output per file:
  artwork_sha256     sha256 of bytes[:last <style>]   (the artwork part)
  textgroup_sha256   sha256 of bytes from "<g" through the closing "</g>" inclusive
  style_font_faces   ["FigIS/400/normal", …] in @font-face order
  text_count         number of "<text " elements in the text group
  g_opener           the group's opening tag, e.g. <g text-rendering="geometricPrecision">

The STYLE is deliberately NOT hashed: fontTools stamps head.modified (and so the checksum) into every
subset woff2, and a figure-run.js compose does not pin SOURCE_DATE_EPOCH, so the committed media's style
bytes differ from any epoch-pinned compose even when the glyph set is identical.

--prove checks the exact relation, byte for byte (no newline normalisation):
  composed[:composed.rfind(b'<style>')] == A[:A.rfind(b'</svg>')]   where A = artwork.svg bytes .rstrip()
(svgout reads the artwork as UTF-8 text and writes UTF-8; for this ASCII-only cairo output the byte and text
forms of the relation coincide).
"""
import hashlib, json, re, sys
from pathlib import Path


def split(data: bytes):
    i = data.rfind(b'<style>')
    if i < 0:
        raise ValueError('no <style>')
    j = data.find(b'</style>', i)
    if j < 0:
        raise ValueError('unterminated <style>')
    j += len(b'</style>')
    style = data[i:j]
    rest = data[j:]
    tail = b'\n</svg>\n'
    if not rest.startswith(b'\n<g') or not rest.endswith(b'</g>' + tail):
        raise ValueError(f'unexpected text-group framing: head={rest[:20]!r} tail={rest[-20:]!r}')
    group = rest[1:len(rest) - len(tail)]
    return data[:i], style, group


def parts(path):
    data = Path(path).read_bytes()
    art, style, group = split(data)
    opener = group[:group.find(b'>') + 1].decode('utf-8')
    faces = [f"{a.decode()}/{b.decode()}/{c.decode()}" for a, b, c in
             re.findall(rb"@font-face\{font-family:'([^']*)';font-weight:(\d+);font-style:(\w+);", style)]
    return dict(artwork_sha256=hashlib.sha256(art).hexdigest(),
                textgroup_sha256=hashlib.sha256(group).hexdigest(),
                style_font_faces=faces,
                text_count=group.count(b'<text '),
                g_opener=opener)


def prove(artwork_svg, composed_svg):
    A = Path(artwork_svg).read_bytes().rstrip()
    C = Path(composed_svg).read_bytes()
    art, _, _ = split(C)
    expect = A[:A.rfind(b'</svg>')]
    return art == expect, len(art), len(expect)


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    if args[0] == '--prove':
        ok, la, le = prove(args[1], args[2])
        print(json.dumps(dict(artwork=args[1], composed=args[2], equal=ok, artwork_part_bytes=la,
                              expected_bytes=le)))
        sys.exit(0 if ok else 1)
    print(json.dumps({p: parts(p) for p in args}, indent=1, ensure_ascii=False))
