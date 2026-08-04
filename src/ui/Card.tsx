import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  variant?: "elevated" | "flat" | "outlined";
  padding?: "sm" | "md" | "lg";
}

const VARIANTS = {
  elevated: "bg-surface shadow-card",
  flat: "bg-surface",
  outlined: "bg-surface border border-border",
};

// Responsive: tight padding on mobile so nested cards don't squeeze inputs
// into the inner padding stack.
const PADDINGS = {
  sm: "p-4 sm:p-5",
  md: "p-5 sm:p-7",
  lg: "p-5 sm:p-9",
};

export function Card({
  children,
  className = "",
  variant = "elevated",
  padding = "md",
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={`rounded-2xl ${VARIANTS[variant]} ${PADDINGS[padding]} ${className}`}
    >
      {children}
    </div>
  );
}
