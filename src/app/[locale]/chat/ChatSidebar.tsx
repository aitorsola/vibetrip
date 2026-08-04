"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { deleteSessionAction } from "./actions";

export interface SidebarSession {
  id: string;
  title: string | null;
  /** True when the session is bound to a specific trip (visual badge). */
  hasTrip: boolean;
  updatedAt: string;
}

interface ChatSidebarProps {
  sessions: SidebarSession[];
}

export function ChatSidebar({ sessions }: ChatSidebarProps) {
  const t = useTranslations("chat");
  const pathname = usePathname();
  const router = useRouter();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // pathname is already locale-stripped by next-intl. /chat/<id> on detail,
  // /chat on the index. Extract the active id (or null if we're on /chat).
  const match = pathname?.match(/^\/chat\/([^/]+)/);
  const activeId = match?.[1] ?? null;

  const onConfirmDelete = () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setError(null);
    startTransition(async () => {
      const res = await deleteSessionAction(id);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      // If the user was viewing the deleted session, bounce them to the
      // welcome screen; otherwise refresh the sidebar in place.
      if (activeId === id) {
        router.push("/chat" as never);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-3 sm:flex">
      <Link
        href="/chat"
        className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-[13px] font-semibold transition-colors ${
          activeId === null
            ? "border-rausch bg-rausch/10 text-rausch"
            : "border-border bg-surface text-fg hover:bg-surface-hover"
        }`}
      >
        <span aria-hidden>＋</span>
        {t("newChat")}
      </Link>

      {sessions.length === 0 ? (
        <p className="px-3 pt-2 text-[12px] text-muted">
          {t("empty.sidebarTitle")}
        </p>
      ) : (
        <ul className="space-y-1">
          {sessions.map((s) => {
            const active = s.id === activeId;
            return (
              <li key={s.id} className="group relative">
                <Link
                  href={`/chat/${s.id}` as never}
                  className={`flex items-center gap-2 truncate rounded-xl px-3 py-2 pr-9 text-[13px] transition-colors ${
                    active
                      ? "bg-rausch/10 font-semibold text-rausch"
                      : "text-fg hover:bg-surface-hover"
                  }`}
                  title={s.title ?? t("untitled")}
                >
                  {s.hasTrip ? (
                    <span aria-hidden className="shrink-0 text-[12px]">
                      ✈️
                    </span>
                  ) : null}
                  <span className="truncate">{s.title ?? t("untitled")}</span>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setPendingDeleteId(s.id);
                  }}
                  aria-label={t("deleteTitle")}
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-rausch/10 hover:text-rausch focus:opacity-100 group-hover:opacity-100"
                >
                  <span aria-hidden>✕</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p className="rounded-xl bg-rausch/10 px-3 py-2 text-[12px] text-rausch">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={t("confirmDelete.title")}
        description={t("confirmDelete.description")}
        confirmLabel={t("confirmDelete.confirm")}
        cancelLabel={t("confirmDelete.cancel")}
        onConfirm={onConfirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />

      <span aria-hidden className="hidden">
        {pending ? "·" : ""}
      </span>
    </aside>
  );
}
