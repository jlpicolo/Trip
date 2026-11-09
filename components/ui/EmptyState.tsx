import { Icon, type IconName } from "./Icon";

export function EmptyState({ icon, title, children, action }: {
  icon: IconName; title: string; children?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-sakura-soft text-sakura"><Icon name={icon} /></div>
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="max-w-xs text-sm text-dim">{children}</div>}
      {action}
    </div>
  );
}

export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-dim" role="status">
      <Icon name="sync" size={18} className="animate-spin-slow" /> {label}
    </div>
  );
}
