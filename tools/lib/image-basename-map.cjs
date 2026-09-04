/**
 * The basename-keyed translated-image map: `books/<slug>/media/image-mapping.json`.
 *
 * ⚠️ .cjs on purpose, and for the one reason CLAUDE.md admits: BOTH trees
 * consume it. `tools/` is ESM (cnxml-inject swaps `<image src>` with it;
 * cnxml-render inverts it to find a figure's sidecar) and `server/` is
 * CommonJS (figureReviewService reads it FORWARD, to serve a translated figure
 * to the editor's review card). A `.js` here would load from neither one side
 * nor the other, and a second copy on the server side would be two
 * implementations of one rule.
 *
 * ⚠️ The `_IS` suffix appears NOWHERE in this file, deliberately. It is an
 * enforceable value owned by tools/generate-image-mapping.js's DEFAULT_SUFFIX
 * and pinned against the committed corpus by its own test; every consumer here
 * reads the mapping rather than rebuilding the name, and so stays correct if
 * the suffix ever changes or an entry renames an image by some other rule.
 */
const fs = require('fs');
const path = require('path');

/**
 * Load the new-route (basename-keyed) image map from a book's media dir.
 * Returns only entries that carry `originalImage` — legacy figure-id entries
 * (and the docx-import route, which is all of liffraedi-2e's file) are
 * intentionally excluded.
 *
 * Never throws: an absent or malformed mapping means "this book has no
 * translated images", which is the ordinary state of most of the corpus, and a
 * chapter render must not die on one bad file.
 *
 * @param {string} bookDir - Book directory, i.e. `books/<slug>`
 * @returns {Array<{originalImage:string,outputName:string,extension?:string}>}
 */
function loadImageBasenameMap(bookDir) {
  const mappingPath = path.join(bookDir, 'media', 'image-mapping.json');
  try {
    const data = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    return Array.isArray(data) ? data.filter((e) => e && e.originalImage && e.outputName) : [];
  } catch {
    return [];
  }
}

module.exports = { loadImageBasenameMap };
