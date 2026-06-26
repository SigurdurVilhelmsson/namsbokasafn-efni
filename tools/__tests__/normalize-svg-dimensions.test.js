import { describe, it, expect } from 'vitest';
import { normalizeSvgDimensions } from '../normalize-svg-dimensions.js';

// Make a translated SVG's intrinsic size large enough to fill the reading column
// (vefur caps content images with max-width:100% and never upscales). Vector, so
// enlarging is lossless; aspect comes from the SVG's own viewBox (no distortion).

describe('normalizeSvgDimensions', () => {
  it('sets width to the target and derives height from the viewBox aspect', () => {
    const svg = '<svg width="469.45" height="88" viewBox="0 0 469.45 88"><g/></svg>';
    const { svg: out } = normalizeSvgDimensions(svg, 1300);
    // aspect 88/469.45 → height 1300 * 88/469.45 = 243.69
    expect(out).toContain('width="1300"');
    expect(out).toContain('height="243.69"');
    expect(out).toContain('viewBox="0 0 469.45 88"'); // viewBox untouched
  });

  it('reports changed=true with before/after sizes', () => {
    const svg = '<svg width="468" height="203" viewBox="0 0 468 203"></svg>';
    const r = normalizeSvgDimensions(svg, 1300);
    expect(r.changed).toBe(true);
    expect(r.before).toEqual({ width: 468, height: 203 });
    expect(r.after.width).toBe(1300);
  });

  it('is idempotent — a second pass makes no change', () => {
    const svg = '<svg width="468" height="203" viewBox="0 0 468 203"></svg>';
    const once = normalizeSvgDimensions(svg, 1300).svg;
    const twice = normalizeSvgDimensions(once, 1300);
    expect(twice.changed).toBe(false);
    expect(twice.svg).toBe(once);
  });

  it('inserts width/height when the svg tag has only a viewBox', () => {
    const svg = '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"></svg>';
    const out = normalizeSvgDimensions(svg, 1300).svg;
    expect(out).toContain('width="1300"');
    expect(out).toContain('height="650"');
    expect(out).toContain('viewBox="0 0 100 50"');
  });

  it('falls back to the width/height ratio when there is no viewBox', () => {
    const svg = '<svg width="200" height="100"></svg>';
    const out = normalizeSvgDimensions(svg, 1300).svg;
    expect(out).toContain('width="1300"');
    expect(out).toContain('height="650"');
  });

  it('leaves the file unchanged when no aspect can be determined', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>';
    const r = normalizeSvgDimensions(svg, 1300);
    expect(r.changed).toBe(false);
    expect(r.svg).toBe(svg);
  });

  it('only rewrites the opening <svg> tag, not nested width/height', () => {
    const svg =
      '<svg width="468" height="203" viewBox="0 0 468 203"><rect width="10" height="5"/></svg>';
    const out = normalizeSvgDimensions(svg, 1300).svg;
    expect(out).toContain('<rect width="10" height="5"/>'); // nested untouched
  });
});
