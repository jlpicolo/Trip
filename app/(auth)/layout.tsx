import { Icon } from "@/components/ui/Icon";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="safe-top flex min-h-dvh flex-col">
      <header className="seigaiha relative overflow-hidden border-b border-line px-6 pb-8 pt-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-base" />
        <div className="relative mx-auto flex max-w-[400px] items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-vermillion text-on-accent shadow-[var(--shadow)]">
            <Icon name="torii" size={28} />
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight">Japan Trip</p>
            <p className="text-sm text-dim">旅 · Le voyage, à plusieurs</p>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[400px] flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
