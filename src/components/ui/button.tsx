"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "xl";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-gradient-to-l from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-600/25 hover:brightness-110 active:brightness-95",
  secondary:
    "glass text-[color:var(--text-primary)] hover:bg-[color:var(--surface-strong)] active:scale-[0.99]",
  ghost: "text-secondary hover:text-[color:var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10",
  danger:
    "bg-gradient-to-l from-rose-600 to-rose-500 text-white shadow-lg shadow-rose-600/25 hover:brightness-110",
  success:
    "bg-gradient-to-l from-mint-600 to-mint-500 text-white shadow-lg shadow-mint-500/25 hover:brightness-110",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3.5 text-xs rounded-xl",
  md: "h-11 px-5 text-sm rounded-2xl",
  lg: "h-13 px-6 text-base rounded-2xl",
  xl: "h-16 px-8 text-lg rounded-3xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className = "", variant = "primary", size = "md", loading = false, disabled, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex select-none items-center justify-center gap-2 font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[color:var(--ring-color)] disabled:pointer-events-none disabled:opacity-55 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
