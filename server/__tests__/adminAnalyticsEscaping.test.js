/**
 * The statistics tab of /admin shows analytics events, and every value in an event comes from
 * POST /api/analytics/event, which needs no sign-in. Those values must reach the page as text.
 *
 * This runs the page's own three functions (taken from views/admin.html as written) against
 * events whose every field carries markup, and compares the VALUES that come out: the markup
 * must be present as escaped text and absent as markup. A count of escapeHtml calls could not
 * tell a covered field from an uncovered one.
 *
 * The last test is the control: the same harness, run on a copy of the code with the escaping
 * taken out, must see the markup. Without it a harness that broke everything would read as a pass.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const adminHtml = readFileSync(path.join(here, '..', 'views', 'admin.html'), 'utf8');
const htmlUtils = readFileSync(path.join(here, '..', 'public', 'js', 'htmlUtils.js'), 'utf8');
const chapterLabel = require('../public/js/chapter-label.js');

/** The source of one top-level `function name(...) { ... }`, by brace matching. */
function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`function ${name} not found`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`function ${name} is not closed`);
}

const PAGE_FUNCTIONS = ['anFormatNumber', 'anUpdatePopular', 'anUpdateActivity', 'anGetEventDesc']
  .map((name) => functionSource(adminHtml, name))
  .join('\n');
const ESCAPE_HTML = functionSource(htmlUtils, 'escapeHtml');

/** Run the page's functions with a stub document; returns what each element's innerHTML became. */
function render(pageFunctions, call) {
  const elements = {};
  const context = vm.createContext({
    chapterLabel,
    document: {
      getElementById(id) {
        return (elements[id] ||= { innerHTML: '' });
      },
    },
  });
  vm.runInContext(`${ESCAPE_HTML}\n${pageFunctions}\n${call}`, context);
  return elements;
}

const MARKUP = /<(img|b|i|u|svg|script)\b/i;

const HOSTILE_EVENTS = [
  {
    eventType: 'page_view',
    book: '<img src=x onerror=A>',
    chapter: '<b>B</b>',
    section: '<i>C</i>',
    createdAt: '<u>D</u>',
  },
  { eventType: 'search', metadata: { query: '<svg onload=E>' } },
  { eventType: '<script>F</script>' },
];

describe('admin statistics tab: one malformed event cannot blank the list', () => {
  // POST /api/analytics/event needs no sign-in and puts no type on what is inside `metadata`.
  // A search event whose `query` is an object with no usable toString made the description's
  // string concatenation throw, and the page then replaced every counter and both panels with
  // an error for as long as that event was among the newest.
  const UNPRINTABLE = { toString: 1, valueOf: 1 };
  const EVENTS = [
    { eventType: 'search', metadata: { query: UNPRINTABLE } },
    { eventType: 'search', metadata: { query: ['a', 'b'] } },
    { eventType: 'search', metadata: { query: 42 } },
    { eventType: 'search', metadata: { query: 'sýra' } },
    { eventType: 'page_view', book: 'efnafraedi-2e' },
  ];

  it('renders every event, showing a search query only when it is text', () => {
    const html = render(PAGE_FUNCTIONS, `anUpdateActivity(${JSON.stringify(EVENTS)});`)[
      'an-activity-list'
    ].innerHTML;
    expect(html.match(/class="activity-item"/g)).toHaveLength(EVENTS.length);
    expect(html).toContain('Leitað: sýra');
    expect(html).toContain('efnafraedi-2e');
    expect(html).not.toContain('[object');
    expect(html).not.toContain('a,b');
  });
});

describe('admin statistics tab: analytics values are shown as text', () => {
  it('the activity list escapes book, chapter, section, search query, event type and time', () => {
    const html = render(PAGE_FUNCTIONS, `anUpdateActivity(${JSON.stringify(HOSTILE_EVENTS)});`)[
      'an-activity-list'
    ].innerHTML;

    // Present, as text: the values did reach the list.
    for (const text of [
      '&lt;img src=x onerror=A&gt;',
      '&lt;b&gt;B&lt;/b&gt;',
      '&lt;i&gt;C&lt;/i&gt;',
      '&lt;u&gt;D&lt;/u&gt;',
      '&lt;svg onload=E&gt;',
      '&lt;script&gt;F&lt;/script&gt;',
    ]) {
      expect(html).toContain(text);
    }
    // Absent, as markup.
    expect(html).not.toMatch(MARKUP);
  });

  it('the most-viewed table escapes book, chapter and section', () => {
    const stats = {
      topContent: [{ book: '<img src=x>', chapter: '<b>1</b>', section: '<i>s</i>', views: 3 }],
    };
    const html = render(PAGE_FUNCTIONS, `anUpdatePopular(${JSON.stringify(stats)});`)[
      'an-popular-body'
    ].innerHTML;

    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('&lt;b&gt;1&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;s&lt;/i&gt;');
    expect(html).not.toMatch(MARKUP);
  });

  it('control: with the escaping removed, this harness sees the markup', () => {
    const unescaped = PAGE_FUNCTIONS.replace(
      'escapeHtml(anGetEventDesc(ev))',
      'anGetEventDesc(ev)'
    );
    expect(unescaped).not.toBe(PAGE_FUNCTIONS); // the replacement found its target
    const html = render(unescaped, `anUpdateActivity(${JSON.stringify(HOSTILE_EVENTS)});`)[
      'an-activity-list'
    ].innerHTML;
    expect(html).toMatch(MARKUP);
  });
});
