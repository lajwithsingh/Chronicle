"use client";
import { useEffect } from "react";
import { getStreamUrl } from "@/lib/api";
import { useChronicleStore } from "./useChronicleStore";
import type { EventType } from "@/lib/types";

export function useChronicleSSE(sessionId: string | null, sseKey?: number) {
  const store = useChronicleStore();

  useEffect(() => {
    if (!sessionId) return;

    const url = getStreamUrl(sessionId);
    const sse = new EventSource(url);

    const handleEvent = (type: EventType) => (e: MessageEvent) => {
      if (!e.data) return;
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (type) {
        case "pipeline_status":
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          store.handlePipelineStatus(data as any);
          if (data.is_final && !store.isAutonomous) {
            sse.close(); // Pause/end reached — prevent auto-reconnect 404s
          }
          break;
        case "research_done":
          store.handleResearchDone(data as any);
          // DON'T close yet — character discovery follows research immediately
          break;
        case "research_validation_pass":
          store.handleResearchValidationPass();
          break;
        case "script_done":
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          store.handleScriptDone(data as any);
          break;
        case "narrative_ready":
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          store.handleNarrativeReady(data as any);
          if (!store.isAutonomous) {
            sse.close(); // pipeline paused — awaiting user storyboard review
          }
          break;
        case "character_references_ready":
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          store.handleCharacterReferencesReady(data as any);
          break;
        case "storyboard_ready":
          store.handleStoryboardReady();
          if (!store.isAutonomous) {
            sse.close(); // pipeline paused — awaiting user video review
          }
          break;
        case "segment_media_done":
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          store.handleSegmentMediaDone(data as any);
          break;
        case "clip_started":
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          store.handleClipStarted(data as any);
          break;
        case "clip_done":
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          store.handleClipDone(data as any);
          break;
        case "assembly_progress":
          store.handleAssemblyProgress(data.percent, data.stage);
          break;
        case "documentary_complete":
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          store.handleDocumentaryComplete(data as any);
          sse.close(); // pipeline done — stop EventSource from reconnecting
          break;
        case "error":
          store.handleError(data.message ?? "Unknown error", !!data.recoverable);
          if (!data.recoverable) {
            sse.close(); // fatal error — stop EventSource from reconnecting
          }
          break;
      }
    };

    const eventTypes: EventType[] = [
      "pipeline_status",
      "research_done",
      "research_validation_pass",
      "script_done",
      "narrative_ready",
      "character_references_ready",
      "storyboard_ready",
      "segment_media_done",
      "clip_started",
      "clip_done",
      "assembly_progress",
      "documentary_complete",
      "error",
    ];

    const listeners: Array<[string, EventListener]> = eventTypes.map((type) => {
      const fn = handleEvent(type) as EventListener;
      sse.addEventListener(type, fn);
      return [type, fn];
    });

    // Don't force-close on error — EventSource auto-reconnects for transient failures.
    // Only show error when the connection has permanently closed (readyState CLOSED).
    sse.onerror = () => {
      if (sse.readyState === EventSource.CLOSED) {
        // Prevent generic "Connection lost" from overwriting expected wait states or detailed errors
        const currentStatus = useChronicleStore.getState().status;
        const validCloseStates = ["error", "complete", "awaiting_narrative", "awaiting_storyboard", "awaiting_video"];
        if (!validCloseStates.includes(currentStatus)) {
          store.handleError("Connection lost. Please try again.");
        }
      }
    };

    return () => {
      listeners.forEach(([type, fn]) => sse.removeEventListener(type, fn));
      sse.close();
    };
  }, [sessionId, sseKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
