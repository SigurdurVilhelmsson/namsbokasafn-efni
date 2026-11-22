/**
 * The users dialog on /admin assigns chapters through POST /api/admin/users/:id/chapters. When the
 * assign gate refuses (G1.13 spec §6.5) the route answers 409 with the code ASSIGNMENT_REFUSED in
 * `error` and the reason, in Icelandic, in `message`. The admin must see the reason, not the code.
 *
 * This runs the page's own `usersAssignChapter` (taken from views/admin.html as written) with the
 * real `fetchJson` (public/js/htmlUtils.js) over a stubbed fetch, and compares the toast text that
 * comes out. The last case is the control: an error with no JSON body still shows fetchJson's own
 * message, so the harness is not passing everything through one path.
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
const { REFUSAL_MESSAGES } = require('../services/assignmentGate');

/** The source from `head` to the brace that closes the first `{` after it. */
function sourceFrom(source, head) {
  const start = source.indexOf(head);
  if (start === -1) throw new Error(`${head} not found`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${head} is not closed`);
}

const ASSIGN = sourceFrom(adminHtml, 'window.usersAssignChapter = async function');
const FETCH_JSON = sourceFrom(htmlUtils, 'async function fetchJson(');

/** Run the page's assign handler against one stubbed response; returns the toasts and requests. */
async function assignWith(response) {
  const toasts = [];
  const requests = [];
  const elements = { 'assign-book': { value: 'efnafraedi-2e' }, 'assign-chapter': { value: '3' } };
  const context = vm.createContext({
    window: {},
    chapterLabel,
    currentEditUser: { id: 7 },
    document: { getElementById: (id) => elements[id] },
    showToast: (msg, type) => toasts.push([msg, type]),
    usersLoadChapterAssignments: () => {},
    fetch: async (url, options) => {
      requests.push([url, options.method]);
      return response;
    },
  });
  vm.runInContext(`${FETCH_JSON}\n${ASSIGN};`, context);
  await context.window.usersAssignChapter();
  return { toasts, requests };
}

const jsonResponse = (status, body) => ({ ok: false, status, json: async () => body });

describe('users dialog: a refused assign shows the reason (spec §6.5)', () => {
  it('a 409 ASSIGNMENT_REFUSED toasts the Icelandic message, as an error', async () => {
    const { toasts, requests } = await assignWith(
      jsonResponse(409, {
        error: 'ASSIGNMENT_REFUSED',
        reason: 'no-licence-clause',
        message: REFUSAL_MESSAGES['no-licence-clause'],
      })
    );
    expect(requests).toEqual([['/api/admin/users/7/chapters', 'POST']]);
    expect(toasts).toEqual([[REFUSAL_MESSAGES['no-licence-clause'], 'error']]);
  });

  it('control: an error without a JSON body toasts fetchJson’s own message', async () => {
    const { toasts } = await assignWith({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('not JSON');
      },
    });
    expect(toasts).toEqual([['Netþjónninn svaraði HTTP 502', 'error']]);
  });
});
