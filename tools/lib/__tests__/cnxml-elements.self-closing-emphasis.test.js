/**
 * cnxml-elements.self-closing-emphasis.test.js — §C61.
 *
 * processInlineContent's EMPHASIS_RE was `<emphasis\b([^>]*)>…</emphasis>`, and
 * `[^>]*` matches the `/` of a self-closing tag — the same shape §C58 fixed one
 * stage earlier in cnxml-extract.js. Before §C58, extraction swallowed
 * `<emphasis effect="bold"/>` into a runaway [[b:…]] capture, so the renderer
 * never saw a bare one; fixing extraction correctly exposed that the renderer
 * had never handled it either.
 *
 * Unlike the extractor's, this regex bounds its body with a "no nested emphasis"
 * guard, so a self-closing tag fails in TWO different ways depending on what
 * follows it:
 *   (a) a later </emphasis> with no intervening <emphasis  -> mis-pairs and
 *       swallows the text between them (the §C58 shape);
 *   (b) nothing pairable                                   -> leaks the raw tag
 *       verbatim into published HTML.
 * Measured 2026-08-12 in edlisfraedi-2e m42075: mode (b), reaching
 * 4-5-thverkraftur-togkraftur-og-onnur-daemi-um-krafta.html.
 *
 * A self-closing <emphasis/> carries no content, so the correct rendering is
 * nothing at all.
 */

import { describe, it, expect } from 'vitest';
import { processInlineContent } from '../cnxml-elements.js';

const ctx = () => ({});

describe('processInlineContent — self-closing <emphasis/> (§C61)', () => {
  it('mode (b): a lone self-closing emphasis must not leak raw CNXML', () => {
    const out = processInlineContent('alpha <emphasis effect="bold"/> bravo', ctx());
    expect(out).not.toContain('<emphasis');
    expect(out).toBe('alpha  bravo');
  });

  it('the real m42075 shape — self-closing tag between MathML and prose', () => {
    const out = processInlineContent(
      'the symbol <emphasis effect="bold"/> is equal in magnitude to',
      ctx()
    );
    expect(out).not.toContain('<emphasis');
  });

  it('mode (a): must not swallow text up to a later unrelated </emphasis>', () => {
    const out = processInlineContent(
      'alpha <emphasis effect="bold"/> bravo <emphasis effect="italics">ital</emphasis> charlie',
      ctx()
    );
    expect(out).not.toContain('<emphasis');
    // The italics element survives as its own <em>, and "bravo" stays outside it.
    expect(out).toContain('<em>ital</em>');
    expect(out).toContain('bravo');
    expect(out).not.toContain('<strong>');
  });

  it('mode (a), the reachable form: a self-closing tag INSIDE a paired one', () => {
    // Here the swallow is real rather than theoretical. The innermost-first regex
    // cannot start at the italics opener (its body would contain <emphasis), but it
    // CAN start at the self-closing bold and pair with the italics' </emphasis> —
    // producing <strong> b</strong> and leaking the italics opening tag.
    const out = processInlineContent(
      '<emphasis effect="italics">a <emphasis effect="bold"/> b</emphasis>',
      ctx()
    );
    expect(out).not.toContain('<emphasis');
    expect(out).toBe('<em>a  b</em>');
  });

  it('self-closing with no effect attribute is also dropped', () => {
    expect(processInlineContent('x <emphasis/> y', ctx())).not.toContain('<emphasis');
  });

  it('self-closing carrying a class is dropped too (no empty styled span)', () => {
    const out = processInlineContent('x <emphasis class="emphasis-one"/> y', ctx());
    expect(out).not.toContain('<emphasis');
    expect(out).not.toContain('emphasis-one');
  });

  // ---- CONTROLS: paired emphasis must be completely unaffected ----

  it('CONTROL: paired bold still renders <strong>', () => {
    expect(processInlineContent('<emphasis effect="bold">b</emphasis>', ctx())).toBe(
      '<strong>b</strong>'
    );
  });

  it('CONTROL: paired italics still renders <em>', () => {
    expect(processInlineContent('<emphasis effect="italics">i</emphasis>', ctx())).toBe(
      '<em>i</em>'
    );
  });

  it('CONTROL: paired underline still renders <u>', () => {
    expect(processInlineContent('<emphasis effect="underline">u</emphasis>', ctx())).toBe(
      '<u>u</u>'
    );
  });

  it('CONTROL: effect-less paired emphasis still defaults to italics', () => {
    expect(processInlineContent('<emphasis>x</emphasis>', ctx())).toBe('<em>x</em>');
  });

  it('CONTROL: the class attribute is still preserved verbatim on paired emphasis', () => {
    expect(processInlineContent('<emphasis class="centered-text">c</emphasis>', ctx())).toBe(
      '<em class="centered-text">c</em>'
    );
  });

  it('CONTROL: nested emphasis still pairs innermost-first', () => {
    const out = processInlineContent(
      '<emphasis effect="bold">a <emphasis effect="italics">b</emphasis> c</emphasis>',
      ctx()
    );
    expect(out).toBe('<strong>a <em>b</em> c</strong>');
  });
});
