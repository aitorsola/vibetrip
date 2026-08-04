import "server-only";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmConfig } from "./llm/config";
import type { ChatMessage } from "@/domain/chat";

export interface ChatStreamOptions {
  /** Per-request provider/model/key (BYOK override or server default). */
  llm: LlmConfig;
  system: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  maxTokens?: number;
}

export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
  }
}

/**
 * Streaming chat completion. No tools, no agentic loop — direct LLM call,
 * yielding text deltas as they arrive. Provider routing mirrors `runAgentLoop`
 * (Anthropic SDK or OpenAI-compatible).
 */
export async function* streamChat(
  opts: ChatStreamOptions,
): AsyncGenerator<string, void, void> {
  if (opts.llm.provider === "anthropic") {
    yield* streamAnthropic(opts);
    return;
  }
  if (opts.llm.provider === "openai-compatible") {
    yield* streamOpenAI(opts);
    return;
  }
  throw new ChatError(`Chat does not support provider '${opts.llm.provider}'.`);
}

async function* streamAnthropic({
  llm,
  system,
  messages,
  signal,
  maxTokens = 1000,
}: ChatStreamOptions): AsyncGenerator<string, void, void> {
  const client = new Anthropic({ apiKey: llm.apiKey });
  const stream = client.messages.stream({
    model: llm.model,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: maxTokens,
  });
  for await (const event of stream) {
    if (signal?.aborted) throw new ChatError("aborted");
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

async function* streamOpenAI({
  llm,
  system,
  messages,
  signal,
  maxTokens = 1000,
}: ChatStreamOptions): AsyncGenerator<string, void, void> {
  const client = new OpenAI({
    apiKey: llm.apiKey,
    baseURL: llm.baseUrl,
  });
  const stream = await client.chat.completions.create(
    {
      model: llm.model,
      messages: [
        { role: "system" as const, content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: true,
      max_tokens: maxTokens,
    },
    { signal },
  );
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}
