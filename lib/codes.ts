"use client";

import { codeFormatFromScan } from "@/lib/tickets";
import type { CodeFormat } from "@/lib/types/tickets";

/** Dessine le code dans le canvas (noir sur blanc, marge de silence incluse). */
export async function drawCode(canvas: HTMLCanvasElement, format: CodeFormat, value: string, scale = 4) {
  const { toCanvas } = await import("bwip-js/browser");
  toCanvas(canvas, {
    bcid: format,
    text: value,
    scale,
    paddingwidth: 4,
    paddingheight: 4,
    backgroundcolor: "FFFFFF",
    includetext: format === "code128" || format === "ean13" || format === "code39",
    textxalign: "center",
    ...(format === "pdf417" ? { columns: 6 } : {}),
  });
}

let prepared = false;

/** Lit un code dans une image (capture d'écran, photo). Module WebAssembly servi par l'app. */
export async function scanCodeImage(image: Blob): Promise<{ format: CodeFormat; value: string } | null> {
  const zxing = await import("zxing-wasm/reader");
  if (!prepared) {
    zxing.prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing/zxing_reader.wasm" : prefix + path) },
    });
    prepared = true;
  }
  const results = await zxing.readBarcodes(image, {
    formats: ["QRCode", "Aztec", "PDF417", "DataMatrix", "Code128", "EAN13", "Code39"],
    tryHarder: true,
    maxNumberOfSymbols: 1,
  });
  for (const r of results) {
    const format = codeFormatFromScan(r.format);
    if (r.isValid && format && r.text) return { format, value: r.text };
  }
  return null;
}
