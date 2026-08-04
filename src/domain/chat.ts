import { z } from "zod";
import { ByokSchema } from "./llm";

export const ChatRoleSchema = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatMessageSchema = z.object({
  role: ChatRoleSchema,
  content: z.string().min(1).max(4000),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * One-turn POST shape: the server is the source of truth for history, so the
 * client sends only the new user message + (optionally) the session it belongs
 * to. A missing `sessionId` means "start a new conversation".
 *
 * `tripId` is honored only when creating a NEW session — it binds that session
 * to a specific trip so future turns inject that trip's full plan into context.
 * On existing sessions the saved trip_id wins; the body field is ignored.
 */
// Accept both `null` and `undefined` for the optional ids: the web client
// holds them in React state initialised to `null`, JSON.stringify keeps the
// null, and we don't want validation to reject brand-new chats.
export const ChatRequestSchema = z.object({
  sessionId: z.string().uuid().nullable().optional(),
  tripId: z.string().uuid().nullable().optional(),
  content: z.string().min(1).max(4000),
  // Optional BYOK override. Absent → server default model.
  llm: ByokSchema.optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** SSE events the endpoint emits, in the order the client should expect.
 *  `session` always comes first (so the client can capture the id when
 *  starting a new conversation). Then a stream of `delta` chunks. Then
 *  exactly one of `done` or `error`. */
export type ChatEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** Cap on how many past turns we feed back to the LLM. Anything older is
 *  silently dropped from context (still in DB, still readable in the UI). */
export const CHAT_HISTORY_CAP = 30;
