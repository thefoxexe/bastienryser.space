import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cn("min-w-0 rounded-2xl bg-surface shadow-card", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-5 sm:px-6", className)}>
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-5 sm:p-6", className)}>{children}</div>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1.5 px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-2 text-faint [&_svg]:size-7 [&_svg]:stroke-[1.5]">{icon}</div> : null}
      <p className="text-[15px] font-medium">{title}</p>
      {description ? <p className="max-w-xs text-[13px] leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="animate-rise flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-[13px] font-medium text-muted">{eyebrow}</div> : null}
        <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[40px]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-[15px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 break-words">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="tabular font-[family-name:var(--font-display)] text-[28px] font-semibold leading-none tracking-[-0.03em]">{value}</span>
      {hint ? <span className="text-[12px] text-faint">{hint}</span> : null}
    </div>
  );
}
