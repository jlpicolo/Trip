"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { applyTheme, readTheme, type ThemePref } from "@/lib/theme";

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "dark", label: "Sombre" },
  { value: "light", label: "Clair" },
  { value: "system", label: "Système" },
];

export function AppearanceSection() {
  const [pref, setPref] = useState<ThemePref>(() => (typeof window === "undefined" ? "dark" : readTheme()));
  return (
    <Card>
      <div role="radiogroup" aria-label="Thème" className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button key={o.value} role="radio" aria-checked={pref === o.value}
            onClick={() => { setPref(o.value); applyTheme(o.value); }}
            className={`min-h-11 rounded-xl border text-sm font-semibold ${pref === o.value ? "border-vermillion bg-vermillion-soft text-vermillion" : "border-line-strong text-dim"}`}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-mute">Préférence propre à cet appareil.</p>
    </Card>
  );
}
