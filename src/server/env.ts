import "server-only";

export type LlmProvider = "anthropic" | "openai-compatible";

function resolveProvider(): LlmProvider {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === "anthropic") return "anthropic";
  if (explicit === "openai-compatible" || explicit === "lmstudio") {
    return "openai-compatible";
  }
  // No explicit provider — try to infer from credentials present.
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_BASE_URL) return "openai-compatible";
  throw new Error(
    "No LLM provider configured. Set LLM_PROVIDER=anthropic with ANTHROPIC_API_KEY, " +
      "or LLM_PROVIDER=openai-compatible with OPENAI_BASE_URL and OPENAI_API_KEY.",
  );
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.warn(
      `[env] ${name}="${raw}" is not a positive integer; using fallback ${fallback}`,
    );
    return fallback;
  }
  return parsed;
}

const provider = resolveProvider();

export const env = {
  provider,

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",

  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "http://localhost:1234/v1",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "lm-studio",
  openaiModel: process.env.OPENAI_MODEL ?? "local-model",

  bookingAffiliateId: process.env.BOOKING_AFFILIATE_ID ?? "VIBETRIP_DEMO",

  itineraryMaxTokens: intEnv("ITINERARY_MAX_TOKENS", 4500),
  accommodationMaxTokens: intEnv("ACCOMMODATION_MAX_TOKENS", 2000),
};
