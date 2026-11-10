// Génère les icônes de l'app (PNG) depuis un SVG, avec le Chromium de Playwright (outil de dev,
// lancé à la main : `node scripts/gen-icons.mjs`). Les PNG sont versionnés dans public/icons.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const { chromium } = createRequire(import.meta.url)("playwright");

// Torii (même tracé que l'icône de l'app) sur un soleil levant corail, fond bleu nuit.
const svg = (safe) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#0b1020"/>
  <circle cx="256" cy="256" r="${safe ? 150 : 190}" fill="#ff6b6b"/>
  <g transform="translate(256 262) scale(${safe ? 9 : 11.5}) translate(-12 -12)" fill="none" stroke="#0b1020" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 5c6 1.3 12 1.3 18 0M5 9h14M7 6.5V21M17 6.5V21M12 6.8V9"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, safe] of [["icon-192.png", 192, false], ["icon-512.png", 512, false], ["maskable-512.png", 512, true]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg(safe).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: `public/icons/${file}`, omitBackground: false, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`public/icons/${file}`);
}
await browser.close();
