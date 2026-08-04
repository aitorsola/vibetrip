import type { ReactNode } from "react";

interface SectionHeaderProps {
  step?: number;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function SectionHeader({
  step,
  title,
  subtitle,
  action,
}: SectionHeaderProps) {
  return (
    <header className="mb-6 flex items-end justify-between gap-6">
      <div>
        <h2 className="text-[26px] font-bold tracking-tight text-fg">
          {step ? (
            <span className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-rausch/10 text-[14px] font-bold text-rausch align-middle">
              {step}
            </span>
          ) : null}
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-[15px] text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
