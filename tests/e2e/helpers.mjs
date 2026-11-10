import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { usernameToEmail } from "../../scripts/lib/username.mjs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const SHOTS = "tests/e2e/screenshots";
export const run = Date.now().toString(36);
export const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Playwright n'est pas une dépendance du projet (navigateur fourni par l'environnement de test).
const { chromium } = createRequire(import.meta.url)("playwright");

export async function createTraveler(name) {
  const user = { username: `${name.toLowerCase()}-${run}`, password: `${name}-${run}-pass`, name };
  const { data, error } = await admin.auth.admin.createUser({
    email: usernameToEmail(user.username), password: user.password, email_confirm: true, user_metadata: { display_name: name },
  });
  if (error) throw error;
  user.id = data.user.id;
  return user;
}

/** Groupe + voyage créés directement en base (le parcours de création est couvert par collaboration.e2e). */
export async function createTrip(members, fields = {}) {
  const { data: group, error } = await admin.from("travel_groups").insert({ name: "Test" }).select("id").single();
  if (error) throw error;
  await admin.from("group_members").insert(members.map((m) => ({ group_id: group.id, user_id: m.id })));
  const id = crypto.randomUUID();
  const { error: tErr } = await admin.from("trips").insert({
    id, group_id: group.id, name: "Japan Trip", start_date: "2027-03-09", end_date: "2027-03-30", timezone: "Asia/Tokyo",
    base_currency: "EUR", secondary_currency: "JPY",
    destinations: ["Osaka", "Nara", "Kyoto", "Kanazawa", "Nagano", "Tokyo"].map((name) => ({ id: crypto.randomUUID(), name })),
    ...fields,
  });
  if (tErr) throw tErr;
  return { groupId: group.id, tripId: id };
}

export async function cleanup(users, tripIds = []) {
  const ids = users.map((u) => u?.id).filter(Boolean);
  const { data: groups } = await admin.from("group_members").select("group_id").in("user_id", ids);
  for (const g of new Set((groups ?? []).map((x) => x.group_id))) await admin.from("travel_groups").delete().eq("id", g);
  for (const t of tripIds) await admin.from("activity_log").delete().eq("trip_id", t);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
}

export async function launch() {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
  const browser = await chromium.launch({ proxy });
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: !!proxy, locale: "fr-FR" };
  return { browser, mobile, desktop: { viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: !!proxy, locale: "fr-FR" } };
}

export async function login(page, user) {
  await page.goto(`${BASE}/connexion`);
  await page.getByLabel("Nom d'utilisateur").fill(user.username);
  await page.getByLabel("Mot de passe").fill(user.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/accueil/);
}

export function stepper(pages) {
  const done = [];
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      for (const [who, page] of Object.entries(pages)) {
        await page.screenshot({ path: `${SHOTS}/echec-${who}.png`, fullPage: true }).catch(() => {});
        console.log(`--- ${who} @ ${page.url()}`);
      }
      throw e;
    }
    done.push(name);
    console.log(`  ✓ ${name}`);
  };
  return { step, done };
}

/** Exigence « responsive » : aucune page ne doit défiler horizontalement. */
export async function assertNoHorizontalScroll(page, label) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  if (sw > iw) throw new Error(`Débordement horizontal (${label}) : ${sw}px de contenu pour ${iw}px d'écran`);
}

/** Réessaie une vérification côté serveur le temps que la synchro (différée de ~2 s) passe. */
export async function eventually(check, { timeout = 20_000, interval = 500 } = {}) {
  const t0 = Date.now();
  for (;;) {
    try {
      return await check();
    } catch (e) {
      if (Date.now() - t0 > timeout) throw e;
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}

/** Contraste WCAG entre la couleur du texte et le fond d'un élément (fond opaque attendu). */
export async function assertContrast(locator, min = 4.5, label = "") {
  const ratio = await locator.evaluate((el) => {
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const s = getComputedStyle(el);
    let bgEl = el;
    let bg = s.backgroundColor;
    while (bg === "rgba(0, 0, 0, 0)" && bgEl.parentElement) { bgEl = bgEl.parentElement; bg = getComputedStyle(bgEl).backgroundColor; }
    const [a, b] = [lum(rgb(s.color)), lum(rgb(bg))].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
  if (ratio < min) throw new Error(`Contraste insuffisant ${label} : ${ratio.toFixed(2)} < ${min}`);
  return ratio;
}
