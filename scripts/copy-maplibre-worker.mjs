// Copie le worker MapLibre (autonome) dans public/ : il est chargé par URL fixe
// (setWorkerUrl), ce qui évite de dépendre de la résolution du bundler et permet
// au service worker de le mettre en cache pour le hors ligne.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/maplibre", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre/maplibre-gl-worker.mjs");
