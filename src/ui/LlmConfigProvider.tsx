"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ByokConfig } from "@/domain/llm";
import {
  clearStoredLlmConfig,
  getStoredLlmConfig,
  setStoredLlmConfig,
} from "@/lib/llmConfig";

interface LlmConfigContextValue {
  /** The user's BYOK override, or null when using vibetrip's default model. */
  config: ByokConfig | null;
  setConfig: (cfg: ByokConfig) => void;
  clearConfig: () => void;
}

const LlmConfigContext = createContext<LlmConfigContextValue | null>(null);

/** Shares the BYOK choice between the navbar pill (which edits it) and anything
 *  that displays it. The request-firing code reads localStorage directly, so
 *  this context is purely for reactive UI. */
export function LlmConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<ByokConfig | null>(null);

  // Hydrate from localStorage after mount (SSR has no window). Not
  // useSyncExternalStore: getStoredLlmConfig() parses JSON into a fresh object
  // every call, so an uncached snapshot would re-render forever.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfigState(getStoredLlmConfig());
  }, []);

  const setConfig = useCallback((cfg: ByokConfig) => {
    setStoredLlmConfig(cfg);
    setConfigState(cfg);
  }, []);

  const clearConfig = useCallback(() => {
    clearStoredLlmConfig();
    setConfigState(null);
  }, []);

  return (
    <LlmConfigContext.Provider value={{ config, setConfig, clearConfig }}>
      {children}
    </LlmConfigContext.Provider>
  );
}

export function useLlmConfig(): LlmConfigContextValue {
  const ctx = useContext(LlmConfigContext);
  if (!ctx) {
    throw new Error("useLlmConfig must be used within LlmConfigProvider");
  }
  return ctx;
}
