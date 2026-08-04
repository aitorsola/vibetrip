import "server-only";
import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages";
import type { z } from "zod";
import { extractJsonObject } from "../claude/jsonParser";
import { isLocalEndpoint, llmErrorCode } from "./index";
import type { LlmConfig } from "./config";
import { toolToOpenAiSpec, type AgentTool } from "../tools/types";

// Some OpenAI-compatible servers (LM Studio, certain Qwen builds) accept
// vendor-specific extras to disable hidden chain-of-thought and similar.
// These aren't part of the standard ChatCompletionCreateParams but they're
// safe-to-ignore on providers that don't recognize them.
type ExtendedChatParams = ChatCompletionCreateParamsNonStreaming & {
  enable_thinking?: boolean;
  chat_template_kwargs?: Record<string, unknown>;
  reasoning_effort?: string;
};

export interface AgentLoopOptions<S extends z.ZodTypeAny> {
  /** Per-request provider/model/key. The route handler resolves it from the
   *  client's BYOK choice or falls back to the server default. */
  llm: LlmConfig;
  system: string;
  prompt: string;
  tools: AgentTool[];
  schema: S;
  /** Cap on LLM round-trips. Default 8. */
  maxIterations?: number;
  /** Hard cap on total tool executions. Default 12. */
  maxToolCalls?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  agentName?: string;
  onToolCall?: (toolName: string, input: unknown) => void;
  onToolResult?: (toolName: string, ok: boolean) => void;
  validate?: (result: z.output<S>) => string[] | null | undefined;
}

export class AgentLoopError extends Error {
  public readonly originalCause?: unknown;
  constructor(message: string, originalCause?: unknown) {
    super(message);
    this.name = "AgentLoopError";
    this.originalCause = originalCause;
  }
}

const MAX_CORRECTIONS = 1;

const DUPLICATE_PAYLOAD = {
  error: "duplicate_call",
  message:
    "Already called with these arguments. Use the previous result or return the final JSON.",
};

const EXHAUSTED_MESSAGE =
  "You have exhausted your search budget. Produce the final JSON now using the results you already have. Do not call any more tools.";

/**
 * ReAct-style agentic loop. Supports two providers:
 *  - "anthropic": uses the Anthropic SDK with native tool use.
 *  - "openai-compatible": uses the OpenAI SDK; works with Groq, Together,
 *    OpenRouter, LM Studio, Ollama, etc.
 */
export async function runAgentLoop<S extends z.ZodTypeAny>(
  opts: AgentLoopOptions<S>,
): Promise<z.output<S>> {
  if (opts.llm.provider === "anthropic") return runAnthropicLoop(opts);
  if (opts.llm.provider === "openai-compatible") return runOpenAILoop(opts);
  throw new AgentLoopError(`Agent loop does not support provider '${opts.llm.provider}'.`);
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

async function runAnthropicLoop<S extends z.ZodTypeAny>({
  llm,
  system,
  prompt,
  tools,
  schema,
  maxIterations = 8,
  maxToolCalls = 12,
  maxTokens = 4000,
  signal,
  agentName = "agent",
  onToolCall,
  onToolResult,
  validate,
}: AgentLoopOptions<S>): Promise<z.output<S>> {
  const client = new Anthropic({ apiKey: llm.apiKey });
  const toolByName = new Map(tools.map((t) => [t.name, t]));

  const anthropicTools: AnthropicTool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parametersSchema as AnthropicTool["input_schema"],
  }));

  const messages: MessageParam[] = [{ role: "user", content: prompt }];
  const seenCalls = new Set<string>();
  let totalToolCalls = 0;
  let exhaustedMessagePushed = false;
  let correctionsUsed = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    if (signal?.aborted) throw new AgentLoopError("aborted");

    const toolsExhausted = totalToolCalls >= maxToolCalls;
    if (toolsExhausted && !exhaustedMessagePushed) {
      exhaustedMessagePushed = true;
      messages.push({ role: "user", content: EXHAUSTED_MESSAGE });
    }

    const offerTools = anthropicTools.length > 0 && !toolsExhausted;
    const toolChoice: Anthropic.MessageCreateParams["tool_choice"] = offerTools
      ? { type: "auto" }
      : undefined;

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: llm.model,
        system,
        messages,
        tools: offerTools ? anthropicTools : undefined,
        tool_choice: toolChoice,
        max_tokens: maxTokens,
      });
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.message.includes("aborted"))) {
        throw new AgentLoopError("aborted");
      }
      const code = llmErrorCode(err);
      if (code) throw new AgentLoopError(code, err);
      throw err;
    }

    // Separate text blocks from tool_use blocks.
    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");

    if (toolUseBlocks.length > 0) {
      // Append assistant turn (with all content blocks).
      messages.push({ role: "assistant", content: response.content });

      // Execute each tool and collect results.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        const { name, id, input } = block;
        const { payload, counted } = await executeToolWithDedup({
          tool: toolByName.get(name),
          name,
          input: input as Record<string, unknown>,
          seenCalls,
          signal,
          onToolCall,
          onToolResult,
        });
        if (counted) totalToolCalls++;
        toolResults.push({ type: "tool_result", tool_use_id: id, content: JSON.stringify(payload) });
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // No tool calls — final answer.
    const content = textBlock?.text.trim() ?? "";
    if (!content) {
      throw new AgentLoopError(`[${agentName}] empty content (stop_reason=${response.stop_reason})`);
    }

    const outcome = checkFinalContent(content, schema, validate, correctionsUsed < MAX_CORRECTIONS);
    if (outcome.kind === "ok") return outcome.data;
    if (outcome.kind === "schema-failed") {
      throw new AgentLoopError(
        `[${agentName}] schema validation failed after correction attempt: ${outcome.error}`,
      );
    }
    correctionsUsed++;
    messages.push({ role: "assistant", content });
    messages.push({ role: "user", content: outcome.message });
  }

  throw new AgentLoopError(`[${agentName}] reached max iterations (${maxIterations}) without a final answer`);
}

// ─── OpenAI-compatible ────────────────────────────────────────────────────────

async function runOpenAILoop<S extends z.ZodTypeAny>({
  llm,
  system,
  prompt,
  tools,
  schema,
  maxIterations = 8,
  maxToolCalls = 12,
  maxTokens = 4000,
  signal,
  agentName = "agent",
  onToolCall,
  onToolResult,
  validate,
}: AgentLoopOptions<S>): Promise<z.output<S>> {
  // Custom fetch that clones non-OK responses so we can log the actual error
  // body before the OpenAI SDK swallows it (Mistral returns descriptive 400s
  // that don't match the OpenAI error shape).
  const debugFetch: typeof fetch = async (url, init) => {
    const res = await fetch(url, init);
    if (!res.ok) {
      const cloned = res.clone();
      const text = await cloned.text();
      console.error(
        `[${agentName}] ${res.status} ${res.statusText} body:`,
        text.slice(0, 1000),
      );
    }
    return res;
  };
  const client = new OpenAI({
    apiKey: llm.apiKey,
    baseURL: llm.baseUrl,
    fetch: debugFetch,
  });
  const toolByName = new Map(tools.map((t) => [t.name, t]));
  const toolSpecs = tools.map(toolToOpenAiSpec);

  const local = isLocalEndpoint(llm.baseUrl ?? "");
  const extraParams: Record<string, unknown> = local
    ? { enable_thinking: false, chat_template_kwargs: { enable_thinking: false }, reasoning_effort: "none" }
    : {};
  const effectiveSystem = local ? `${system}\n\n/no_think` : system;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: effectiveSystem },
    { role: "user", content: prompt },
  ];

  const seenCalls = new Set<string>();
  let totalToolCalls = 0;
  let exhaustedMessagePushed = false;
  let correctionsUsed = 0;
  // Some models (Groq + Llama 4 Scout) explode with a 400 "tool_use_failed"
  // when forced via tool_choice "required". Once we hit it once, we stop
  // forcing for the rest of the run.
  let providerSupportsForcedTool = true;

  for (let iter = 0; iter < maxIterations; iter++) {
    if (signal?.aborted) throw new AgentLoopError("aborted");

    const toolsExhausted = totalToolCalls >= maxToolCalls;
    if (toolsExhausted && !exhaustedMessagePushed) {
      exhaustedMessagePushed = true;
      messages.push({ role: "user", content: EXHAUSTED_MESSAGE });
    }

    const offerTools = toolSpecs.length > 0 && !toolsExhausted;
    // First turn we force a tool call ("required"). Many models with strong
    // world knowledge (Mistral Large, Gemini 2.0 Flash, GPT-4o) skip
    // search_places entirely under "auto" and answer from training data,
    // leaving the trip without verified places or coordinates.
    // After at least one tool call we relax to "auto" so the model can
    // produce the final JSON when it has enough info.
    const toolChoice = offerTools
      ? totalToolCalls === 0 && providerSupportsForcedTool
        ? "required"
        : "auto"
      : undefined;

    // Mistral (and others) reject conversations whose last message is an
    // assistant turn without a follow-up. Belt-and-braces: if some code
    // path left us in that state, push a user nudge before the next call.
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      messages.push({ role: "user", content: "Continue." });
    }

    let response;
    try {
      response = await client.chat.completions.create(
        {
          model: llm.model,
          messages,
          tools: offerTools ? toolSpecs : undefined,
          tool_choice: toolChoice,
          max_tokens: maxTokens,
          ...extraParams,
        } as ExtendedChatParams,
        { signal },
      );
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.message.includes("aborted"))) {
        throw new AgentLoopError("aborted");
      }
      // Log the raw body when the SDK swallowed it (some providers return
      // non-standard error shapes the SDK can't parse).
      const status = (err as { status?: number }).status;
      const rawBody = (err as { body?: unknown }).body;
      console.error(
        `[${agentName}] LLM call failed: status=${status} body=`,
        typeof rawBody === "string" ? rawBody.slice(0, 500) : rawBody,
      );
      const errMsg = err instanceof Error ? err.message : String(err);
      const bodyStr = typeof rawBody === "string" ? rawBody : "";
      const looksLikeForcedToolFailure =
        status === 400 &&
        offerTools &&
        (/failed to call a function/i.test(errMsg) ||
          /failed to call a function/i.test(bodyStr) ||
          /tool_use_failed/i.test(bodyStr));

      if (looksLikeForcedToolFailure && toolChoice === "required") {
        // Provider rejected the forced tool call (Groq + Llama 4 Scout).
        // Retry this very iteration with tool_choice "auto" — model can still
        // call the tool voluntarily — and remember not to force in the rest
        // of the loop.
        providerSupportsForcedTool = false;
        response = await client.chat.completions.create(
          {
            model: llm.model,
            messages,
            tools: toolSpecs,
            tool_choice: "auto",
            max_tokens: maxTokens,
            ...extraParams,
          } as ExtendedChatParams,
          { signal },
        );
      } else if (looksLikeForcedToolFailure) {
        // Same error mid-conversation (model emitted a malformed tool call).
        // Push a corrective user turn and retry without tools.
        messages.push({
          role: "user",
          content:
            "Your last tool call could not be processed. Produce the final JSON now with the data you already have. Do not call any more tools.",
        });
        response = await client.chat.completions.create(
          {
            model: llm.model,
            messages,
            max_tokens: maxTokens,
            ...extraParams,
          } as ExtendedChatParams,
          { signal },
        );
      } else {
        const code = llmErrorCode(err);
        if (code) throw new AgentLoopError(code, err);
        throw err;
      }
    }

    const choice = response.choices[0];
    const message = choice?.message;
    if (!message) throw new AgentLoopError(`[${agentName}] no message in response`);

    const toolCalls = message.tool_calls ?? [];

    if (toolCalls.length > 0) {
      // Mistral and some other providers reject an empty-string content on
      // an assistant turn that carries tool_calls. Use null (omitted) when
      // there's no text. Spec-compliant; OpenAI accepts both.
      messages.push({
        role: "assistant",
        content: message.content && message.content.length > 0 ? message.content : null,
        tool_calls: toolCalls,
      });

      // We must push a tool message for EVERY tool_call_id the assistant
      // emitted; otherwise providers like Mistral 400 because the last
      // message ends up being assistant (no tool follow-up).
      let toolResultsPushed = 0;
      for (const call of toolCalls) {
        if (call.type !== "function") {
          // Non-function tool calls aren't supported by our agent. Push a
          // dummy tool result so the conversation stays balanced.
          messages.push({
            role: "tool",
            tool_call_id: (call as { id: string }).id,
            content: JSON.stringify({ error: "unsupported_tool_type" }),
          });
          toolResultsPushed++;
          continue;
        }
        const name = call.function.name;
        let parsedArgs: Record<string, unknown> = {};
        try { parsedArgs = JSON.parse(call.function.arguments || "{}"); } catch { parsedArgs = {}; }

        const { payload, counted } = await executeToolWithDedup({
          tool: toolByName.get(name),
          name,
          input: parsedArgs,
          seenCalls,
          signal,
          onToolCall,
          onToolResult,
        });
        if (counted) totalToolCalls++;
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(payload) });
        toolResultsPushed++;
      }

      // Defensive: if for any reason no tool messages were pushed (all calls
      // were unsupported types or some weird shape), append a user message so
      // the conversation doesn't end with assistant — Mistral & co. reject
      // that with "Expected last role User or Tool ... got assistant".
      if (toolResultsPushed === 0) {
        messages.push({
          role: "user",
          content:
            "The previous tool call could not be processed. Continue with the plan or return the final JSON with the data you already have.",
        });
      }
      continue;
    }

    const content = (message.content ?? "").trim();
    if (!content) throw new AgentLoopError(`[${agentName}] empty content (finish_reason=${choice.finish_reason})`);

    const outcome = checkFinalContent(content, schema, validate, correctionsUsed < MAX_CORRECTIONS);
    if (outcome.kind === "ok") return outcome.data;
    if (outcome.kind === "schema-failed") {
      throw new AgentLoopError(
        `[${agentName}] schema validation failed after correction attempt: ${outcome.error}`,
      );
    }
    correctionsUsed++;
    messages.push({ role: "assistant", content });
    messages.push({ role: "user", content: outcome.message });
  }

  throw new AgentLoopError(`[${agentName}] reached max iterations (${maxIterations}) without a final answer`);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Execute a single tool call with deduplication. Same-fingerprint repeats
 * return a `duplicate_call` error to the model and do NOT count toward the
 * caller's tool-call budget; first-time calls do. The caller is responsible
 * for incrementing the budget when `counted` is true and for shaping the
 * tool-result message in the provider's expected format.
 */
async function executeToolWithDedup({
  tool,
  name,
  input,
  seenCalls,
  signal,
  onToolCall,
  onToolResult,
}: {
  tool: AgentTool | undefined;
  name: string;
  input: Record<string, unknown>;
  seenCalls: Set<string>;
  signal: AbortSignal | undefined;
  onToolCall?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, ok: boolean) => void;
}): Promise<{ payload: unknown; counted: boolean }> {
  onToolCall?.(name, input);
  const fingerprint = `${name}:${stableStringify(input)}`;
  if (seenCalls.has(fingerprint)) {
    onToolResult?.(name, false);
    return { payload: DUPLICATE_PAYLOAD, counted: false };
  }
  seenCalls.add(fingerprint);
  if (!tool) {
    onToolResult?.(name, false);
    return { payload: { error: `Unknown tool '${name}'` }, counted: true };
  }
  try {
    const validated = tool.inputSchema.parse(input);
    const result = await tool.execute(validated as Record<string, unknown>, signal);
    onToolResult?.(name, true);
    return { payload: result, counted: true };
  } catch (err) {
    onToolResult?.(name, false);
    return {
      payload: { error: err instanceof Error ? err.message : "tool execution failed" },
      counted: true,
    };
  }
}

type FinalContentOutcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "needs-correction"; message: string }
  | { kind: "schema-failed"; error: string };

/**
 * Parse the model's final text as JSON, validate it against the agent's zod
 * schema, then run the agent's optional semantic validator. Returns either
 * the parsed data, a corrective message to send back to the model (if a
 * correction is still allowed), or a fatal schema error.
 */
function checkFinalContent<S extends z.ZodTypeAny>(
  content: string,
  schema: S,
  validate: ((d: z.output<S>) => string[] | null | undefined) | undefined,
  correctionAllowed: boolean,
): FinalContentOutcome<z.output<S>> {
  const json = parseJson(content);
  const parseResult = schema.safeParse(json);
  if (!parseResult.success) {
    if (!correctionAllowed) {
      return { kind: "schema-failed", error: parseResult.error.message };
    }
    const zodIssues = parseResult.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return {
      kind: "needs-correction",
      message: `Your JSON did not pass validation. Errors:\n${zodIssues
        .map((s) => `- ${s}`)
        .join("\n")}\n\nReturn the corrected JSON with ALL required fields.`,
    };
  }
  const issues = validate?.(parseResult.data);
  if (issues && issues.length > 0 && correctionAllowed) {
    return {
      kind: "needs-correction",
      message: `Your response has issues:\n${issues
        .map((i) => `- ${i}`)
        .join("\n")}\n\nReturn the entire corrected JSON.`,
    };
  }
  return { kind: "ok", data: parseResult.data };
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return JSON.parse(extractJsonObject(content));
  }
}

function stableStringify(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  return JSON.stringify(keys.map((k) => [k, obj[k]]));
}
