import "server-only";
import { env } from "../env";
import type { ByokConfig } from "@/domain/llm";

/** Per-request LLM configuration. Threaded from the route handler through the
 *  orchestrator/agents down to the SDK call, replacing direct reads of the
 *  global `env` singleton. */
export interface LlmConfig {
  provider: "anthropic" | "openai-compatible";
  model: string;
  apiKey: string;
  /** Only for openai-compatible. */
  baseUrl?: string;
}

/** The server's own configured model — used when the request carries no BYOK
 *  override. Mirrors what `env` exposed before BYOK existed. */
export function defaultLlmConfig(): LlmConfig {
  return env.provider === "anthropic"
    ? { provider: "anthropic", model: env.anthropicModel, apiKey: env.anthropicApiKey }
    : {
        provider: "openai-compatible",
        model: env.openaiModel,
        apiKey: env.openaiApiKey,
        baseUrl: env.openaiBaseUrl,
      };
}

/** Map the client's BYOK choice to a server-side LlmConfig. "openai" is just
 *  the openai-compatible loop pointed at OpenAI's public endpoint. */
export function byokToConfig(byok: ByokConfig): LlmConfig {
  if (byok.provider === "anthropic") {
    return { provider: "anthropic", model: byok.model, apiKey: byok.apiKey };
  }
  return {
    provider: "openai-compatible",
    model: byok.model,
    apiKey: byok.apiKey,
    baseUrl: "https://api.openai.com/v1",
  };
}
