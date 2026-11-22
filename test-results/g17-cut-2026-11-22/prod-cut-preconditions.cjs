// Read-only (run on prod: `cd ~/repos/namsbokasafn-efni/server && /usr/bin/node - < this`).
// G1.7 §8: the cut must land before any chemistry unit opens and before G1.13 assigns. Counts only, no row values.
const Database = require('better-sqlite3');
const db = new Database('../pipeline-output/sessions.db', { readonly: true, fileMustExist: true });
const one = (sql, ...p) => db.prepare(sql).get(...p);
const B = 'efnafraedi-2e';
const out = {
  control_registered_books: one('SELECT COUNT(*) n FROM registered_books').n,
  module_openings_chem: one('SELECT COUNT(*) n FROM module_openings WHERE book = ?', B).n,
  module_openings_all: one('SELECT COUNT(*) n FROM module_openings').n,
  module_opening_inflight_chem: one('SELECT COUNT(*) n FROM module_opening_inflight WHERE book = ?', B).n,
  chapter_assignments_chem_all: one('SELECT COUNT(*) n FROM chapter_assignments WHERE book = ?', B).n,
  chapter_assignments_chem_active: one("SELECT COUNT(*) n FROM chapter_assignments WHERE book = ? AND status = 'active'", B).n,
  chapter_assignments_all: one('SELECT COUNT(*) n FROM chapter_assignments').n,
};
db.close();
console.log(JSON.stringify(out));
