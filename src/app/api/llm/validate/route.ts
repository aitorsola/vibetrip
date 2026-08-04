import { ByokSchema } from "@/domain/llm";
import { byokToConfig } from "@/server/llm/config";
import { validateLlmConfig } from "@/server/llm/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Probe a BYOK key/model with a tiny test call. Public (no app auth): the user
 * is testing their own key, nothing is persisted server-side. The key never
 * leaves this request — not logged, not stored.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const parsed = ByokSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, reason: "invalid_config" }, { status: 422 });
  }

  const result = await validateLlmConfig(byokToConfig(parsed.data));
  return Response.json(result);
}
