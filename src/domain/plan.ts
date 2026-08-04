import type { Accommodation } from "./accommodation";
import type { Budget } from "./budget";
import type { Consensus } from "./consensus";
import type { Itinerary } from "./itinerary";

// Consensus runs once for the whole plan. The other three run per destination.
// Modeling that split here removes the implicit "consensus is special" check
// scattered across the orchestrator, hook, and UI.
export type GlobalAgentKey = "consensus";
export type PerDestinationAgentKey = "itinerary" | "accommodation" | "budget";
export type AgentKey = GlobalAgentKey | PerDestinationAgentKey;
export type AgentStatus = "pending" | "running" | "done" | "error";

export const PER_DESTINATION_AGENTS: PerDestinationAgentKey[] = [
  "itinerary",
  "accommodation",
  "budget",
];

export interface DestinationResult {
  itinerary: Itinerary;
  accommodation: Accommodation | null;
  budget: Budget;
}

export interface PlanResult {
  consensus: Consensus;
  destinations: DestinationResult[];
}

export type PlanEvent =
  // Global agent (consensus): no destinationIndex.
  | { type: "agent"; agent: GlobalAgentKey; status: AgentStatus }
  | { type: "data"; agent: "consensus"; payload: Consensus }
  // Per-destination agents always carry a destinationIndex.
  | {
      type: "agent";
      agent: PerDestinationAgentKey;
      status: AgentStatus;
      destinationIndex: number;
    }
  | {
      type: "data";
      agent: "itinerary";
      payload: Itinerary;
      destinationIndex: number;
    }
  | {
      type: "data";
      agent: "accommodation";
      payload: Accommodation;
      destinationIndex: number;
    }
  | {
      type: "data";
      agent: "budget";
      payload: Budget;
      destinationIndex: number;
    }
  // Tool calls inside an agentic loop. Surfaced to the UI so the user can
  // see what the agent is searching for in real time.
  | {
      type: "tool_call";
      agent: PerDestinationAgentKey;
      tool: string;
      input: unknown;
      destinationIndex: number;
    }
  | {
      type: "tool_result";
      agent: PerDestinationAgentKey;
      tool: string;
      ok: boolean;
      destinationIndex: number;
    }
  | {
      type: "error";
      agent?: AgentKey;
      message: string;
      destinationIndex?: number;
    }
  | { type: "done"; result: PlanResult };
