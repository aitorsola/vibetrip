import { env } from "@/server/env";
import { isLocalEndpoint } from "@/server/llm";

export const dynamic = "force-dynamic";

function detectKind(): "anthropic" | "local" | "groq" | "cloud" {
  if (env.provider === "anthropic") return "anthropic";
  if (isLocalEndpoint(env.openaiBaseUrl)) return "local";
  if (env.openaiBaseUrl.toLowerCase().includes("groq.com")) return "groq";
  return "cloud";
}

export async function GET() {
  return Response.json({
    provider: env.provider,
    kind: detectKind(),
    model:
      env.provider === "anthropic" ? env.anthropicModel : env.openaiModel,
  });
}
