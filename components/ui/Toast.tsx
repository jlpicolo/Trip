"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Icon } from "./Icon";

type Kind = "success" | "error" | "info";
interface ToastItem { id: number; kind: Kind; message: string }

const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, kind: Kind = "success") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, kind, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
        role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="animate-fade-up pointer-events-auto flex max-w-[420px] items-start gap-2 rounded-xl border border-line-strong bg-elev px-4 py-3 text-sm shadow-[var(--shadow)]">
            <Icon name={t.kind === "error" ? "alert" : t.kind === "success" ? "check" : "sync"} size={18}
              className={t.kind === "error" ? "text-error" : t.kind === "success" ? "text-success" : "text-night"} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
