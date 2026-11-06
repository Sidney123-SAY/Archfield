// Retire d'une base les comptes de démonstration (données fictives) et leurs photos.
// Usage : npm run purge-demo        (les vrais comptes ne sont pas touchés)
const fs = require("node:fs");
const path = require("node:path");
const { all, run, UPLOAD_DIR } = require("./db");

const DEMO = ["demo@archfield.app", "demo-afrique@archfield.app", "demo-client@archfield.app", "demo-proche@archfield.app"];
let accounts = 0, files = 0;
for (const email of DEMO) {
  const a = all("SELECT id, contact_name FROM artisans WHERE email = ?", email)[0];
  if (!a) continue;
  const sites = all("SELECT id FROM sites WHERE artisan_id = ? OR owner_id = ?", a.id, a.id).map((s) => s.id);
  for (const id of sites) {
    for (const f of all(`SELECT p.file FROM photos p JOIN updates u ON u.id = p.update_id WHERE u.site_id = ? UNION SELECT x.file FROM audios x JOIN updates u ON u.id = x.update_id WHERE u.site_id = ?
      UNION SELECT receipt_file AS file FROM ledger WHERE site_id = ? AND receipt_file IS NOT NULL`, id, id, id)) { fs.rmSync(path.join(UPLOAD_DIR, path.basename(f.file)), { force: true }); files++; }
    run("DELETE FROM sites WHERE id = ?", id);
  }
  run("DELETE FROM artisans WHERE id = ?", a.id);
  accounts++;
  console.log(`Compte de démo retiré : ${a.contact_name} (${email}), ${sites.length} chantier(s).`);
}
console.log(accounts ? `${accounts} compte(s) et ${files} fichier(s) retirés.` : "Aucun compte de démo dans cette base.");
