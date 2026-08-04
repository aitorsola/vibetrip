import "server-only";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmConfig } from "./config";
import { llmErrorCode } from "./index";

/**
 * Cheap liveness probe for a BYOK config: one 1-token completion. Returns
 * `{ ok: true }` if the key/model answer, otherwise a short reason. Never
 * echoes the key. Used by the navbar dropdown before saving so the user gets
 * immediate feedback instead of a failure mid trip-generation.
 */
export async function validateLlmConfig(
  llm: LlmConfig,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    if (llm.provider === "anthropic") {
      const client = new Anthropic({ apiKey: llm.apiKey });
      await client.messages.create({
        model: llm.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      });
    } else {
      const client = new OpenAI({ apiKey: llm.apiKey, baseURL: llm.baseUrl });
      await client.chat.completions.create({
        model: llm.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      });
    }
    return { ok: true };
  } catch (err) {
    const auth = llmErrorCode(err);
    if (auth) return { ok: false, reason: auth };
    // 404 / unknown model and the like — surface a generic, key-free reason.
    const status = (err as { status?: number })?.status;
    if (status === 404) return { ok: false, reason: "byok_unknown_model" };
    return { ok: false, reason: "byok_unreachable" };
  }
}
