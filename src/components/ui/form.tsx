import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

// Champs « remplis » façon Apple : fond discret, pas de bordure, anneau net au focus.
const control =
  "w-full rounded-xl border-0 bg-[color-mix(in_oklab,var(--text)_5%,var(--surface))] px-3.5 text-[14px] text-text outline-none ring-1 ring-transparent transition-[box-shadow,background] duration-200 placeholder:text-faint hover:bg-[color-mix(in_oklab,var(--text)_7%,var(--surface))] focus:bg-surface focus:ring-[color-mix(in_oklab,var(--text)_30%,transparent)] focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--text)_7%,transparent)] disabled:opacity-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-28 resize-y py-3 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "h-10 appearance-none pr-8", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="px-0.5 text-[13px] font-medium text-text">
        {label}
      </label>
      {children}
      {hint ? <p className="px-0.5 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[13px] text-danger">
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="text-[13px] text-success">{message}</p>;
}
