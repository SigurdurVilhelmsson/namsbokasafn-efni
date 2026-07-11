// @ts-check
// The MT edit-lock first-edit hook (segmentEditorService → writeMtLock) fires
// when a writer spec saves a segment edit for the committed fixture book,
// leaving an untracked .locked marker inside books/__e2e-fixture__/02-mt-output/
// on every run (each run seeds a fresh DB, so the "first edit" fires each time).
// Sweep those markers so an E2E run always leaves the git tree clean. Also
// catches markers stranded by a previous aborted run (teardown doesn't execute
// on a hard kill, but the next completed run cleans up).
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const mtRoot = path.join(__dirname, '..', '..', 'books', '__e2e-fixture__', '02-mt-output');
  if (!fs.existsSync(mtRoot)) return;
  for (const ch of fs.readdirSync(mtRoot)) {
    const chDir = path.join(mtRoot, ch);
    if (!fs.statSync(chDir).isDirectory()) continue;
    for (const f of fs.readdirSync(chDir)) {
      if (f.endsWith('-segments.locked')) fs.unlinkSync(path.join(chDir, f));
    }
  }
};
