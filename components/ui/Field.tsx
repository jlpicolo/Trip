import { useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const inputCls =
  "min-h-11 w-full rounded-xl border border-line-strong bg-elev px-3 text-base text-ink placeholder:text-mute focus:border-sakura focus:outline-none aria-[invalid=true]:border-error";

export function Field({ label, error, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & {
  label: string; error?: string; hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-dim">{label}</label>
      <input id={id} className={inputCls} aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined} {...rest} />
      {(error || hint) && <p id={`${id}-msg`} className={`text-xs ${error ? "text-error" : "text-mute"}`}>{error ?? hint}</p>}
    </div>
  );
}

export function SelectField({ label, error, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string; error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-dim">{label}</label>
      <select id={id} className={inputCls} aria-invalid={error ? true : undefined} {...rest}>{children}</select>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{message}</p>;
}

export function TextAreaField({ label, error, hint, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string; error?: string; hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-dim">{label}</label>
      <textarea id={id} rows={3} className={`${inputCls} min-h-24 py-2`} aria-invalid={error ? true : undefined} {...rest} />
      {(error || hint) && <p className={`text-xs ${error ? "text-error" : "text-mute"}`}>{error ?? hint}</p>}
    </div>
  );
}
