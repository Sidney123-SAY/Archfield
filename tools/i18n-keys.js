// Liste les textes français à traduire : appels t("…") et plural(…, "…", "…") dans public/js, libellés des menus,
// contenu des éléments data-i18n des pages HTML, noms de pays et d'étapes du serveur.
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const keys = new Set();
const unq = (s) => s.replace(/\\"/g, '"').replace(/\\n/g, "\n");
for (const f of ["ui.js", "app.js", "client.js", "auth.js"]) {
  const src = fs.readFileSync(path.join(root, "public/js", f), "utf8");
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(unq(m[1]));
  for (const m of src.matchAll(/\bplural\([^,]+,\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"/g)) { keys.add(unq(m[1])); keys.add(unq(m[2])); }
  for (const m of src.matchAll(/\[\s*"[\w-]+",\s*"([^"]+)"(?:,\s*"[\w]+")?\s*(?:,[^\]]*)?\]/g)) keys.add(m[1]);
  for (const m of src.matchAll(/^\s*(?:"[\w-]+"|[\w-]+):\s*(?:\[\s*"\w+",\s*)?"((?:[^"\\]|\\.)*)"/gm)) keys.add(unq(m[1]));
  for (const m of src.matchAll(/(?:start|finish|reopen):\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(unq(m[1]));
  for (const m of src.matchAll(/\[\s*"\/[\w-]+",\s*\[\s*"\w+",\s*"([^"]+)",\s*'([^']+)'/g)) { keys.add(m[1]); keys.add(m[2]); }
}
for (const f of fs.readdirSync(path.join(root, "public")).filter((x) => x.endsWith(".html"))) {
  const src = fs.readFileSync(path.join(root, "public", f), "utf8");
  for (const m of src.matchAll(/<(\w+)[^>]*\sdata-i18n(?:="")?[^>]*>([\s\S]*?)<\/\1>/g)) keys.add(m[2].trim().replace(/\s+/g, " "));
  const title = src.match(/<title>(.*?)<\/title>/); if (title) title[1].split(" · ").forEach((p) => keys.add(p));
}
const { COUNTRIES } = require(path.join(root, "server/company.js"));
Object.values(COUNTRIES).forEach((c) => { keys.add(c.name); keys.add(c.id); keys.add(c.hint); });
const srv = fs.readFileSync(path.join(root, "server/server.js"), "utf8");
const tpl = srv.slice(srv.indexOf("const TEMPLATES"), srv.indexOf("};", srv.indexOf("const TEMPLATES")));
for (const m of tpl.matchAll(/\["([^"]+)",/g)) keys.add(m[1]);
keys.delete("Archfield");
module.exports = [...keys].filter((k) => /[a-zà-ÿ]/i.test(k));
if (require.main === module) console.log(JSON.stringify(module.exports, null, 0));
