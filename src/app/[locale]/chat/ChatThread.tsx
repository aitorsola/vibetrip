"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { postSseStream } from "@/lib/sseClient";
import { getStoredLlmConfig } from "@/lib/llmConfig";
import type { ChatEvent, ChatRole } from "@/domain/chat";

interface DisplayMessage {
  /** Stable id for messages already in DB; absent for the locally-appended
   *  user turn during a stream. */
  id?: string;
  role: ChatRole;
  content: string;
}

interface ChatThreadProps {
  initialSessionId: string | null;
  initialMessages: DisplayMessage[];
  /** When set on a NEW chat, the first POST binds the session to this trip.
   *  When set on an existing chat, used only to render the focus banner —
   *  the server ignores body tripId on existing sessions (saved one wins). */
  initialTripId?: string | null;
  /** Human-readable label shown in the focus banner (e.g. "Lisboa + Porto"). */
  focusedTripLabel?: string | null;
}

export function ChatThread({
  initialSessionId,
  initialMessages,
  initialTripId = null,
  focusedTripLabel = null,
}: ChatThreadProps) {
  const t = useTranslations("chat");
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pendingAssistant, setPendingAssistant] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the latest message visible. A small timeout lets the DOM commit the
  // new node before we scroll, otherwise we land short on long streams.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const id = window.setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [messages, pendingAssistant]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (streaming) return;
    const content = input.trim();
    if (!content) return;

    setInput("");
    setError(null);
    setStreaming(true);
    setPendingAssistant("");
    setMessages((prev) => [...prev, { role: "user", content }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let accumulated = "";
    let receivedSessionId: string | null = null;

    try {
      // BYOK: attach the user's own provider/model/key if set; else server default.
      const llm = getStoredLlmConfig();
      await postSseStream<ChatEvent>({
        url: "/api/chat",
        // tripId is only meaningful when creating a new session. On existing
        // ones the server uses the stored trip_id and ignores body tripId.
        body: {
          sessionId,
          tripId: !sessionId && initialTripId ? initialTripId : undefined,
          content,
          ...(llm ? { llm } : {}),
        },
        signal: ctrl.signal,
        onEvent: (ev) => {
          if (ev.type === "session") {
            receivedSessionId = ev.sessionId;
            setSessionId(ev.sessionId);
          } else if (ev.type === "delta") {
            accumulated += ev.text;
            setPendingAssistant(accumulated);
          } else if (ev.type === "done") {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: accumulated },
            ]);
            setPendingAssistant("");
          } else if (ev.type === "error") {
            setError(ev.message || t("errorSend"));
          }
        },
      });
    } catch (err) {
      if (!ctrl.signal.aborted) {
        const message = err instanceof Error ? err.message : t("errorSend");
        setError(message);
      }
    } finally {
      setStreaming(false);
      // For a brand-new conversation, replace the URL once the stream
      // finishes so reload / sharing works. For an existing session, just
      // refresh server data so the sidebar's order reflects new activity.
      if (!initialSessionId && receivedSessionId) {
        router.replace(`/chat/${receivedSessionId}` as never);
      } else if (initialSessionId) {
        router.refresh();
      }
    }
  };

  const onTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const empty = messages.length === 0 && !pendingAssistant;

  return (
    <div className="flex h-[calc(100vh-13rem)] flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-soft">
      {focusedTripLabel ? (
        <div className="flex items-center gap-2 border-b border-border bg-rausch/10 px-5 py-2.5 text-[13px] text-rausch">
          <span aria-hidden>✈️</span>
          <span className="truncate">
            <span className="font-semibold">{t("focusedOn")}:</span>{" "}
            {focusedTripLabel}
          </span>
        </div>
      ) : null}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {empty ? (
          <WelcomeEmpty />
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            {messages.map((m, i) => (
              <Message
                key={m.id ?? `local-${i}`}
                role={m.role}
                content={m.content}
              />
            ))}
            {pendingAssistant ? (
              <Message
                role="assistant"
                content={pendingAssistant}
                streaming
              />
            ) : null}
          </div>
        )}
        {error ? (
          <p className="mx-auto mt-4 max-w-3xl rounded-2xl bg-rausch/10 px-4 py-3 text-[13px] text-rausch">
            {error}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={send}
        className="border-t border-border bg-bg/40 px-3 py-3 sm:px-4 sm:py-4"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onTextareaKeyDown}
            placeholder={t("placeholder")}
            rows={1}
            disabled={streaming}
            className="min-h-[48px] flex-1 resize-none rounded-2xl border border-border bg-bg px-4 py-3 text-[14px] leading-relaxed text-fg placeholder:text-muted focus:border-rausch focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={streaming || input.trim().length === 0}
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-rausch px-5 text-[14px] font-semibold text-white transition-all hover:bg-rausch-dark active:scale-95 disabled:opacity-50"
          >
            {streaming ? t("sending") : t("send")}
          </button>
        </div>
      </form>
    </div>
  );
}

function WelcomeEmpty() {
  const t = useTranslations("chat");
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="text-[44px]" aria-hidden>
        ✈️
      </div>
      <h2 className="mt-3 text-[22px] font-bold text-fg sm:text-[26px]">
        {t("empty.welcome")}
      </h2>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">
        {t("empty.welcomeSub")}
      </p>
    </div>
  );
}

function Message({
  role,
  content,
  streaming,
}: {
  role: ChatRole;
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[14px] leading-relaxed shadow-soft ${
          isUser
            ? "bg-rausch text-white"
            : "border border-border bg-bg text-fg"
        }`}
      >
        {content}
        {streaming ? (
          <span
            aria-hidden
            className="ml-1 inline-block h-4 w-[3px] animate-pulse bg-fg align-middle"
          />
        ) : null}
      </div>
    </div>
  );
}
