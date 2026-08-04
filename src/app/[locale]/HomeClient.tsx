"use client";

import { useCallback, useEffect, useState } from "react";
import { CreateTripPage } from "@/features/create-trip/CreateTripPage";
import { GeneratingPage } from "@/features/generating/GeneratingPage";
import { ResultsPage } from "@/features/results/ResultsPage";
import { useTripPlanner } from "@/hooks/useTripPlanner";
import { type DestinationSegment, type Member } from "@/domain/trip";
import { useTripResult } from "@/ui/TripResultProvider";

type Phase = "create" | "generating" | "results";

export type GuestMode = "authed" | "guest-fresh" | "guest-used";

interface HomeClientProps {
  mode: GuestMode;
}

export default function HomeClient({ mode }: HomeClientProps) {
  const [phase, setPhase] = useState<Phase>("create");
  const [destinations, setDestinations] = useState<DestinationSegment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const planner = useTripPlanner();
  const { setData, clear, setRunning, registerCancel } = useTripResult();

  useEffect(() => {
    if (phase === "generating" && planner.result) {
      const id = setTimeout(() => setPhase("results"), 400);
      return () => clearTimeout(id);
    }
  }, [phase, planner.result]);

  useEffect(() => {
    if (phase === "results" && destinations.length > 0 && planner.result) {
      setData({ destinations, members, result: planner.result });
    } else if (phase !== "results") {
      clear();
    }
  }, [phase, destinations, members, planner.result, setData, clear]);

  const launch = useCallback(
    async (nextDests: DestinationSegment[], nextMembers: Member[]) => {
      setDestinations(nextDests);
      setMembers(nextMembers);
      setPhase("generating");
      await planner.start(nextDests, nextMembers);
    },
    [planner],
  );

  // Back to the form preserving destinations + members, so the user can
  // edit and retry without losing what they just typed. Used after an
  // error or when cancelling mid-generation from the navbar.
  const back = useCallback(() => {
    planner.reset();
    setPhase("create");
  }, [planner]);

  // Re-run generation with the same destinations/members. Picks up any model
  // change the user just made (BYOK key or back to default) because
  // planner.start reads the stored LLM config at call time.
  const retry = useCallback(async () => {
    if (destinations.length === 0) return;
    await planner.start(destinations, members);
  }, [planner, destinations, members]);

  // Wipe everything and start a brand-new trip. Used by the "Nuevo viaje"
  // button on the results screen.
  const newTrip = useCallback(() => {
    planner.reset();
    setDestinations([]);
    setMembers([]);
    setPhase("create");
  }, [planner]);

  useEffect(() => {
    setRunning(planner.isRunning);
  }, [planner.isRunning, setRunning]);

  useEffect(() => {
    registerCancel(back);
    return () => registerCancel(null);
  }, [registerCancel, back]);

  if (phase === "results" && destinations.length > 0 && planner.result) {
    return (
      <ResultsPage
        destinations={destinations}
        members={members}
        result={planner.result}
        onReset={newTrip}
      />
    );
  }

  if (phase === "generating" && destinations.length > 0) {
    return (
      <GeneratingPage
        destinations={destinations}
        members={members}
        consensusStatus={planner.consensusStatus}
        destStatuses={planner.destStatuses}
        consensusData={planner.consensusData}
        destPartials={planner.destPartials}
        destToolActivity={planner.destToolActivity}
        error={planner.error}
        onBack={back}
        onRetry={retry}
      />
    );
  }

  return (
    <CreateTripPage
      onLaunch={launch}
      error={planner.error}
      mode={mode}
      initialDestinations={destinations.length > 0 ? destinations : undefined}
      initialMembers={members.length > 0 ? members : undefined}
    />
  );
}
