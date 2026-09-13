"""Does a stray '0.' fragment drawn on top of a converted '0,500 M' show? cairo toy API, 200 dpi, as compose.py draws."""
import cairo, sys
S=200/72.0
def render(items, face):
    surf=cairo.ImageSurface(cairo.FORMAT_RGB24, 300, 80); ctx=cairo.Context(surf)
    ctx.set_source_rgb(1,1,1); ctx.paint(); ctx.set_source_rgb(0,0,0)
    ctx.select_font_face('Liberation Sans', cairo.FONT_SLANT_ITALIC if 'Italic' in face else cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if 'Bold' in face else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(9*S)
    for t in items:
        ctx.move_to(10, 50); ctx.show_text(t)
    surf.flush(); return bytes(surf.get_data())
def diff(a,b): return sum(1 for x,y in zip(a[::4],b[::4]) if x!=y)
for face in ('Regular','Bold','Italic','BoldItalic'):
    conv=render(['0,500 '], face)
    over=render(['0,500 ','0.'], face)
    ctl=render(['0.500 '], face)                   # positive control: '.' vs ',' must differ
    ctl2=render(['0,500 ','0:'], face)             # positive control: a different overprint must show
    print(face, 'pixels differing: comma-label vs comma-label+stray "0." =', diff(conv,over),
          '| control "0.500" vs "0,500" =', diff(conv,ctl), '| control stray "0:" =', diff(conv,ctl2))
print('--- isolated: both variants double-draw the "0"')
for face in ('Regular','Bold','Italic','BoldItalic'):
    good=render(['0,500 ','0,'], face)     # fragment converted too
    bad=render(['0,500 ','0.'], face)      # fragment left as a point
    today=render(['0.500 ','0.'], face)    # no conversion at all
    print(face, 'fragment-converted vs fragment-left =', diff(good,bad), 'px | control today(all points) vs fragment-converted =', diff(today,good), 'px')
print('--- magnitude (blue channel byte deltas): count>64, max')
def mag(a,b):
    d=[abs(x-y) for x,y in zip(a[::4],b[::4])]
    return sum(1 for v in d if v>64), max(d)
for face in ('Regular','Bold','Italic','BoldItalic'):
    good=render(['0,500 ','0,'], face); bad=render(['0,500 ','0.'], face); today=render(['0.500 ','0.'], face)
    single_c=render(['0,500 '], face); single_p=render(['0.500 '], face)
    print(face, 'converted-vs-left', mag(good,bad), '| today-vs-converted', mag(today,good), '| single label point-vs-comma', mag(single_p,single_c))
