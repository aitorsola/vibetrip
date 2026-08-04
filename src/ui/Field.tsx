import type { InputHTMLAttributes, ReactNode } from "react";

interface FieldProps {
  label: string;
  children?: ReactNode;
  hint?: string;
  htmlFor?: string;
}

export function Field({ label, children, hint, htmlFor }: FieldProps) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-[13px] font-semibold text-fg"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1.5 text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass = "input";

interface FloatingFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function FloatingField({
  label,
  className = "",
  ...rest
}: FloatingFieldProps) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <input {...rest} className={`input ${className}`} />
    </div>
  );
}
