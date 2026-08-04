import "server-only";

/** Single source of truth — used by `runAgentLoop` (to enable LM Studio-only
 *  vendor flags) and by the /api/trip/config endpoint (to label the UI). */
export function isLocalEndpoint(baseUrl: string): boolean {
  const url = baseUrl.toLowerCase();
  return (
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("0.0.0.0")
  );
}

/**
 * How long until the limit that produced this error clears, in seconds, or
 * null when the provider didn't say. Two sources: the standard `retry-after`
 * header, and the wait Groq spells out in the body ("try again in 1h26m24s").
 */
export function llmRetryAfterSeconds(err: unknown): number | null {
  const e = (err ?? {}) as {
    headers?: unknown;
    message?: string;
    body?: unknown;
    error?: unknown;
  };

  const headers = e.headers;
  let raw: string | null = null;
  if (headers instanceof Headers) {
    raw = headers.get("retry-after");
  } else if (headers && typeof headers === "object") {
    const rec = headers as Record<string, unknown>;
    const v = rec["retry-after"] ?? rec["Retry-After"];
    if (typeof v === "string" || typeof v === "number") raw = String(v);
  }
  if (raw !== null) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.ceil(parsed);
  }

  const blob = `${e.message ?? ""} ${JSON.stringify(e.error ?? e.body ?? "")}`;
  const m = blob.match(/try again in ([\d.hms]+)/i);
  if (!m?.[1]) return null;
  const spec = m[1];
  const part = (unit: string) => {
    const hit = spec.match(new RegExp(`([\\d.]+)${unit}`));
    return hit?.[1] ? parseFloat(hit[1]) : 0;
  };
  // A bare number with no unit is seconds ("try again in 20").
  const total = /[hms]/.test(spec)
    ? part("h") * 3600 + part("m") * 60 + part("s")
    : parseFloat(spec);
  return Number.isFinite(total) && total > 0 ? Math.ceil(total) : null;
}

/**
 * Map a provider SDK error to a stable, key-free error code the client maps to
 * a localized message. Returns null for anything we don't special-case, so
 * callers keep the original error. Codes:
 *  - "byok_invalid_key"    401/403 — bad/expired key or no access to the model
 *  - "model_unavailable"   404 — the model id doesn't exist for this provider
 *  - "model_quota"         429 with an insufficient-quota / billing signal
 *  - "model_rate_limited"  429, or a 413 that names a per-minute token budget
 *
 * The two limit codes carry the wait as a ":<seconds>" suffix when the
 * provider reported one, so the UI can say when the model frees up instead of
 * just "try again". Clients match with `includes()`, so the suffix is safe.
 */
export function llmErrorCode(err: unknown): string | null {
  const e = (err ?? {}) as {
    status?: number;
    message?: string;
    body?: unknown;
    error?: unknown;
  };
  const status = e.status;
  const blob = `${e.message ?? ""} ${JSON.stringify(e.error ?? e.body ?? "")}`;
  const withWait = (code: string) => {
    const secs = llmRetryAfterSeconds(err);
    return secs === null ? code : `${code}:${secs}`;
  };

  if (status === 401 || status === 403) return "byok_invalid_key";

  // Providers retire models on their own schedule (Groq shut down
  // llama-4-scout mid-2026). Without this the app reports a generic failure
  // and the dead model id stays buried in the server logs.
  if (status === 404 && /model|does not exist|not found/i.test(blob)) {
    return "model_unavailable";
  }

  // A request whose prompt + max_tokens exceeds the per-minute token budget
  // comes back as 413, not 429 — it's still the rate limit talking.
  if (status === 413 && /tokens per minute|TPM|rate limit|too large/i.test(blob)) {
    return withWait("model_rate_limited");
  }

  if (status === 429) {
    // Order matters. Groq appends "Upgrade to Dev Tier today at
    // …/settings/billing" to EVERY rate-limit body, so matching on "billing"
    // alone turns a 20-second per-minute limit into "you are out of quota".
    // Per-minute limits are transient; per-day ones are not.
    if (/tokens per minute|TPM|requests per minute|RPM/i.test(blob)) {
      return withWait("model_rate_limited");
    }
    if (
      /insufficient_quota|exceeded your current quota|tokens per day|TPD|requests per day|RPD/i.test(
        blob,
      )
    ) {
      return withWait("model_quota");
    }
    return withWait("model_rate_limited");
  }
  return null;
}
