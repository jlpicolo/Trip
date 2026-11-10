import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "ghost" | "danger" | "subtle";

const styles: Record<Variant, string> = {
  primary: "bg-coral text-on-accent hover:brightness-110 active:brightness-95",
  ghost: "border border-line-strong bg-transparent text-ink hover:bg-elev",
  danger: "border border-error/40 bg-transparent text-error hover:bg-error/10",
  subtle: "bg-elev text-ink hover:brightness-110",
};

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  block?: boolean;
}

export function Button({ variant = "primary", icon, loading, block, className = "", children, disabled, ...rest }: Props) {
  return (
    <button className={`${base} ${styles[variant]} ${block ? "w-full" : ""} ${className}`} disabled={disabled || loading}
      aria-busy={loading || undefined} {...rest}>
      {loading ? <Icon name="sync" size={18} className="animate-spin-slow" /> : icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "primary", icon, children, block }: {
  href: string; variant?: Variant; icon?: IconName; children: ReactNode; block?: boolean;
}) {
  return (
    <Link href={href} className={`${base} ${styles[variant]} ${block ? "w-full" : ""}`}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </Link>
  );
}
