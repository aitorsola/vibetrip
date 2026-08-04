import type { ReactNode } from "react";

interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  size?: "sm" | "md";
}

const SIZES = {
  sm: "h-9 px-4 text-[13px]",
  md: "h-11 px-5 text-[14px]",
};

export function Chip({
  active = false,
  onClick,
  children,
  size = "md",
}: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition-all duration-150 ease-smooth active:scale-[0.97] ${
        SIZES[size]
      } ${
        active
          ? "border-fg bg-fg text-bg"
          : "border-border-strong bg-surface text-fg hover:border-fg hover:bg-surface-hover"
      }`}
    >
      {children}
    </button>
  );
}
