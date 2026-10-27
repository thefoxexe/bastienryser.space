import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "brand";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium tracking-[-0.01em] transition-[background,color,opacity,transform] duration-200 ease-[var(--ease-apple)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[15px] [&_svg]:shrink-0";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-ink-text hover:opacity-85",
  brand: "bg-ink text-ink-text hover:opacity-85",
  secondary: "bg-[color-mix(in_oklab,var(--text)_7%,transparent)] text-text hover:bg-[color-mix(in_oklab,var(--text)_11%,transparent)]",
  ghost: "text-muted hover:bg-[color-mix(in_oklab,var(--text)_6%,transparent)] hover:text-text",
  danger: "bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger hover:bg-[color-mix(in_oklab,var(--danger)_15%,transparent)]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-9 px-4 text-[14px]",
  lg: "h-11 px-6 text-[15px]",
  icon: "size-8 rounded-full",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
