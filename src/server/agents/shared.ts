/**
 * Shared utilities for all agents (itinerary, accommodation, …):
 * locale name table for the prompt header, and the callback shape every
 * agent forwards into the agent loop.
 */

const LOCALE_NAMES: Record<string, string> = {
  es: "Spanish",
  en: "English",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
};

/** Maps a BCP-47-ish locale ("es", "fr", …) to the language name in English,
 *  which is what we put in the prompt header so the model writes its JSON
 *  values in that language. Falls back to Spanish for unknown locales. */
export function localeLanguageName(locale: string): string {
  return LOCALE_NAMES[locale] ?? "Spanish";
}

export interface AgentCallbacks {
  onToolCall?: (toolName: string, input: unknown) => void;
  onToolResult?: (toolName: string, ok: boolean) => void;
}
