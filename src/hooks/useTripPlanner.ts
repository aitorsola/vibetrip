"use client";

import { useCallback, useReducer, useRef } from "react";
import type {
  AgentStatus,
  DestinationResult,
  PerDestinationAgentKey,
  PlanEvent,
  PlanResult,
} from "@/domain/plan";
import { PER_DESTINATION_AGENTS } from "@/domain/plan";
import type { Consensus } from "@/domain/consensus";
import type { DestinationSegment, Member } from "@/domain/trip";
import { postSseStream } from "@/lib/sseClient";
import { getStoredLlmConfig } from "@/lib/llmConfig";

export type DestAgentStatusMap = Record<PerDestinationAgentKey, AgentStatus>;

const INITIAL_DEST_STATUS: DestAgentStatusMap = {
  itinerary: "pending",
  accommodation: "pending",
  budget: "pending",
};

export interface ToolActivity {
  tool: string;
  input: unknown;
  count: number;
}

/** Latest tool activity for each per-destination agent. Itinerary and
 *  accommodation can run in parallel, so we track them separately to avoid
 *  one overwriting the other in the UI. */
export type DestToolActivity = Partial<
  Record<PerDestinationAgentKey, ToolActivity>
>;

export interface UseTripPlannerState {
  consensusStatus: AgentStatus;
  destStatuses: DestAgentStatusMap[];
  consensusData: Consensus | null;
  destPartials: Array<Partial<DestinationResult>>;
  destToolActivity: DestToolActivity[];
  result: PlanResult | null;
  error: string | null;
  isRunning: boolean;
}

function initialState(destCount: number): UseTripPlannerState {
  return {
    consensusStatus: "pending",
    destStatuses: Array.from({ length: destCount }, () => ({ ...INITIAL_DEST_STATUS })),
    consensusData: null,
    destPartials: Array.from({ length: destCount }, () => ({})),
    destToolActivity: Array.from({ length: destCount }, () => ({})),
    result: null,
    error: null,
    isRunning: false,
  };
}

// Discrete actions — the reducer below has one branch per action and is the
// only place state is shaped. Easier to follow and to test in isolation.
type Action =
  | { type: "RESET"; destCount: number }
  | { type: "START"; destCount: number }
  | { type: "EVENT"; event: PlanEvent };

function reducer(state: UseTripPlannerState, action: Action): UseTripPlannerState {
  switch (action.type) {
    case "RESET":
      return initialState(action.destCount);
    case "START":
      return { ...initialState(action.destCount), isRunning: true };
    case "EVENT":
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: UseTripPlannerState, event: PlanEvent): UseTripPlannerState {
  switch (event.type) {
    case "agent": {
      if (event.agent === "consensus") {
        return { ...state, consensusStatus: event.status };
      }
      // Per-destination agent — destinationIndex is required by the type.
      const next = state.destStatuses.slice();
      const di = event.destinationIndex;
      next[di] = { ...(next[di] ?? INITIAL_DEST_STATUS), [event.agent]: event.status };
      return { ...state, destStatuses: next };
    }
    case "data": {
      if (event.agent === "consensus") {
        return { ...state, consensusData: event.payload };
      }
      const next = state.destPartials.slice();
      const di = event.destinationIndex;
      const current = next[di] ?? {};
      // event.agent is one of "itinerary" | "accommodation" | "budget" — the
      // discriminated union ensures payload type matches the agent, so a
      // single assignment-by-key works without unsafe casts.
      next[di] = { ...current, [event.agent]: event.payload };
      return { ...state, destPartials: next };
    }
    case "tool_call": {
      const next = state.destToolActivity.slice();
      const di = event.destinationIndex;
      const current = next[di] ?? {};
      const prev = current[event.agent];
      next[di] = {
        ...current,
        [event.agent]: {
          tool: event.tool,
          input: event.input,
          count: (prev?.count ?? 0) + 1,
        },
      };
      return { ...state, destToolActivity: next };
    }
    case "tool_result":
      // Result events keep the activity visible so the user can read what
      // was searched even while the next round-trip is in flight. We don't
      // clear the activity until the agent finishes (status: done).
      return state;
    case "error":
      return { ...state, error: event.message, isRunning: false };
    case "done":
      return { ...state, result: event.result, isRunning: false };
  }
}

export function useTripPlanner() {
  const [state, dispatch] = useReducer(reducer, 0, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: "RESET", destCount: 0 });
  }, []);

  const start = useCallback(
    async (destinations: DestinationSegment[], members: Member[]) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ type: "START", destCount: destinations.length });

      try {
        // BYOK: attach the user's own provider/model/key if they set one.
        // Absent → server uses its default model.
        const llm = getStoredLlmConfig();
        await postSseStream<PlanEvent>({
          url: "/api/trip/plan",
          body: { destinations, members, ...(llm ? { llm } : {}) },
          signal: controller.signal,
          onEvent: (event) => dispatch({ type: "EVENT", event }),
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        dispatch({
          type: "EVENT",
          event: { type: "error", message },
        });
      }
    },
    [],
  );

  return { ...state, start, reset, perDestAgents: PER_DESTINATION_AGENTS };
}
