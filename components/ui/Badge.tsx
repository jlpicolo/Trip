type Tone = "neutral" | "vermillion" | "sakura" | "night" | "success" | "warning" | "error";

const tones: Record<Tone, string> = {
  neutral: "bg-elev text-dim",
  vermillion: "bg-vermillion-soft text-vermillion",
  sakura: "bg-sakura-soft text-sakura",
  night: "bg-night-soft text-night",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  error: "bg-error/15 text-error",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
