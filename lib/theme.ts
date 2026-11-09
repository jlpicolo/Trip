export type ThemePref = "dark" | "light" | "system";
export const THEME_KEY = "jt-theme";

// Préférence propre à l'appareil : stockée localement, appliquée avant le premier rendu.
export const themeBootScript = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"dark";var t=p==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):p;document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // stockage indisponible (navigation privée) : thème appliqué pour la session seulement
  }
  const resolved = pref === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : pref;
  document.documentElement.setAttribute("data-theme", resolved);
}
