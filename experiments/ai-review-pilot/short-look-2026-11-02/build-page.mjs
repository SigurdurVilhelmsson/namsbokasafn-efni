// Builds the blind review page from items.json (no category, ruling, reason, chapter or module).
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = process.argv[2];
const items = JSON.parse(fs.readFileSync(path.join(DIR, 'items.json'), 'utf8')).map((it) => ({
  id: it.id, type: it.segmentType, en: it.en, mt: it.mt, sg: it.suggestion,
  j: it.judged, ctx: it.context.map((c) => ({ mt: c.mt, sg: c.suggestion })),
}));
// Belt and braces: the page data carries only these fields, so no category, ruling, reason,
// chapter, module or op id can reach the page.
const ALLOWED_KEYS = ["id", "type", "en", "mt", "sg", "j", "ctx"];
for (const it of items) {
  const keys = Object.keys(it);
  if (keys.length !== ALLOWED_KEYS.length || !keys.every((k) => ALLOWED_KEYS.includes(k))) throw new Error(`${it.id}: unexpected fields ${keys}`);
}
const blob = JSON.stringify(items);
const data = blob.replace(/</g, '\\u003c');
const html = String.raw`<title>Term Pass Short Look</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
<style>
/* Layout: one reading column of judgement cards under a sticky progress bar. */
:root {
  --bg: #f4f6f8; --surface: #ffffff; --fg: #1b2530; --muted: #5b6875; --line: #d9dfe5;
  --accent: #2350a0; --accent-fg: #ffffff;
  --old-bg: #fbe1dc; --old-fg: #8c2a1c; --new-bg: #d9efe0; --new-fg: #1c6337;
  --ctx: #b7791f; --mk: #8a96a3; --open: #9a5b00; --open-bg: #fdf0d9; --ok: #1c6337; --ok-bg: #dcefe2;
  --f-ui: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --f-text: "Source Serif 4", Georgia, "Times New Roman", serif;
  --f-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #12171d; --surface: #1a2129; --fg: #e3e8ee; --muted: #9aa6b2; --line: #2c3540;
  --accent: #7ea6f0; --accent-fg: #0e1a2e;
  --old-bg: #4a221c; --old-fg: #ffc2b6; --new-bg: #173a26; --new-fg: #b4ecc6;
  --ctx: #e0a64a; --mk: #6d7a87; --open: #f0b860; --open-bg: #3a2c12; --ok: #9fdfb4; --ok-bg: #173a26; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #12171d; --surface: #1a2129; --fg: #e3e8ee; --muted: #9aa6b2; --line: #2c3540;
  --accent: #7ea6f0; --accent-fg: #0e1a2e;
  --old-bg: #4a221c; --old-fg: #ffc2b6; --new-bg: #173a26; --new-fg: #b4ecc6;
  --ctx: #e0a64a; --mk: #6d7a87; --open: #f0b860; --open-bg: #3a2c12; --ok: #9fdfb4; --ok-bg: #173a26; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font-family: var(--f-ui); font-size: 15px; line-height: 1.5; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--surface); }
.wrap { max-width: 860px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 24px 64px; display: grid; gap: 20px; }
h1 { font-size: 1.6rem; font-weight: 600; margin: 0; text-wrap: balance; letter-spacing: -0.01em; }
.lede { color: var(--muted); margin: 4px 0 0; max-width: 65ch; }
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--surface); border-bottom: 1px solid var(--line); }
.bar .in { max-width: 860px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 10px; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
#count { font-weight: 600; font-variant-numeric: tabular-nums; }
#conn { color: var(--muted); font-size: 0.85rem; }
.bar label { display: inline-flex; gap: 6px; align-items: center; font-size: 0.9rem; }
.spacer { flex: 1 1 auto; }
button { font: inherit; font-size: 0.9rem; border-radius: 6px; padding: 6px 14px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-fg); cursor: pointer; }
button.ghost { background: transparent; color: var(--accent); }
button:disabled { opacity: 0.5; cursor: default; }
button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.guide { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 16px 18px; display: grid; gap: 10px; }
.guide h2 { font-size: 1rem; margin: 0; }
.guide dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 0; }
.guide dt { font-weight: 600; }
.guide dd { margin: 0; color: var(--fg); min-width: 0; }
.guide p { margin: 0; max-width: 70ch; }
@media (max-width: 560px) { .guide dl { grid-template-columns: 1fr; } .guide dd { margin-bottom: 6px; } }
.legend { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 0.9rem; color: var(--muted); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 14px 18px 16px; display: grid; gap: 10px; }
.card[data-state="saved"] { border-color: color-mix(in srgb, var(--ok) 35%, var(--line)); }
.head { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; }
.id { font-family: var(--f-mono); font-weight: 500; }
.type { color: var(--muted); font-size: 0.9rem; }
.pill { margin-left: auto; font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; background: var(--ok-bg); color: var(--ok); }
.pill.open { background: var(--open-bg); color: var(--open); }
.row { display: grid; grid-template-columns: 2.6rem 1fr; gap: 10px; align-items: start; }
.lab { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); padding-top: 4px; }
.txt { font-family: var(--f-text); font-size: 1.02rem; line-height: 1.6; min-width: 0; overflow-wrap: anywhere; }
.txt.en { color: var(--muted); }
.txt.clip { max-height: 9.6em; overflow: hidden; -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent); mask-image: linear-gradient(to bottom, #000 70%, transparent); }
.mk { color: var(--mk); font-family: var(--f-mono); font-size: 0.78em; }
mark { border-radius: 3px; padding: 0 2px; }
mark.old { background: var(--old-bg); color: var(--old-fg); text-decoration: line-through; text-decoration-thickness: 1px; }
mark.new { background: var(--new-bg); color: var(--new-fg); font-weight: 600; }
.cx { text-decoration: underline dotted var(--ctx); text-decoration-thickness: 2px; text-underline-offset: 3px; }
.more { justify-self: start; font-size: 0.82rem; padding: 2px 10px; }
.verdict { display: flex; flex-wrap: wrap; gap: 6px 16px; border-top: 1px solid var(--line); padding-top: 10px; }
.verdict label { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }
.foot { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
textarea { font: inherit; font-size: 0.92rem; width: 100%; min-height: 2.4em; resize: vertical; border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; background: var(--bg); color: var(--fg); box-sizing: border-box; }
.msg { font-size: 0.85rem; color: var(--muted); }
#nostore { background: var(--open-bg); color: var(--open); padding: 10px 14px; border-radius: 8px; }
.end { display: grid; gap: 8px; justify-items: start; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
</style>

<div class="bar"><div class="in">
  <span id="count">0 of 60 saved</span>
  <span id="conn">Connecting to the answer store…</span>
  <span class="spacer"></span>
  <label for="onlyOpen"><input type="checkbox" id="onlyOpen"> Show only items not yet judged</label>
</div></div>

<div class="wrap">
  <header>
    <h1>Term Pass Short Look</h1>
    <p class="lede">60 terminology changes the AI pass made to the chemistry MT, from all 22 chapters of the full run (ch10 left out). Your verdicts decide which kinds of AI suggestion editors will see. The items are shuffled, and what kind of change each one is stays hidden until you are done.</p>
  </header>

  <p id="nostore" hidden>This view can't save answers. Open the page on claude.ai while signed in.</p>

  <section class="guide" aria-labelledby="g-h">
    <h2 id="g-h">How to judge</h2>
    <p>Judge only the <strong>highlighted change</strong>, in this sentence, against the English. Other changes in the same segment are underlined with dots: they are context, not under judgement. If the judged change only follows another change (an ending that agrees with a new word), it is right when it follows that change correctly, even if you would reject the other change.</p>
    <dl>
      <dt>Right</dt><dd>The new word or form is correct here: the right term, inflection and agreement.</dd>
      <dt>Wrong, meaning kept</dt><dd>The change is wrong (form, case, number, gender, compounding, or a ruled term that doesn't fit here), but a reader would still understand the same thing.</dd>
      <dt>Wrong, meaning changed</dt><dd>After the change the sentence says something different or false, for example a term in the wrong sense.</dd>
      <dt>Can't judge</dt><dd>You can't tell from what is shown. Say why in the comment.</dd>
    </dl>
    <div class="legend">
      <span><mark class="old">old</mark> the MT's words, replaced</span>
      <span><mark class="new">new</mark> the AI's words</span>
      <span><span class="cx">other</span> another change (context)</span>
      <span><span class="mk">[[i:</span>…<span class="mk">]]</span> formatting markers, dimmed</span>
    </div>
  </section>

  <main id="list" style="display:grid;gap:16px"></main>

  <section class="end" aria-labelledby="e-h">
    <h2 id="e-h" style="font-size:1rem;margin:0">When you have gone through all 60</h2>
    <p class="lede" style="margin:0">Items you haven't saved stay open; nothing counts as judged unless it is saved.</p>
    <button id="complete" disabled>Mark the look complete</button>
    <span class="msg" id="completeMsg"></span>
  </section>
</div>

<script type="application/json" id="data">${data}</script>
<script>
const ITEMS = JSON.parse(document.getElementById("data").textContent);
const TYPE = { para: "Paragraph", problem: "Exercise", solution: "Solution", alt: "Image alt text", caption: "Figure caption", "glossary-term": "Glossary term", "glossary-def": "Glossary definition", "table-summary": "Table summary", entry: "Table cell", item: "List item", title: "Section title", "example-title": "Example title", "note-title": "Note title", "abstract-item": "Learning objective" };
const CHOICES = [["right", "Right"], ["wrong-kept", "Wrong, meaning kept"], ["wrong-changed", "Wrong, meaning changed"], ["cant-judge", "Can't judge"]];
const LONG = 700, PAD = 300;
let db = null;
const saved = {};
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dim = (s) => esc(s).replace(/\[\[[A-Za-z]+:?|\]\]/g, (m) => '<span class="mk">' + m + "</span>");
// Render text with the judged span and context spans marked, optionally windowed around the judged span.
function marked(text, judged, ctx, cls, whole) {
  let from = 0, to = text.length;
  if (!whole && text.length > LONG && judged) {
    from = Math.max(0, judged[0] - PAD); to = Math.min(text.length, judged[1] + PAD);
    while (from > 0 && !/\s/.test(text[from - 1])) from--;
    while (to < text.length && !/\s/.test(text[to])) to++;
  }
  const marks = [];
  if (judged) marks.push([judged[0], judged[1], '<mark class="' + cls + '">', "</mark>"]);
  for (const c of ctx) if (c && c[0] >= from && c[1] <= to) marks.push([c[0], c[1], '<span class="cx">', "</span>"]);
  marks.sort((a, b) => a[0] - b[0]);
  let out = from > 0 ? "… " : "", pos = from;
  for (const [a, b, open, close] of marks) {
    if (a < pos) continue;
    out += dim(text.slice(pos, a)) + open + dim(text.slice(a, b)) + close; pos = b;
  }
  out += dim(text.slice(pos, to)) + (to < text.length ? " …" : "");
  return out;
}
function render() {
  const list = document.getElementById("list");
  list.innerHTML = ITEMS.map((it) => {
    const long = it.mt.length > LONG || it.sg.length > LONG;
    const enLong = it.en.length > LONG;
    return '<article class="card" id="' + it.id + '" data-state="open">' +
      '<div class="head"><span class="id">' + it.id + '</span><span class="type">' + (TYPE[it.type] || it.type) + '</span><span class="pill open" id="' + it.id + '-pill">Not judged</span></div>' +
      '<div class="row"><span class="lab">EN</span><div class="txt en' + (enLong ? " clip" : "") + '" id="' + it.id + '-en">' + dim(it.en) + "</div></div>" +
      (enLong ? '<button class="ghost more" data-en="' + it.id + '">Show all the English</button>' : "") +
      '<div class="row"><span class="lab">MT</span><div class="txt" id="' + it.id + '-mt">' + marked(it.mt, it.j.mt, it.ctx.map((c) => c.mt), "old", false) + "</div></div>" +
      '<div class="row"><span class="lab">AI</span><div class="txt" id="' + it.id + '-sg">' + marked(it.sg, it.j.suggestion, it.ctx.map((c) => c.sg), "new", false) + "</div></div>" +
      (long ? '<button class="ghost more" data-whole="' + it.id + '">Show the whole segment</button>' : "") +
      '<div class="verdict" role="radiogroup" aria-label="Verdict for ' + it.id + '">' + CHOICES.map(([v, l]) => '<label for="' + it.id + "-" + v + '"><input type="radio" name="' + it.id + '-c" id="' + it.id + "-" + v + '" value="' + v + '"> ' + l + "</label>").join("") + "</div>" +
      '<textarea id="' + it.id + '-note" placeholder="Comment (optional; say why if wrong or can\'t judge)" aria-label="Comment for ' + it.id + '"></textarea>' +
      '<div class="foot"><button id="' + it.id + '-save" data-save="' + it.id + '" disabled>Save</button><span class="msg" id="' + it.id + '-msg"></span></div>' +
      "</article>";
  }).join("");
}
function refresh() {
  let n = 0;
  const onlyOpen = document.getElementById("onlyOpen").checked;
  for (const it of ITEMS) {
    const s = saved[it.id];
    const el = document.getElementById(it.id), pill = document.getElementById(it.id + "-pill");
    const done = Boolean(s && s.choice);
    if (done) { n++; el.dataset.state = "saved"; pill.className = "pill"; pill.textContent = "Saved"; }
    else { el.dataset.state = "open"; pill.className = "pill open"; pill.textContent = "Not judged"; }
    el.hidden = onlyOpen && done;
  }
  document.getElementById("count").textContent = n + " of " + ITEMS.length + " saved";
}
function fill(id, s) {
  const r = document.getElementById(id + "-" + s.choice);
  if (r) r.checked = true;
  const note = document.getElementById(id + "-note");
  if (document.activeElement !== note) note.value = s.note || "";
}
async function save(id) {
  const choice = document.querySelector('input[name="' + id + '-c"]:checked')?.value;
  const msg = document.getElementById(id + "-msg");
  if (!choice) { msg.textContent = "Pick a verdict first."; return; }
  const note = document.getElementById(id + "-note").value.trim();
  const prev = saved[id];
  if (prev && prev.choice === choice && (prev.note || "") === note) { msg.textContent = "Already saved."; return; }
  const btn = document.getElementById(id + "-save");
  btn.disabled = true; msg.textContent = "Saving…";
  try {
    await db.collection("verdicts").doc(id).set({ choice, note, savedAt: new Date().toISOString() });
    msg.textContent = "Saved.";
  } catch (e) {
    msg.textContent = "Not saved: " + (e && e.message ? e.message : "the store refused the write") + ". Try again.";
  } finally { btn.disabled = false; }
}
async function complete() {
  const m = document.getElementById("completeMsg");
  const n = Object.values(saved).filter((s) => s.choice).length;
  try {
    await db.doc("meta/review").set({ complete: true, savedCount: n, total: ITEMS.length, at: new Date().toISOString() });
    m.textContent = "Marked complete with " + n + " of " + ITEMS.length + " saved." + (n < ITEMS.length ? " The rest stay open." : "");
  } catch (e) { m.textContent = "Not saved: " + (e && e.message ? e.message : "the store refused the write"); }
}
document.addEventListener("click", (ev) => {
  const t = ev.target.closest("button"); if (!t) return;
  if (t.dataset.save) save(t.dataset.save);
  else if (t.dataset.en) { document.getElementById(t.dataset.en + "-en").classList.remove("clip"); t.remove(); }
  else if (t.dataset.whole) {
    const it = ITEMS.find((x) => x.id === t.dataset.whole);
    document.getElementById(it.id + "-mt").innerHTML = marked(it.mt, it.j.mt, it.ctx.map((c) => c.mt), "old", true);
    document.getElementById(it.id + "-sg").innerHTML = marked(it.sg, it.j.suggestion, it.ctx.map((c) => c.sg), "new", true);
    t.remove();
  }
});
document.getElementById("onlyOpen").addEventListener("change", refresh);
render(); refresh();
(async () => {
  const conn = document.getElementById("conn");
  const timer = setTimeout(() => { if (!db) conn.textContent = "The answer store hasn't answered; reload to retry."; }, 10000);
  try { db = await window.claude?.use?.("db"); } catch { db = null; }
  if (!db) { clearTimeout(timer); conn.textContent = "Answers can't be saved in this view."; document.getElementById("nostore").hidden = false; return; }
  for (const it of ITEMS) document.getElementById(it.id + "-save").disabled = false;
  const done = document.getElementById("complete"); done.disabled = false; done.addEventListener("click", complete);
  db.collection("verdicts").onSnapshot((snap) => {
    clearTimeout(timer); conn.textContent = "Answers save to this page.";
    for (const d of snap.docs) { const v = d.data(); if (v) { saved[d.id] = v; fill(d.id, v); } }
    refresh();
  }, () => { clearTimeout(timer); conn.textContent = "Lost contact with the answer store; reload to retry."; });
  db.doc("meta/review").onSnapshot((d) => {
    const v = d.exists ? d.data() : null;
    if (v && v.complete) document.getElementById("completeMsg").textContent = "Marked complete (" + v.savedCount + " of " + v.total + " saved at the time).";
  }, () => {});
})();
</script>
`;
fs.writeFileSync(OUT, html);
console.log(`wrote ${OUT} (${html.length} chars, ${items.length} items)`);
