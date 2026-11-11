import type { NextConfig } from "next";

// Repris de One for All : en-têtes de sécurité globaux et service worker jamais mis en cache HTTP
// (sinon une nouvelle version du SW peut rester bloquée sur les appareils).
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const dev = process.env.NODE_ENV !== "production";

/**
 * Politique de sécurité du contenu : seuls les services réellement utilisés sont joignables
 * (Supabase, OpenFreeMap, Nominatim, Frankfurter). `unsafe-inline` reste nécessaire pour les
 * scripts en ligne de Next (pages statiques, sans nonce) et le thème appliqué avant le rendu ;
 * `wasm-unsafe-eval` pour le lecteur de codes-barres (WebAssembly). `blob:` sert aux aperçus de
 * billets (PDF, images) lus depuis l'appareil.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org",
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabase.replace(/^https:/, "wss:")} https://tiles.openfreemap.org https://nominatim.openstreetmap.org https://api.frankfurter.dev${dev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'self' blob:",
  "frame-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Indispensable : c'est ce chargeur qui compile Tailwind CSS 4 sous Turbopack.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
