#!/usr/bin/env python3
"""Build site/index.html for the 34 before/after stacks, from t3.jsonl (measured per figure)."""
import html, json
from pathlib import Path

S = Path('/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/6e86c963-0346-4f9d-9a80-00bb96f92a1f/scratchpad')
rows = {json.loads(l)['basename']: json.loads(l) for l in (S / 't3/t3.jsonl').read_text().splitlines() if l.strip()}
IMG = S / 't9/site/img'

NOTES = {
    'CNX_Chem_04_02_HClsoln': 'Look for: italic <i>g</i>, <i>l</i>, <i>aq</i>; H₂O, H₃O⁺ and Cl⁻ on their own baselines; both arrow gaps open again (the old equation text ran through the arrows); the left H₂O(<i>l</i>) no longer clipped at the page edge.',
    'CNX_Chem_14_03_FishLemon': 'Look for: the formula row — CH₃COOH, CH₃COO⁻, and NH₃⁺ with the ⁺ kerned over the ₃ on one line. The Icelandic name row underneath is translated text and should not change.',
    'CNX_Chem_04_04_GreenChem': 'Look for: (CH₃CO)₂O and H₂, Raney Ni regaining their subscripts and their original left alignment.',
    'CNX_Chem_04_01_basehyd_img': 'Look for: the O⁻ and Na⁺ superscripts.',
    'CNX_Chem_04_01_rxn2': 'Look for: the CH₄, 2O₂, CO₂ and 2H₂O subscripts. The translated labels should not change.',
    'CNX_Chem_04_05_combustion': 'Look for: the O₂ label. Not fixed by this change, so expect it unchanged: the blue-grey arrowheads (a separate artwork defect, §C140 ④).',
    'CNX_Chem_04_03_ethene_img': 'Expect no change. The two H labels overprinted by a translated line are a layout problem in translated text (§C140 ③).',
    'CNX_Chem_03_02_sacch_img-3278': 'Expect no change: every label here is translated, so the flattened C₇H₅NO₃S belongs to §C140 ② / ③.',
    'CNX_Chem_04_03_etheneBr_img': 'Expect no change: the damage is in translated text, and the slight C═C offset is the artwork itself (§C140 ⑤).',
    'CNX_Chem_03_01_exocytosis-88f6': 'Its 24 MB artwork times out headless Chromium, as it did in the evidence run, so only the source is shown. Measured: no drawn text item differs from before.',
}


def chapter(b):
    return 'ch04' if b == 'CNX_Chem_14_03_FishLemon' else 'ch' + b.split('_')[2]


cards = []
for b in sorted(rows, key=lambda n: (chapter(n), n)):
    r = rows[b]
    changed = r['kept_changed'] > 0
    group = 'changed' if changed else 'same'
    chip = ('<span class="chip chip-change">Drawn differently</span>' if changed
            else '<span class="chip chip-same">Should look the same</span>')
    stats = (f'<span><b>{r["kept_changed"]}</b> kept block{"s" if r["kept_changed"] != 1 else ""} redrawn</span>'
             f'<span><b>{r["runExact"]}</b> kept in English</span>'
             f'<span><b>{r["population_blocks"]}</b> translated</span>'
             f'<span><b>{r["identity"]}</b> came back identical</span>')
    note = NOTES.get(b)
    note_html = f'<p class="note">{note}</p>' if note else ''
    img = IMG / f'{b}.jpg'
    img_html = (f'<img src="img/{html.escape(b)}.jpg" alt="{html.escape(b)}: source, before and after, stacked" loading="lazy">'
                if img.exists() else '<p class="missing">No render.</p>')
    cid = 'seen-' + b
    cards.append(f'''
<article class="card" data-group="{group}" id="{html.escape(b)}">
  <header class="card-head">
    <div class="card-title">
      <span class="ch">{chapter(b)}</span>
      <h3>{html.escape(b)}</h3>
    </div>
    {chip}
  </header>
  <p class="stats">{stats}</p>
  {note_html}
  <figure>{img_html}</figure>
  <label class="seen"><input type="checkbox" id="{html.escape(cid)}" data-seen="{html.escape(b)}"> Looked at</label>
</article>''')

n_changed = sum(1 for r in rows.values() if r['kept_changed'] > 0)
n_same = len(rows) - n_changed

page = f'''<title>Run-Exact Figure Proofs</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<style>
:root {{
  --ground: #f1f4f7; --surface: #ffffff; --ink: #16202b; --muted: #566472; --rule: #d5dde4;
  --accent: #2a67a8; --change: #1c7650; --change-bg: #e3f2ea; --same: #5d6977; --same-bg: #e8ecf0;
  --shadow: 0 1px 2px rgba(22, 32, 43, .06);
  --sans: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --cond: "IBM Plex Sans Condensed", "Arial Narrow", system-ui, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
    --ground: #0e1318; --surface: #161d25; --ink: #e3e8ed; --muted: #97a4b0; --rule: #2a343e;
    --accent: #7fb2e3; --change: #6cc9a0; --change-bg: #15302a; --same: #a3adb8; --same-bg: #222b34;
    --shadow: none;
  }}
}}
:root[data-theme="dark"] {{
  --ground: #0e1318; --surface: #161d25; --ink: #e3e8ed; --muted: #97a4b0; --rule: #2a343e;
  --accent: #7fb2e3; --change: #6cc9a0; --change-bg: #15302a; --same: #a3adb8; --same-bg: #222b34;
  --shadow: none;
}}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: var(--ground); color: var(--ink); font: 16px/1.55 var(--sans);
  padding: 32px 20px 64px; }}
.wrap {{ max-width: 980px; margin: 0 auto; display: grid; gap: 28px; }}
h1, h2, h3 {{ text-wrap: balance; margin: 0; }}
h1 {{ font: 600 2.1rem/1.15 var(--cond); letter-spacing: -.01em; }}
.lede {{ max-width: 66ch; color: var(--ink); margin: 10px 0 0; }}
.facts {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1px;
  background: var(--rule); border: 1px solid var(--rule); border-radius: 6px; overflow: hidden; margin: 0; }}
.facts div {{ background: var(--surface); padding: 12px 14px; }}
.facts dt {{ font: 500 .72rem/1.2 var(--sans); text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }}
.facts dd {{ margin: 4px 0 0; font: 500 1.35rem/1.2 var(--mono); font-variant-numeric: tabular-nums; }}
.howto {{ display: grid; gap: 8px; max-width: 70ch; }}
.howto h2 {{ font: 600 1.15rem/1.3 var(--cond); }}
.howto p {{ margin: 0; }}
.panels {{ display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 4px 0 0; }}
.panels dt {{ font: 500 .8rem/1.5 var(--mono); color: var(--accent); }}
.panels dd {{ margin: 0; }}
.bar {{ position: sticky; top: 0; z-index: 2; background: var(--ground); padding: 10px 0;
  display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; border-bottom: 1px solid var(--rule); }}
.filters {{ display: flex; flex-wrap: wrap; gap: 8px; }}
.filters button {{ font: 500 .9rem var(--sans); color: var(--ink); background: var(--surface);
  border: 1px solid var(--rule); border-radius: 999px; padding: 6px 14px; cursor: pointer; }}
.filters button[aria-pressed="true"] {{ background: var(--ink); color: var(--surface); border-color: var(--ink); }}
.filters button:focus-visible, .seen input:focus-visible {{ outline: 2px solid var(--accent); outline-offset: 2px; }}
.progress {{ font: .9rem var(--mono); color: var(--muted); font-variant-numeric: tabular-nums; }}
.cards {{ display: grid; gap: 22px; }}
.card {{ background: var(--surface); border: 1px solid var(--rule); border-radius: 8px; box-shadow: var(--shadow);
  padding: 16px 18px 14px; display: grid; gap: 10px; }}
.card-head {{ display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 12px; }}
.card-title {{ display: flex; align-items: baseline; gap: 10px; min-width: 0; }}
.ch {{ font: 500 .75rem/1 var(--mono); color: var(--muted); letter-spacing: .04em; }}
.card h3 {{ font: 500 1rem/1.3 var(--mono); overflow-wrap: anywhere; }}
.chip {{ font: 500 .78rem/1 var(--sans); padding: 5px 10px; border-radius: 999px; white-space: nowrap; }}
.chip-change {{ color: var(--change); background: var(--change-bg); }}
.chip-same {{ color: var(--same); background: var(--same-bg); }}
.stats {{ margin: 0; display: flex; flex-wrap: wrap; gap: 4px 18px; font: .85rem var(--sans); color: var(--muted); }}
.stats b {{ font: 500 .9rem var(--mono); color: var(--ink); font-variant-numeric: tabular-nums; }}
.note {{ margin: 0; max-width: 72ch; }}
figure {{ margin: 0; border: 1px solid var(--rule); border-radius: 4px; overflow: hidden; background: #fff; }}
figure img {{ display: block; width: 100%; max-width: 100%; height: auto; }}
.missing {{ margin: 0; padding: 16px; color: var(--muted); }}
.seen {{ justify-self: start; display: inline-flex; gap: 8px; align-items: center; font-size: .9rem; color: var(--muted); cursor: pointer; }}
.ask {{ background: var(--surface); border: 1px solid var(--rule); border-radius: 8px; padding: 18px; max-width: 70ch; }}
.ask h2 {{ font: 600 1.15rem/1.3 var(--cond); }}
.ask p {{ margin: 8px 0 0; }}
@media (max-width: 480px) {{ h1 {{ font-size: 1.7rem; }} .card {{ padding: 14px 12px 12px; }} }}
</style>

<main class="wrap">
  <header>
    <h1>Run-Exact Figure Proofs</h1>
    <p class="lede">The 34 chapter 3 and 4 figures, recomposed after the composer stopped re-laying English text it could draw exactly. This page is the merge gate: no automated check saw the original damage, so none can clear it.</p>
  </header>

  <dl class="facts">
    <div><dt>Figures recomposed</dt><dd>{len(rows)}</dd></div>
    <div><dt>Drawn differently</dt><dd>{n_changed}</dd></div>
    <div><dt>Should look the same</dt><dd>{n_same}</dd></div>
    <div><dt>Cost</dt><dd>0 ISK</dd></div>
  </dl>

  <section class="howto">
    <h2>How to read each card</h2>
    <p>Each image stacks three renders of the same figure, top to bottom:</p>
    <dl class="panels">
      <dt>SOURCE</dt><dd>the OpenStax artwork, with its original English</dd>
      <dt>BEFORE</dt><dd>what the composer produced on 12 September, rendered as a reader’s browser loads it</dd>
      <dt>AFTER</dt><dd>the same figure recomposed now</dd>
    </dl>
    <p>Kept English, such as formulas and never-translated labels, should now match SOURCE. Translated Icelandic text is untouched by this change, so AFTER should match BEFORE there. The six “drawn differently” figures are listed first.</p>
  </section>

  <div class="bar">
    <div class="filters" role="group" aria-label="Filter figures">
      <button type="button" id="f-all" data-filter="all" aria-pressed="true">All {len(rows)}</button>
      <button type="button" id="f-changed" data-filter="changed" aria-pressed="false">Drawn differently {n_changed}</button>
      <button type="button" id="f-same" data-filter="same" aria-pressed="false">Should look the same {n_same}</button>
    </div>
    <span class="progress" id="progress"></span>
  </div>

  <section class="cards" id="cards">
    {"".join(c for c in cards if 'data-group="changed"' in c)}
    {"".join(c for c in cards if 'data-group="same"' in c)}
  </section>

  <section class="ask">
    <h2>Do these pass?</h2>
    <p>If the six changed figures look right and the other 28 look the same as before, reply <b>yes</b> in the session and the PR opens for merge. If anything looks wrong, name the figure and what you see; it goes back through debugging on the branch.</p>
  </section>
</main>

<script>
(() => {{
  const cards = [...document.querySelectorAll('.card')];
  const boxes = [...document.querySelectorAll('input[data-seen]')];
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const progress = document.getElementById('progress');
  const KEY = 'runexact-proofs-seen';
  let seen = {{}};
  try {{ seen = JSON.parse(localStorage.getItem(KEY) || '{{}}') || {{}}; }} catch (e) {{ seen = {{}}; }}
  const save = () => {{ try {{ localStorage.setItem(KEY, JSON.stringify(seen)); }} catch (e) {{}} }};
  const count = () => {{
    const n = boxes.filter(b => b.checked).length;
    progress.textContent = n + ' of ' + boxes.length + ' looked at';
  }};
  boxes.forEach(b => {{
    b.checked = !!seen[b.dataset.seen];
    b.addEventListener('change', () => {{ seen[b.dataset.seen] = b.checked; save(); count(); }});
  }});
  buttons.forEach(btn => btn.addEventListener('click', () => {{
    const f = btn.dataset.filter;
    buttons.forEach(o => o.setAttribute('aria-pressed', String(o === btn)));
    cards.forEach(c => {{ c.hidden = f !== 'all' && c.dataset.group !== f; }});
  }}));
  count();
}})();
</script>
'''
(S / 't9/site/index.html').write_text(page, encoding='utf-8')
print('wrote index.html', len(page), 'chars;', len(cards), 'cards;', n_changed, 'changed,', n_same, 'same')
