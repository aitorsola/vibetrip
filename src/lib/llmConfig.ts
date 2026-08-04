"use client";

import type { ByokConfig } from "@/domain/llm";

/** Where the user's BYOK choice lives. Client-only: the key never touches the
 *  server except as a per-request field. Mirrors ThemeProvider's localStorage
 *  pattern (single key, try/catch around every access). */
const STORAGE_KEY = "vibetrip-llm-config";

function isByokConfig(v: unknown): v is ByokConfig {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (o.provider === "openai" || o.provider === "anthropic") &&
    typeof o.model === "string" &&
    o.model.length > 0 &&
    typeof o.apiKey === "string" &&
    o.apiKey.length > 0
  );
}

export function getStoredLlmConfig(): ByokConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isByokConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setStoredLlmConfig(cfg: ByokConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* storage unavailable (private mode / quota) — non-fatal */
  }
}

export function clearStoredLlmConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
