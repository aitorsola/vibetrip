"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PlanResult } from "@/domain/plan";
import type { DestinationSegment, Member } from "@/domain/trip";

interface TripResultData {
  destinations: DestinationSegment[];
  members: Member[];
  result: PlanResult;
}

interface TripResultContextValue {
  data: TripResultData | null;
  setData: (data: TripResultData) => void;
  clear: () => void;

  // Planning lifecycle (used by the navbar to show a confirm dialog
  // before navigating away mid-generation).
  isRunning: boolean;
  setRunning: (running: boolean) => void;
  registerCancel: (fn: (() => void) | null) => void;
  requestCancel: () => void;

  // "Fill with example" action — exposed in the navbar while the user is
  // on the create page.
  hasFillSample: boolean;
  registerFillSample: (fn: (() => void) | null) => void;
  requestFillSample: () => void;
}

const TripResultContext = createContext<TripResultContextValue | null>(null);

const BEFOREUNLOAD_MSG =
  "Hay una planificación en curso. Si sales, se cancelará.";

export function TripResultProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<TripResultData | null>(null);
  const [isRunning, setRunningState] = useState(false);
  const [hasFillSample, setHasFillSample] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const fillSampleRef = useRef<(() => void) | null>(null);

  const setData = useCallback((next: TripResultData) => {
    setDataState(next);
  }, []);

  const clear = useCallback(() => {
    setDataState(null);
  }, []);

  const setRunning = useCallback((running: boolean) => {
    setRunningState(running);
  }, []);

  const registerCancel = useCallback((fn: (() => void) | null) => {
    cancelRef.current = fn;
  }, []);

  const requestCancel = useCallback(() => {
    cancelRef.current?.();
  }, []);

  const registerFillSample = useCallback((fn: (() => void) | null) => {
    fillSampleRef.current = fn;
    setHasFillSample(!!fn);
  }, []);

  const requestFillSample = useCallback(() => {
    fillSampleRef.current?.();
  }, []);

  // Browser-level guard: refresh, tab close, external link
  useEffect(() => {
    if (!isRunning) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = BEFOREUNLOAD_MSG;
      return BEFOREUNLOAD_MSG;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isRunning]);

  const value = useMemo(
    () => ({
      data,
      setData,
      clear,
      isRunning,
      setRunning,
      registerCancel,
      requestCancel,
      hasFillSample,
      registerFillSample,
      requestFillSample,
    }),
    [
      data,
      setData,
      clear,
      isRunning,
      setRunning,
      registerCancel,
      requestCancel,
      hasFillSample,
      registerFillSample,
      requestFillSample,
    ],
  );

  return (
    <TripResultContext.Provider value={value}>
      {children}
    </TripResultContext.Provider>
  );
}

export function useTripResult(): TripResultContextValue {
  const ctx = useContext(TripResultContext);
  if (!ctx)
    throw new Error("useTripResult must be used within TripResultProvider");
  return ctx;
}
