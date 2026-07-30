#!/usr/bin/env node
/**
 * Render a segment-edit snapshot as Markdown, for re-applying edits BY HAND.
 *
 * Written for the C16 clean break at the scale it actually has: ~62 edits over
 * a handful of modules. At that size the automated re-attach
 * (scripts/reattach-segment-edits.js) buys an hour of typing and costs a write
 * path into production's sessions.db — while the expensive part, an editor
 * judging each edit against the NEW machine translation, is required either
 * way. This produces the working document for the hand pass instead.
 *
 * Read-only. Takes the snapshot written by scripts/export-segment-edits.js and
 * writes Markdown; touches no database and no book files.
 *
 *   node scripts/render-segment-edits-md.js --snapshot <path> [--out <path>]
 *
 * With no --out it writes to stdout, so it pipes.
 */
import fs from 'fs';
import path from 'path';
import { classifyByStatus, detectRetiredMarkers } from './lib/segment-edit-reattach-rules.js';

/** Markdown blockquote, blank-line-safe, so a multi-line edit stays inside it. */
const quote = (text) =>
  String(text || '')
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');

/**
 * The editor-facing labels are Icelandic on purpose: this document is read by
 * the person re-applying the edits, and it matches the register/editor voice
 * used elsewhere (cf. composeEditorNote's Icelandic note).
 *
 * @param {object} snapshot as written by export-segment-edits.js
 * @returns {string} Markdown
 */
export function renderSnapshotMarkdown(snapshot) {
  const edits = snapshot.edits || [];
  const reusable = edits.filter((e) => classifyByStatus(e.status) === 'restore');
  const skipped = edits.length - reusable.length;

  const out = [];
  out.push(`# Ritstjórnarbreytingar — ${snapshot.book}`);
  out.push('');
  out.push(
    `**Tekið:** ${snapshot.takenAt || '(óskráð)'} · ` +
      `**main:** \`${snapshot.mainCommit || '(óskráð)'}\` · ` +
      `**Einingar:** ${(snapshot.modules || []).join(', ') || '(engar)'}`
  );
  out.push('');
  out.push(
    `**${edits.length} breytingar alls · ${reusable.length} til endurnýtingar · ` +
      `${skipped} sleppt (rejected/superseded).**`
  );
  out.push('');
  out.push(
    '> **Handvirk endurnýting.** Berðu hverja breytingu saman við **nýju vélþýðinguna** — ekki',
    '> við þá gömlu hér að neðan. Ef nýja vélþýðingin segir þegar það sem ritstjórinn skrifaði',
    '> þarf enga breytingu. Breytingar merktar *EKKI endurnýta* eru hafnaðar eða úreltar og',
    '> eiga ekki að rata inn aftur.'
  );
  out.push('');
  out.push(
    '> ⚠️ Röðin hér er röð skyndimyndarinnar (eining, þá bútauðkenni) — **ekki** endilega',
    '> lesröð kaflans. Finndu hvern bút eftir auðkenni sínu í ritlinum.'
  );

  const byModule = new Map();
  for (const e of edits) {
    if (!byModule.has(e.module_id)) byModule.set(e.module_id, []);
    byModule.get(e.module_id).push(e);
  }

  for (const [moduleId, rows] of byModule) {
    out.push('', '---', '');
    out.push(`## ${moduleId} (kafli ${rows[0].chapter})`);
    out.push('');
    out.push(`${rows.length} breyting(ar).`);

    rows.forEach((e, i) => {
      const reuse = classifyByStatus(e.status) === 'restore';
      const flags = detectRetiredMarkers(e.edited_content);

      out.push('');
      out.push(
        `### ${i + 1}. \`${e.segment_id}\` · ${e.status}` +
          `${e.editor_username ? ` · ${e.editor_username}` : ''}`
      );
      if (!reuse) {
        out.push('', `**⛔ EKKI endurnýta** — staðan er \`${e.status}\`.`);
      }
      if (flags.length) {
        out.push(
          '',
          `**⚠️ Úrelt snið: ${flags.join(', ')}** — lagaðu sniðið um leið og þú færir textann.`
        );
      }

      out.push('', '**Enska**', quote(e.context?.en || '_(ekki skráð)_'));
      out.push(
        '',
        '**Fyrri vélþýðing**',
        quote(e.context?.mtAtSnapshot || e.original_content || '_(ekki skráð)_')
      );
      out.push('', '**Breyting ritstjóra**', quote(e.edited_content));

      if (e.category) out.push('', `**Flokkur:** ${e.category}`);
      if (e.editor_note) out.push('', `**Athugasemd ritstjóra:** ${e.editor_note}`);
      if (e.reviewer_note) out.push('', `**Athugasemd yfirlesara:** ${e.reviewer_note}`);
    });
  }

  out.push('');
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  const snapshotPath = get('--snapshot');
  if (!snapshotPath) {
    console.error(
      'Usage: node scripts/render-segment-edits-md.js --snapshot <path> [--out <path>]'
    );
    process.exit(1);
  }
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const md = renderSnapshotMarkdown(snapshot);
  const out = get('--out');
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, md);
    console.log(`Wrote ${out} (${snapshot.edits?.length ?? 0} breytingar).`);
  } else {
    process.stdout.write(md);
  }
}
