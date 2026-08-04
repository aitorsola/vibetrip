import { setMaxListeners } from "events";
import type { NextRequest } from "next/server";
import { PlanRequestSchema, totalDays, MAX_DEFAULT_MODEL_DAYS } from "@/domain/trip";
import { orchestratePlan } from "@/server/orchestrator";
import { byokToConfig, defaultLlmConfig } from "@/server/llm/config";
import { createSupabaseAuthedClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";
import {
  encodeSseComment,
  encodeSseEvent,
  encodeSsePadding,
  SSE_HEADERS,
} from "@/lib/sse";

/** Pull the active app locale from the Referer (the page that fired the
 *  POST). Falls back to the default locale. */
function detectLocale(req: NextRequest): string {
  const referer = req.headers.get("referer") ?? "";
  const supported = routing.locales as readonly string[];
  for (const loc of supported) {
    if (
      referer.includes(`/${loc}/`) ||
      referer.endsWith(`/${loc}`)
    ) {
      return loc;
    }
  }
  return routing.defaultLocale;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUEST_USED_COOKIE = "vt_guest_used";
const GUEST_COOKIE_HEADER = `${GUEST_USED_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;

// Shown when a trip longer than the cap is attempted on the default model.
// Per-locale (mirrors REDIRECT_MESSAGES in the chat route).
const DAY_LIMIT_MESSAGES: Record<string, string> = {
  es: `Con el modelo por defecto puedes planificar hasta ${MAX_DEFAULT_MODEL_DAYS} días. Para viajes más largos, añade tu propia API key de OpenAI o Anthropic en el selector de modelo.`,
  en: `The default model plans trips of up to ${MAX_DEFAULT_MODEL_DAYS} days. For longer trips, add your own OpenAI or Anthropic API key from the model selector.`,
  fr: `Le modèle par défaut planifie des voyages de ${MAX_DEFAULT_MODEL_DAYS} jours maximum. Pour des voyages plus longs, ajoute ta propre clé API OpenAI ou Anthropic depuis le sélecteur de modèle.`,
  de: `Das Standardmodell plant Reisen von bis zu ${MAX_DEFAULT_MODEL_DAYS} Tagen. Für längere Reisen füge deinen eigenen OpenAI- oder Anthropic-API-Schlüssel über die Modellauswahl hinzu.`,
  it: `Il modello predefinito pianifica viaggi fino a ${MAX_DEFAULT_MODEL_DAYS} giorni. Per viaggi più lunghi, aggiungi la tua API key di OpenAI o Anthropic dal selettore del modello.`,
  pt: `O modelo padrão planeia viagens até ${MAX_DEFAULT_MODEL_DAYS} dias. Para viagens mais longas, adiciona a tua chave API da OpenAI ou Anthropic no seletor de modelo.`,
};

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseAuthedClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { destinations, members } = parsed.data;
  // BYOK: the user's own key/model, or the server default when absent.
  const llm = parsed.data.llm ? byokToConfig(parsed.data.llm) : defaultLlmConfig();
  const usingByok = Boolean(parsed.data.llm);

  // Guest gating: one trip per browser, then must register — UNLESS the guest
  // brought their own key (they pay for their own LLM, so there's no quota to
  // protect). BYOK guests neither hit the limit nor get the cookie set.
  const isGuest = !user;
  const guestAlreadyUsed =
    isGuest && !usingByok && req.cookies.get(GUEST_USED_COOKIE)?.value === "1";
  if (guestAlreadyUsed) {
    return Response.json(
      {
        error: "guest_limit_reached",
        message:
          "Has agotado tu prueba gratuita. Regístrate para planificar más viajes y guardarlos.",
      },
      { status: 402 },
    );
  }

  const locale = detectLocale(req);

  // Length cap: the free default model is limited to short trips. Longer ones
  // require the user's own key (BYOK). Enforced here so it can't be bypassed
  // by older clients or direct API calls.
  if (!usingByok && totalDays(destinations) > MAX_DEFAULT_MODEL_DAYS) {
    return Response.json(
      {
        error: "default_model_trip_too_long",
        message: DAY_LIMIT_MESSAGES[locale] ?? DAY_LIMIT_MESSAGES.es,
        maxDays: MAX_DEFAULT_MODEL_DAYS,
      },
      { status: 403 },
    );
  }

  const reqId = Math.random().toString(36).slice(2, 8);
  const destNames = destinations.map((d) => d.destination).join(", ");
  console.log(
    `[plan ${reqId}] ${user ? `user=${user.email}` : "guest"} locale=${locale} start dests=[${destNames}] members=${members.length}`,
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const enqueueSafe = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      const abort = new AbortController();
      // The orchestrator, every agent's LLM call, and each Nominatim fetch
      // hook a listener onto this same signal. The Node default of 10 trips
      // a MaxListenersExceededWarning during long agentic runs.
      setMaxListeners(50, abort.signal);
      const onClose = () => {
        console.log(`[plan ${reqId}] client closed connection`);
        abort.abort();
      };
      req.signal.addEventListener("abort", onClose);

      // Push enough bytes up front to defeat iOS Safari's internal buffer
      // (typically ~2 KB). Without this, the client may not receive any
      // events for ~30s+, even though the server is sending them.
      enqueueSafe(encodeSsePadding(2048));
      enqueueSafe(encodeSseComment("stream-open"));

      // Heartbeat every 10s. Keeps native iOS clients (URLSession with an
      // inactivity timeout) from giving up while the agent is internally
      // retrying after a rate-limit backoff (Groq 429s can stall the stream
      // for 30-60s).
      const heartbeat = setInterval(() => {
        enqueueSafe(encodeSseComment("heartbeat"));
      }, 10_000);

      const startedAt = Date.now();

      try {
        for await (const event of orchestratePlan({
          destinations,
          members,
          signal: abort.signal,
          llm,
          locale,
        })) {
          // Persist the trip just before emitting "done", but only for
          // logged-in users. Guests get the result on screen but nothing is
          // saved server-side.
          if (event.type === "done" && user) {
            try {
              const { error } = await supabase.from("trips").insert({
                user_id: user.id,
                destinations,
                members,
                result: event.result,
              });
              if (error) {
                console.error(`[plan ${reqId}] trip insert failed:`, error.message);
              } else {
                console.log(`[plan ${reqId}] trip saved`);
              }
            } catch (e) {
              console.error(`[plan ${reqId}] trip insert threw:`, e);
            }
          }
          enqueueSafe(encodeSseEvent(event));
        }
      } catch (err) {
        console.error(`[plan ${reqId}] orchestrator failed:`, err);
        const message = err instanceof Error ? err.message : "unknown error";
        enqueueSafe(encodeSseEvent({ type: "error", message }));
      } finally {
        clearInterval(heartbeat);
        req.signal.removeEventListener("abort", onClose);
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed by client abort */
          }
        }
        console.log(
          `[plan ${reqId}] done after ${Math.round(
            (Date.now() - startedAt) / 1000,
          )}s`,
        );
      }
    },
  });

  const headers = new Headers(SSE_HEADERS);
  // Only burn the guest's free trip when they used OUR model. BYOK guests pay
  // their own way, so they keep their free trip.
  if (isGuest && !usingByok) {
    headers.append("Set-Cookie", GUEST_COOKIE_HEADER);
  }

  return new Response(stream, { headers });
}
