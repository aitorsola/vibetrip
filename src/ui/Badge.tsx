import type { CSSProperties, ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  color?: string;
  variant?: "soft" | "solid" | "outline";
}

export function Badge({
  children,
  color = "#00AC00",
  variant = "soft",
}: BadgeProps) {
  let style: CSSProperties = {};
  if (variant === "soft") {
    style = { backgroundColor: `${color}1A`, color };
  } else if (variant === "solid") {
    style = { backgroundColor: color, color: "#fff" };
  } else {
    style = { borderColor: color, color };
  }
  return (
    <span
      style={style}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        variant === "outline" ? "border" : ""
      }`}
    >
      {children}
    </span>
  );
}
