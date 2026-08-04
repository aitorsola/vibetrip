import type { NextRequest } from "next/server";
import {
  ChatRequestSchema,
  CHAT_HISTORY_CAP,
  type ChatMessage,
} from "@/domain/chat";
import { streamChat, ChatError } from "@/server/chat";
import { byokToConfig, defaultLlmConfig } from "@/server/llm/config";
import { llmErrorCode } from "@/server/llm";
import { buildTripsContext } from "@/server/chatContext";
import { localeLanguageName } from "@/server/agents/shared";
import { createSupabaseAuthedClient } from "@/lib/supabase/server";

/**
 * Multilingual triggers for "build me an itinerary"-style requests. Llama 3.3
 * (production model) refuses to honor the system prompt's no-itinerary rule
 * even with explicit examples — it just produces plans anyway. So we
 * short-circuit those requests server-side: skip the LLM call entirely and
 * return a deterministic redirect to the planner.
 *
 * Patterns are intentionally narrow: they catch explicit verbs ("plan me",
 * "armame", "hazme un itinerario") and the noun "itinerario/itinerary/itinéraire".
 * General questions ("what should I see in Lisbon?", "is Mexico safe in May?")
 * don't trigger and reach the LLM normally.
 */
const ITINERARY_TRIGGERS: RegExp[] = [
  // Noun forms across our locales
  /\bitinerar(io|ios|y|ies|aire|aires|i)\b/i,
  // "plan me / plan a trip / plan my trip"
  /\bplan\s+(me|us|my|a)\s+(trip|itinerary|schedule|days|week)\b/i,
  // Spanish/Portuguese: planifica(me|nos), planifíca, planéame
  /\bplanif(i|í)ca(me|nos|le|s)?\b/i,
  /\bplane(a|á)(me|nos|s)?\b/i,
  // French: planifie(-moi/nous)
  /\bplanifie(z|s|r)?(\s|-)?(moi|nous)?\b/i,
  // "armame/armar/armanos un X" (Spanish)
  /\barma(me|r|nos|s)?\s+(un|una|el|la|mi)\s+(itinerar|plan|viaje|ruta|recorrido)/i,
  // "hazme/haznos un itinerario|plan|viaje|ruta"
  /\bha(z|gas|gan)(me|nos)?\s+(un|una|el|la)\s+(itinerar|plan|viaje|ruta)/i,
  // "build me an itinerary/plan/schedule/trip"
  /\bbuild\s+(me\s+)?(an?\s+)?(itinerar|plan|schedule|trip)/i,
  // "create/crear un itinerario|plan|viaje"
  /\b(create|crea(r|me)?)\s+(an?|un|una|el|la)\s+(itinerar|plan|viaje|trip)/i,
  // "organiza(me) un viaje|plan|itinerar"
  /\borganiza(me|r|nos)?\s+(un|una|el|la|mi)\s+(viaje|plan|itinerar)/i,
  // Day-by-day phrasings
  /\bday[\s-]?by[\s-]?day\b/i,
  /\bd[ií]a\s+a\s+d[ií]a\b/i,
  /\bjour\s+par\s+jour\b/i,
];

function isItineraryRequest(text: string): boolean {
  return ITINERARY_TRIGGERS.some((re) => re.test(text));
}

const REDIRECT_MESSAGES: Record<string, string> = {
  es: "Para crear un itinerario nuevo te recomiendo usar el planificador: pulsa **Nuevo viaje** en la home, mete destinos y fechas, y te genera un plan con lugares reales (verificados en OpenStreetMap), mapa, alojamiento y presupuesto. Yo aquí puedo darte ideas, recomendaciones o resolver dudas, pero el itinerario completo lo monta el planificador mucho mejor.",
  en: "For a new itinerary please use the planner: tap **New trip** on the home page, enter destinations and dates, and it'll generate a plan with real places (verified on OpenStreetMap), map, accommodation and budget. I can help you here with ideas, recommendations or questions, but full itineraries are the planner's job.",
  fr: "Pour un nouvel itinéraire, utilise plutôt le planificateur : touche **Nouveau voyage** sur la page d'accueil, indique destinations et dates, et il génère un plan avec lieux réels (vérifiés sur OpenStreetMap), carte, hébergement et budget. Ici je peux te donner des idées ou répondre à des questions, mais les itinéraires complets sont la spécialité du planificateur.",
  de: "Für einen neuen Reiseplan nutze bitte den Planer: Tippe auf **Neue Reise** auf der Startseite, gib Ziele und Daten ein, und er erstellt einen Plan mit echten Orten (über OpenStreetMap verifiziert), Karte, Unterkunft und Budget. Hier kann ich Ideen geben oder Fragen beantworten, aber komplette Reisepläne sind die Aufgabe des Planers.",
  it: "Per creare un nuovo itinerario usa il pianificatore: tocca **Nuovo viaggio** nella home, inserisci destinazioni e date, e ti genera un piano con luoghi reali (verificati su OpenStreetMap), mappa, alloggio e budget. Qui posso darti idee o rispondere a domande, ma gli itinerari completi sono il lavoro del pianificatore.",
  pt: "Para criar um novo itinerário, usa o planificador: toca em **Nova viagem** na página inicial, indica destinos e datas, e ele gera um plano com locais reais (verificados no OpenStreetMap), mapa, alojamento e orçamento. Aqui posso ajudar com ideias ou tirar dúvidas, mas os itinerários completos são trabalho do planificador.",
};

function redirectMessage(locale: string): string {
  return REDIRECT_MESSAGES[locale] ?? REDIRECT_MESSAGES.es!;
}
import { routing } from "@/i18n/routing";
import {
  encodeSseComment,
  encodeSseEvent,
  encodeSsePadding,
  SSE_HEADERS,
} from "@/lib/sse";

/** Read the active app locale from the Referer of the page that fired the
 *  POST. Same logic as /api/trip/plan; falls back to the default locale. */
function detectLocale(req: NextRequest): string {
  const referer = req.headers.get("referer") ?? "";
  const supported = routing.locales as readonly string[];
  for (const loc of supported) {
    if (referer.includes(`/${loc}/`) || referer.endsWith(`/${loc}`)) {
      return loc;
    }
  }
  return routing.defaultLocale;
}

/** System prompt that pins the assistant to travel/tourism scope. The
 *  language line goes first so the model honors it even when the rest of
 *  the prompt is written in English. */
function buildSystemPrompt(locale: string): string {
  const lang = localeLanguageName(locale);
  return `You are vibetrip's travel assistant. Reply in ${lang}.

═══════════════════════════════════════════════════════════════
ABSOLUTE RULE #1 — READ TWICE. THIS IS THE MOST IMPORTANT RULE.
═══════════════════════════════════════════════════════════════

You MUST NOT generate itineraries. NEVER. VibeTrip has a dedicated multi-agent
planner that uses real OpenStreetMap places, validates every activity exists,
clusters by neighborhood and returns a map + accommodation + budget. You CANNOT
match its quality, so do not even try.

WHEN THIS RULE FIRES (any of these, in any language):
  • "plan a trip", "planificar un viaje", "planifie-moi"…
  • "make me an itinerary", "hazme un itinerario", "armame un plan"
  • "what should I do each day", "qué hacer cada día", "qué visitar en N días"
  • "give me a 5-day plan", "dame X días en…", "una ruta por…"
  • "build me a schedule", "armar la ruta", "organízame X días"
  • Any request that implies producing a day-by-day plan from scratch.

WHAT YOU MUST NOT OUTPUT:
  • Headings like "Day 1", "Día 1", "Jour 1", "Tag 1" with activities under them.
  • Time-stamped activities (e.g. "10:00 visit X", "13:00 lunch at Y").
  • Specific hotel/restaurant names presented as a "recommendation for day N".
  • Multi-day schedules of any form, even bullet-point ones.

WHAT YOU MUST OUTPUT INSTEAD (2-3 short sentences total):
  1. Say the planner produces a much better result with real places and a map.
  2. Tell them to use the home form ("Nuevo viaje" / "New trip" button —
     adapt the wording to ${lang}).
  3. (Optional) ONE thematic idea as a teaser — e.g. "Mexico for a month gives
     you room to combine the Yucatán with CDMX and Oaxaca". NOT a list of
     places, NOT a schedule, NOT day-by-day.

EXAMPLE OF A GOOD RESPONSE
  User: "Plan me an itinerary through Mexico for a month."
  You: "Mejor no te lo armo aquí — el planificador de VibeTrip usa lugares
  reales de OpenStreetMap, valida cada parada y te genera mapa + alojamiento
  + presupuesto. Pulsa 'Nuevo viaje' en la home y mete México con tus fechas.
  Pista de escala: un mes da para combinar Yucatán, CDMX y Oaxaca sin agobios."

EXAMPLE OF A BAD RESPONSE (NEVER DO THIS)
  User: "Plan me an itinerary through Mexico for a month."
  You: "Day 1: arrive in CDMX, visit Zócalo. Day 2: Teotihuacán. Day 3:..."
  ← This is forbidden. The planner exists for exactly this.

EXCEPTION TO RULE #1
  If the user's question is ABOUT a trip they have ALREADY planned (it appears
  below in the USER CONTEXT block as "FOCUSED TRIP" or in the trips summary),
  answer freely using that data. That is THEIR saved plan, not new generation.

═══════════════════════════════════════════════════════════════

Beyond rule #1, your purpose is travel, tourism and trip-planning chat:
- Recommendations for destinations, neighborhoods, attractions, restaurants, accommodations (general advice — not built into a schedule).
- Practical advice: visas, currency, transport, safety, packing, best time to visit.
- Cultural and culinary insights for specific places.
- High-level trip ideas: themes, durations, regions to consider, budget ballpark.
- Discussing trips the user has ALREADY planned (USER CONTEXT below).

You MUST refuse, briefly and politely, ANY question outside the travel scope (math, coding, generic chitchat, news unrelated to travel, philosophy, personal advice, technical help, anything not travel-related). Refuse without partial answer; suggest asking something travel-related.

Borderline cases that ARE in scope: visa requirements, currency exchange, weather forecasts for a trip, cultural etiquette, language tips for travelers, jet lag, travel insurance, sustainable travel.

Style: respond in ${lang}, concise (2-5 sentences typically). For lists, max 5 items. Light Markdown when it helps.`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Auth: the cookie- or bearer-bound client. RLS on chat_sessions/messages
  // enforces ownership; we still surface 401 explicitly so anonymous callers
  // get a clean signal instead of a confusing RLS-denied insert error.
  const supabase = await createSupabaseAuthedClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const {
    sessionId: incomingSessionId,
    tripId: incomingTripId,
    content,
  } = parsed.data;
  // BYOK: the user's own key/model, or the server default when absent.
  const llm = parsed.data.llm ? byokToConfig(parsed.data.llm) : defaultLlmConfig();
  const locale = detectLocale(req);
  const reqId = Math.random().toString(36).slice(2, 8);

  // ── Session resolve / create ─────────────────────────────────────────────
  let sessionId: string;
  let focusedTripId: string | null = null;
  let history: ChatMessage[];

  if (incomingSessionId) {
    const { data: existing, error: selErr } = await supabase
      .from("chat_sessions")
      .select("id, trip_id")
      .eq("id", incomingSessionId)
      .maybeSingle();
    if (selErr) {
      console.error(`[chat ${reqId}] session lookup failed:`, selErr.message);
      return Response.json({ error: "session lookup failed" }, { status: 500 });
    }
    if (!existing) {
      return Response.json({ error: "session not found" }, { status: 404 });
    }
    sessionId = existing.id;
    // Existing session: the saved trip_id is authoritative. Body tripId is
    // ignored — sessions don't change focus mid-conversation.
    focusedTripId = existing.trip_id ?? null;

    const { data: msgs, error: msgErr } = await supabase
      .from("chat_messages")
      .select("role,content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (msgErr) {
      console.error(`[chat ${reqId}] history load failed:`, msgErr.message);
      return Response.json({ error: "history load failed" }, { status: 500 });
    }
    // Narrow the role: the DB CHECK constraint guarantees 'user'|'assistant'
    // but the supabase-js typing is just `string`. One pass.
    history = (msgs ?? []).map(
      (m): ChatMessage => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }),
    );
  } else {
    // New session. If tripId came in the body, validate the user owns that
    // trip (RLS makes this a no-op for non-owners). Invalid → just drop the
    // focus rather than failing the whole chat.
    if (incomingTripId) {
      const { data: tripRow } = await supabase
        .from("trips")
        .select("id")
        .eq("id", incomingTripId)
        .maybeSingle();
      if (tripRow) focusedTripId = tripRow.id;
    }

    const title = content.slice(0, 80);
    const { data: created, error: insErr } = await supabase
      .from("chat_sessions")
      .insert({ title, trip_id: focusedTripId })
      .select("id")
      .single();
    if (insErr || !created) {
      console.error(
        `[chat ${reqId}] session create failed:`,
        insErr?.message,
      );
      return Response.json(
        { error: "session create failed" },
        { status: 500 },
      );
    }
    sessionId = created.id;
    history = [];
  }

  // Build the user-context block (trips summary + optional focused detail)
  // and graft it onto the static system prompt for this turn only.
  const userContext = await buildTripsContext(supabase, focusedTripId);
  const systemPrompt = userContext
    ? `${buildSystemPrompt(locale)}\n\n${userContext}`
    : buildSystemPrompt(locale);

  // Persist the user turn before kicking off the LLM. If the stream fails
  // mid-flight we still keep a record of what the user asked.
  {
    const { error } = await supabase
      .from("chat_messages")
      .insert({ session_id: sessionId, role: "user", content });
    if (error) {
      console.error(`[chat ${reqId}] user msg insert failed:`, error.message);
      return Response.json(
        { error: "could not persist message" },
        { status: 500 },
      );
    }
  }

  // Build LLM context: load + new turn, capped at the most recent N to keep
  // tokens bounded. Older messages stay in DB; only the prompt is trimmed.
  const fullHistory: ChatMessage[] = [
    ...history,
    { role: "user" as const, content },
  ].slice(-CHAT_HISTORY_CAP);

  console.log(
    `[chat ${reqId}] start session=${sessionId}${focusedTripId ? ` trip=${focusedTripId}` : ""} locale=${locale} msgs=${fullHistory.length} q="${content.slice(0, 80)}"`,
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const enqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      const abort = new AbortController();
      const onClose = () => abort.abort();
      req.signal.addEventListener("abort", onClose);

      // 2KB padding to defeat iOS Safari's stream-buffer; comment line keeps
      // the connection technically "active" against intermediate proxies.
      enqueue(encodeSsePadding(2048));
      enqueue(encodeSseComment("stream-open"));
      // Send session id up front so the client can capture it on a brand-new
      // conversation (or confirm it on subsequent turns).
      enqueue(encodeSseEvent({ type: "session", sessionId }));
      const heartbeat = setInterval(
        () => enqueue(encodeSseComment("heartbeat")),
        10_000,
      );

      const startedAt = Date.now();
      let assistantText = "";
      let streamFailed = false;

      // Pre-LLM short-circuit: if the user is clearly asking for a brand-new
      // itinerary (and isn't focused on an existing trip), skip the model and
      // return the deterministic redirect. The model is too eager to ignore
      // the system prompt's no-itinerary rule, so this is the safe path.
      const wantsNewItinerary =
        !focusedTripId && isItineraryRequest(content);

      try {
        if (wantsNewItinerary) {
          assistantText = redirectMessage(locale);
          console.log(`[chat ${reqId}] short-circuit: itinerary request → planner redirect`);
          enqueue(encodeSseEvent({ type: "delta", text: assistantText }));
        } else {
          for await (const text of streamChat({
            llm,
            system: systemPrompt,
            messages: fullHistory,
            signal: abort.signal,
          })) {
            assistantText += text;
            enqueue(encodeSseEvent({ type: "delta", text }));
          }
        }
      } catch (err) {
        streamFailed = true;
        const aborted =
          abort.signal.aborted ||
          (err instanceof ChatError && err.message === "aborted");
        if (!aborted) {
          console.error(`[chat ${reqId}] failed:`, err);
          const message =
            llmErrorCode(err) ??
            (err instanceof Error ? err.message : "unknown error");
          enqueue(encodeSseEvent({ type: "error", message }));
        }
      }

      // Persist the assistant turn AFTER the stream completes (full text in a
      // single insert). If the stream errored or aborted with no content,
      // skip — the user's turn stays as an unanswered prompt; they can retry.
      if (!streamFailed && assistantText.length > 0) {
        try {
          await supabase.from("chat_messages").insert({
            session_id: sessionId,
            role: "assistant",
            content: assistantText,
          });
          await supabase
            .from("chat_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", sessionId);
        } catch (e) {
          console.error(`[chat ${reqId}] assistant msg persist failed:`, e);
        }
      }

      if (!streamFailed) {
        enqueue(encodeSseEvent({ type: "done" }));
      }

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
        `[chat ${reqId}] done after ${Math.round(
          (Date.now() - startedAt) / 1000,
        )}s session=${sessionId}`,
      );
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
