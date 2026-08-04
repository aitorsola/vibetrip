import "server-only";
import type { z } from "zod";

/**
 * A tool the LLM can call inside an agent loop. The shape mirrors OpenAI's
 * function-calling format so we can hand it directly to chat.completions.
 */
export interface AgentTool<
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = unknown,
> {
  /** Snake-case name the LLM will use to call the tool. */
  readonly name: string;
  /** One-paragraph description shown to the LLM. */
  readonly description: string;
  /** Zod schema for the tool's arguments — used for runtime validation.
   *  May include defaults / transforms; we feed the parsed (output) value
   *  into `execute`. */
  readonly inputSchema: TSchema;
  /** JSON Schema fed to the LLM for argument generation. */
  readonly parametersSchema: Record<string, unknown>;
  /** Execute the tool with validated arguments. Result is JSON-serialised
   *  before being fed back to the LLM. */
  execute(input: z.output<TSchema>, signal?: AbortSignal): Promise<TOutput>;
}

/** Convert an AgentTool to OpenAI's `tools[]` entry shape. */
export function toolToOpenAiSpec(tool: AgentTool): {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parametersSchema,
    },
  };
}
