/**
 * The Bókasafn page's two activity panels ask GET /api/activity for the open book. That route
 * answers 403 to a head editor who does not hold the book, and to every editor. The page showed
 * a refusal as "Engin virkni", which reads as "nothing has happened in this chapter".
 *
 * This runs the page's own two loaders (taken from views/books.html as written) with a
 * fetchJson that fails, and compares what each panel ends up showing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import vm from 'vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const booksHtml = readFileSync(path.join(here, '..', 'views', 'books.html'), 'utf8');

/** The source of one `async function name(...) { ... }`, by brace matching. */
function functionSource(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  if (start === -1) throw new Error(`function ${name} not found`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`function ${name} is not closed`);
}

const LOADERS = [
  { name: 'loadChapterActivity', panel: 'activity-panel' },
  { name: 'cvLoadActivity', panel: 'cv-activity-panel' },
];

/** Run one loader; `answer` is what fetchJson does. Returns the panel's innerHTML and what was logged. */
async function show(loader, answer) {
  const elements = {};
  const logged = [];
  const context = vm.createContext({
    document: { getElementById: (id) => (elements[id] ||= { innerHTML: '' }) },
    console: { error: (...args) => logged.push(args) },
    fetchJson: answer,
    renderActivityRows: (rows) => `<ul data-rows="${rows.length}"></ul>`,
  });
  await vm.runInContext(
    `${functionSource(booksHtml, loader.name)}\n${loader.name}('liffraedi-2e', 1);`,
    context
  );
  return { html: elements[loader.panel].innerHTML, logged };
}

const refusal = () => Promise.reject(Object.assign(new Error('Forbidden'), { status: 403 }));
const NO_ACCESS = 'Þú hefur ekki aðgang að virkni þessarar bókar.';

describe.each(LOADERS)('Bókasafn: $name', (loader) => {
  it('says the reader has no access when the log is refused, and does not call it an error', async () => {
    const { html, logged } = await show(loader, refusal);
    expect(html).toContain(NO_ACCESS);
    expect(html).not.toContain('Engin virkni');
    expect(logged).toEqual([]);
  });

  it('control: an empty log still reads as no activity recorded', async () => {
    const { html } = await show(loader, () => Promise.resolve({ activities: [] }));
    expect(html).toContain('Engin virkni skráð');
    expect(html).not.toContain(NO_ACCESS);
  });

  it('control: rows are rendered', async () => {
    const { html } = await show(loader, () => Promise.resolve({ activities: [{}, {}] }));
    expect(html).toBe('<ul data-rows="2"></ul>');
  });

  it('control: any other failure keeps its old line and is logged', async () => {
    const { html, logged } = await show(loader, () =>
      Promise.reject(Object.assign(new Error('boom'), { status: 500 }))
    );
    expect(html).toContain('Engin virkni');
    expect(html).not.toContain(NO_ACCESS);
    expect(logged).toHaveLength(1);
  });
});
