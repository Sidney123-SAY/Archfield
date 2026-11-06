// Chaque texte affiché par l'interface doit avoir sa traduction anglaise dans public/js/i18n-en.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const IGNORE = new Set(["sun", "moon", "screen", "nouveau-chantier", "location", "BE", "US", "mes-chantiers", "doc", "cam", "money", "warn", "mic", "logo-foot"]);

test("toutes les phrases de l'interface ont une traduction anglaise", () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/js/i18n-en.js"), "utf8"), ctx);
  const EN = ctx.window.AF_EN;
  const keys = require("../tools/i18n-keys.js").filter((k) => !IGNORE.has(k));
  const missing = keys.filter((k) => EN[k] === undefined);
  assert.deepEqual(missing, [], "Traductions manquantes dans public/js/i18n-en.js");
  for (const [fr, en] of Object.entries(EN)) {
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(vars(en), vars(fr), `Variables différentes entre « ${fr} » et sa traduction`);
  }
});
