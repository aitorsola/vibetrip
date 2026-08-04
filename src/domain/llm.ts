import { z } from "zod";

/**
 * BYOK (bring-your-own-key) choice sent by the client in the request body of
 * `/api/trip/plan` and `/api/chat`. Optional everywhere: when absent, the
 * server falls back to its own configured model (`defaultLlmConfig`). Shared
 * wire contract — the iOS client may send the same shape.
 *
 * `provider` is the user-facing vendor, not the server's internal provider:
 * "openai" maps to the openai-compatible loop pointed at api.openai.com.
 */
export const ByokSchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  model: z.string().min(1).max(120),
  apiKey: z.string().min(1).max(500),
});
export type ByokConfig = z.infer<typeof ByokSchema>;
