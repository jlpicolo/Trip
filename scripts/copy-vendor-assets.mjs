// Copie dans public/ les fichiers chargés par URL fixe : le worker MapLibre (setWorkerUrl)
// et le module WebAssembly du lecteur de codes-barres (sinon téléchargé depuis un CDN).
// Indépendant du bundler, et cachable par le service worker pour le hors ligne.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/maplibre", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre/maplibre-gl-worker.mjs");
mkdirSync("public/zxing", { recursive: true });
copyFileSync("node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", "public/zxing/zxing_reader.wasm");
