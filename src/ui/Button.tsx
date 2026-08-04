import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-rausch text-white hover:bg-rausch-dark active:scale-[0.98] disabled:bg-rausch/40 disabled:hover:bg-rausch/40",
  secondary:
    "bg-surface border border-border-strong text-fg hover:border-fg active:scale-[0.98] disabled:opacity-40",
  ghost:
    "bg-transparent text-fg hover:bg-surface-hover active:scale-[0.98] disabled:opacity-40",
  danger:
    "bg-transparent text-rausch hover:bg-rausch/10 active:scale-[0.98]",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-[13px] rounded-lg",
  md: "h-12 px-6 text-[15px] rounded-xl",
  lg: "h-14 px-8 text-[16px] rounded-2xl",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 ease-smooth disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </button>
  );
}
