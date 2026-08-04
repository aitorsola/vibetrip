import "server-only";
import { runAccommodationAgent } from "./agents/accommodation";
import { runBudgetAgent } from "./agents/budget";
import { computeConsensus } from "./agents/consensus";
import { runItineraryAgent } from "./agents/itinerary";
import type { LlmConfig } from "./llm/config";
import type { DestinationResult, PlanEvent } from "@/domain/plan";
import type { DestinationSegment, Member } from "@/domain/trip";

interface OrchestrateInput {
  destinations: DestinationSegment[];
  members: Member[];
  signal?: AbortSignal;
  /** Per-request provider/model/key (BYOK override or server default). */
  llm: LlmConfig;
  /** BCP-47 / app locale (es, en, fr…) — used to localise pure-function
   * outputs (consensus) and to instruct the LLM to respond in that language. */
  locale?: string;
}

export async function* orchestratePlan({
  destinations,
  members,
  signal,
  llm,
  locale = "es",
}: OrchestrateInput): AsyncGenerator<PlanEvent, void, void> {
  yield { type: "agent", agent: "consensus", status: "running" };
  const consensus = computeConsensus(destinations, members, locale);
  yield { type: "data", agent: "consensus", payload: consensus };
  yield { type: "agent", agent: "consensus", status: "done" };

  const destResults: DestinationResult[] = [];

  for (let i = 0; i < destinations.length; i++) {
    const dest = destinations[i]!;

    // Itinerary first, then accommodation. Running them in parallel saved
    // ~30-40% wall time but blew through tight rate limits (Mistral free is
    // 1 req/sec — both agents firing 5+ calls each at once = guaranteed 429).
    // Sequential keeps us under the limits at the cost of total time.
    yield { type: "agent", agent: "itinerary", status: "running", destinationIndex: i };

    // Tool callbacks fire from inside the LLM loop. Pipe them into a small
    // queue so the generator can yield events as they arrive.
    const queue: PlanEvent[] = [];
    let wake: (() => void) | null = null;
    const push = (ev: PlanEvent) => {
      queue.push(ev);
      const w = wake;
      wake = null;
      w?.();
    };

    const makeCallbacks = (agent: "itinerary" | "accommodation") => ({
      onToolCall: (tool: string, input: unknown) =>
        push({
          type: "tool_call",
          agent,
          tool,
          input,
          destinationIndex: i,
        }),
      onToolResult: (tool: string, ok: boolean) =>
        push({
          type: "tool_result",
          agent,
          tool,
          ok,
          destinationIndex: i,
        }),
    });

    async function* runAgent<T>(promise: Promise<T>): AsyncGenerator<PlanEvent, T> {
      let done = false;
      let result: T;
      let error: unknown;
      promise.then(
        (r) => {
          result = r;
          done = true;
          wake?.();
        },
        (e) => {
          error = e;
          done = true;
          wake?.();
        },
      );
      while (true) {
        while (queue.length > 0) yield queue.shift()!;
        if (done) break;
        await new Promise<void>((r) => {
          wake = r;
        });
      }
      if (error) throw error;
      return result!;
    }

    let itinerary;
    let accommodation = null;
    try {
      itinerary = yield* runAgent(
        runItineraryAgent(dest, members, consensus, llm, signal, makeCallbacks("itinerary"), locale),
      );

      yield { type: "data", agent: "itinerary", payload: itinerary, destinationIndex: i };
      yield { type: "agent", agent: "itinerary", status: "done", destinationIndex: i };

      if (dest.includeAccommodation) {
        yield { type: "agent", agent: "accommodation", status: "running", destinationIndex: i };
        accommodation = yield* runAgent(
          runAccommodationAgent(dest, members, consensus, llm, signal, makeCallbacks("accommodation"), locale),
        );
      }
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.message === "aborted")) return;
      const message = err instanceof Error ? err.message : "unknown error";
      yield {
        type: "error",
        message: `Itinerary/Accommodation failed for ${dest.destination}: ${message}`,
        destinationIndex: i,
      };
      return;
    }

    if (accommodation) {
      yield { type: "data", agent: "accommodation", payload: accommodation, destinationIndex: i };
      yield { type: "agent", agent: "accommodation", status: "done", destinationIndex: i };
    }

    const budget = runBudgetAgent(dest, members, itinerary);
    yield { type: "data", agent: "budget", payload: budget, destinationIndex: i };
    yield { type: "agent", agent: "budget", status: "done", destinationIndex: i };

    destResults.push({ itinerary, accommodation, budget });
  }

  yield { type: "done", result: { consensus, destinations: destResults } };
}
