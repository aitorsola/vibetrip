"use client";

import type { ReactNode } from "react";
import type { AgentStatus } from "@/domain/plan";

interface AgentCardProps {
  index: number;
  emoji: string;
  title: string;
  description: string;
  status: AgentStatus;
  accent: string;
  preview?: ReactNode;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  pending: "En espera",
  running: "Pensando…",
  done: "Resuelto",
  error: "Error",
};

export function AgentCard({
  index,
  emoji,
  title,
  description,
  status,
  accent,
  preview,
}: AgentCardProps) {
  const isRunning = status === "running";
  const isDone = status === "done";
  const isError = status === "error";
  const isPending = status === "pending";

  return (
    <article
      className={`group relative overflow-hidden rounded-3xl border bg-surface p-6 sm:p-7 transition-all duration-500 ease-smooth ${
        isPending
          ? "border-border opacity-50 shadow-soft"
          : isRunning
            ? "border-rausch/40 shadow-lift"
            : isError
              ? "border-rausch/40 shadow-soft"
              : "border-border shadow-card"
      }`}
      style={{
        transform: isPending ? "scale(0.985)" : "scale(1)",
      }}
    >
      {/* Top accent bar when running */}
      {isRunning ? (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 overflow-hidden"
        >
          <div
            className="h-full w-1/3 animate-[shimmer_1.4s_linear_infinite]"
            style={{
              background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
            }}
          />
        </div>
      ) : null}

      <header className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[22px] transition-all duration-300"
          style={{
            backgroundColor: isDone
              ? accent
              : isError
                ? "#DC262620"
                : isRunning
                  ? `${accent}1A`
                  : "rgb(var(--surface-hover))",
            color: isDone ? "white" : isError ? "#DC2626" : accent,
          }}
        >
          {isDone ? <CheckIcon /> : isError ? "!" : emoji}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[11px] font-semibold text-subtle">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-[18px] font-bold leading-tight text-fg">
                {title}
              </h3>
            </div>
            <span
              className={`shrink-0 text-[11px] font-semibold uppercase tracking-wider ${
                isError
                  ? "text-rausch"
                  : isDone
                    ? "text-success"
                    : isRunning
                      ? "text-fg"
                      : "text-subtle"
              }`}
            >
              {STATUS_LABEL[status]}
              {isRunning ? <span className="ml-1 inline-flex"><Dots /></span> : null}
            </span>
          </div>
          <p className="mt-1 text-[14px] text-muted">
            {isError ? "Algo falló al ejecutar el agente." : description}
          </p>
        </div>
      </header>

      {preview ? (
        <div
          className={`mt-5 transition-all duration-500 ease-smooth ${
            isDone || isRunning
              ? "max-h-[400px] opacity-100"
              : "max-h-0 overflow-hidden opacity-0"
          }`}
        >
          <div className="rounded-2xl bg-surface-hover p-4 text-[13px] leading-relaxed text-muted">
            {preview}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function CheckIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-0.5">
      <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-1 w-1 animate-bounce rounded-full bg-current" />
    </span>
  );
}
