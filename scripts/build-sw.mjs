// Génère public/sw.js à partir de scripts/sw.template.js : version (commit déployé, sinon
// horodatage) et liste des pages statiques à précacher, déduite de app/. Lancé avant build et dev.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function routes(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (name.startsWith("[") || name.startsWith("_") || name === "auth") continue; // segments dynamiques, routes serveur
    const seg = name.startsWith("(") ? prefix : `${prefix}/${name}`;
    try {
      statSync(join(full, "page.tsx"));
      if (seg) out.push(seg);
    } catch {}
    out.push(...routes(full, seg));
  }
  return out;
}

// Pages simplement redirigées vers une autre : inutile de les précacher.
const REDIRECTS = new Set(["/transports", "/documents"]);
const list = routes("app").filter((r) => !REDIRECTS.has(r)).sort();
const version = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 12) || Date.now().toString(36);
const sw = readFileSync("scripts/sw.template.js", "utf8")
  .replace("__VERSION__", version)
  .replace("__ROUTES__", JSON.stringify(list));
writeFileSync("public/sw.js", sw);
console.log(`public/sw.js généré (version ${version}, ${list.length} pages)`);
