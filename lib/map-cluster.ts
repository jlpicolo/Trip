export const CLUSTER_PX = 38;

/**
 * Regroupement glouton par distance à l'écran : deux marqueurs à moins de CLUSTER_PX
 * pixels se rejoignent. Le lieu sélectionné ou en déplacement n'est jamais regroupé.
 */
export function clusterPoints<T extends { id: string; x: number; y: number }>(points: T[], keepAlone: Set<string>, radius = CLUSTER_PX): T[][] {
  const groups: { cx: number; cy: number; items: T[] }[] = [];
  for (const p of points) {
    if (keepAlone.has(p.id)) {
      groups.push({ cx: p.x, cy: p.y, items: [p] });
      continue;
    }
    const g = groups.find((g) => !keepAlone.has(g.items[0].id) && Math.hypot(g.cx - p.x, g.cy - p.y) < radius);
    if (g) {
      g.items.push(p);
      g.cx = g.items.reduce((s, i) => s + i.x, 0) / g.items.length;
      g.cy = g.items.reduce((s, i) => s + i.y, 0) / g.items.length;
    } else groups.push({ cx: p.x, cy: p.y, items: [p] });
  }
  return groups.map((g) => g.items);
}
