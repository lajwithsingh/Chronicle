"use client";
import { useState, useEffect } from "react";
import { useChronicleStore } from "@/hooks/useChronicleStore";
import { useChronicleSSE } from "@/hooks/useChronicleSSE";
import { ResearchCard } from "./ResearchCard";
import { ResearchPipeline, NarrativePipeline } from "./ResearchPipeline";
import { retryPipeline, restartResearch } from "@/lib/api";
import { NarrativeActs } from "./NarrativeActs";
import { NarrativeReview } from "./NarrativeReview";
import { StoryboardReview } from "./StoryboardReview";
import { StorySegmentList } from "./StorySegmentList";
import { VideoClipProgress } from "./VideoClipProgress";
import { FinalPlayer } from "./FinalPlayer";
import { CharacterPipeline } from "./CharacterPipeline";
import { motion } from "framer-motion";
import Link from "next/link";
import type { GenerationStatus } from "@/lib/types";

// ── Pipeline definition ───────────────────────────────────────────────────────

interface PipelineStep {
  id: string;
  label: string;
  sublabel: string;
  activeStatuses: GenerationStatus[];
  doneAfter: GenerationStatus[];
}

const PIPELINE: PipelineStep[] = [
  {
    id: "research",
    label: "Research Agent",
    sublabel: "Historical context",
    activeStatuses: ["researching"],
    doneAfter: ["era_researching", "validating_research", "awaiting_narrative", "generating_characters", "narrating", "validating_narrative", "awaiting_storyboard", "generating_media", "awaiting_video", "generating_video", "assembling", "complete"],
  },
  {
    id: "era_intelligence",
    label: "EraResearch Agent",
    sublabel: "Clothing and architecture",
    activeStatuses: ["era_researching"],
    doneAfter: ["validating_research", "awaiting_narrative", "generating_characters", "narrating", "validating_narrative", "awaiting_storyboard", "generating_media", "awaiting_video", "generating_video", "assembling", "complete"],
  },
  {
    id: "validate_research",
    label: "Research Validator",
    sublabel: "Verification and sources",
    activeStatuses: ["validating_research"],
    doneAfter: ["awaiting_narrative", "generating_characters", "narrating", "validating_narrative", "awaiting_storyboard", "generating_media", "awaiting_video", "generating_video", "assembling", "complete"],
  },
  {
    id: "characters",
    label: "Reference Agent",
    sublabel: "Character references",
    activeStatuses: ["generating_characters"],
    doneAfter: ["narrating", "validating_narrative", "awaiting_storyboard", "generating_media", "awaiting_video", "generating_video", "assembling", "complete"],
  },
  {
    id: "narrative",
    label: "Narrative Agent",
    sublabel: "8-11 segment script",
    activeStatuses: ["narrating"],
    doneAfter: ["validating_narrative", "awaiting_storyboard", "generating_media", "awaiting_video", "generating_video", "assembling", "complete"],
  },
  {
    id: "validate_narrative",
    label: "Narrative Validator",
    sublabel: "Veo prompt quality check",
    activeStatuses: ["validating_narrative"],
    doneAfter: ["awaiting_storyboard", "generating_media", "awaiting_video", "generating_video", "assembling", "complete"],
  },
  {
    id: "media",
    label: "Interleaved Media Agent",
    sublabel: "Gemini image generation",
    activeStatuses: ["generating_media"],
    doneAfter: ["awaiting_video", "generating_video", "assembling", "complete"],
  },
  {
    id: "video",
    label: "Video Agent",
    sublabel: "Veo 3.1 clips",
    activeStatuses: ["generating_video"],
    doneAfter: ["assembling", "complete"],
  },
  {
    id: "assembly",
    label: "Assembly Agent",
    sublabel: "ffmpeg pipeline",
    activeStatuses: ["assembling"],
    doneAfter: ["complete"],
  },
];

type StepState = "pending" | "active" | "done";
type ConnectorState = "pending" | "active" | "done";

function getStepState(step: PipelineStep, status: GenerationStatus, hasCharacters: boolean): StepState {
  if (status === "error") return "pending";
  if (step.id === "characters") {
    if (hasCharacters && (status === "awaiting_narrative" || step.doneAfter.includes(status))) return "done";
  }
  if (step.doneAfter.includes(status) || status === "complete") return "done";
  if (step.activeStatuses.includes(status)) return "active";
  return "pending";
}

function getConnectorState(current: StepState, next: StepState): ConnectorState {
  if (current === "done" && (next === "done" || next === "active")) return "done";
  if (current === "active" || next === "active") return "active";
  return "pending";
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type TabId = "research" | "story" | "characters" | "storyboard" | "video" | "documentary";

const TABS: { id: TabId; label: string }[] = [
  { id: "research", label: "Research" },
  { id: "characters", label: "Characters" },
  { id: "story", label: "Story" },
  { id: "storyboard", label: "Storyboard" },
  { id: "video", label: "Video" },
  { id: "documentary", label: "Documentary" },
];

function shouldMountTab(tab: TabId, activeTab: TabId, available: boolean): boolean {
  return activeTab === tab || available;
}

function getAutoTab(status: GenerationStatus, hasCharacters: boolean): TabId {
  if (status === "complete") return "documentary";
  if (status === "assembling" || status === "generating_video") return "video";
  if (status === "awaiting_video" || status === "generating_media") return "storyboard";
  
  if (status === "generating_characters") return "characters";
  if (status === "awaiting_narrative") {
    // If we have characters, we are in the review phase before story writing -> "characters" tab
    // If we don't, we are in the review phase before character discovery -> stay on "research"
    return hasCharacters ? "characters" : "research";
  }

  // Narrative writing and review all live on the Story tab
  if (
    status === "narrating" ||
    status === "validating_narrative" ||
    status === "awaiting_storyboard"
  ) return "story";

  // Research phase stays on Research tab
  return "research";
}

// ── Step icon ─────────────────────────────────────────────────────────────────

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span className="w-5 h-5 rounded-full bg-chronicle-amber flex items-center justify-center shrink-0">
        <svg className="w-3 h-3 text-chronicle-bg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="w-5 h-5 rounded-full border border-chronicle-amber flex items-center justify-center shrink-0">
        <motion.span
          className="w-1.5 h-1.5 rounded-full bg-chronicle-amber"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
        />
      </span>
    );
  }
  return (
    <span className="w-5 h-5 rounded-full border border-chronicle-border/50 flex items-center justify-center shrink-0">
      <span className="w-1 h-1 rounded-full bg-chronicle-border/60" />
    </span>
  );
}

function StepConnector({ state }: { state: ConnectorState }) {
  return (
    <div className="ml-2.5 h-3.5 w-px relative overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            state === "done"
              ? "rgba(217,119,87,0.32)"
              : state === "active"
                ? "rgba(217,119,87,0.18)"
                : "rgba(255,255,255,0.12)",
        }}
      />
      {state === "active" && (
        <motion.div
          className="absolute left-0 top-0 w-px"
          style={{
            background: "linear-gradient(180deg, rgba(217,119,87,0), rgba(217,119,87,0.95), rgba(255,244,214,0.8), rgba(217,119,87,0))",
            boxShadow: "0 0 12px rgba(217,119,87,0.7)",
          }}
          animate={{ y: ["-110%", "140%"] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
        />
      )}
    </div>
  );
}

// ── Agent sidebar ─────────────────────────────────────────────────────────────

function AgentSidebar() {
  const { status, documentarySegments, characterReferenceImages, mediaSegments, videoClips, assemblyPercent, assemblyStage, agentActivity } = useChronicleStore();
  const totalSegments = documentarySegments.length;
  const waitingForUser = status === "awaiting_narrative" || status === "awaiting_storyboard" || status === "awaiting_video";
  const waitingLabel =
    status === "awaiting_narrative" ? (characterReferenceImages.length > 0 ? "Review characters to proceed" : "Review research to proceed") :
      status === "awaiting_storyboard" ? "Awaiting narrative review" :
        "Awaiting storyboard review";
  const hasCharacters = characterReferenceImages.length > 0;
  const stepStates = PIPELINE.map((step) => getStepState(step, status, hasCharacters));

  return (
    <aside className="w-[230px] shrink-0 flex flex-col gap-0 overflow-y-auto pr-2">
      {/* Premium Cinematic Logo */}
      <div className="relative flex items-center gap-3 mb-8 px-2.5 group cursor-default">
        <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
          <div className="absolute inset-0 bg-gradient-to-tr from-chronicle-amber to-white/80 rounded-[4px] rotate-45 group-hover:rotate-90 transition-[transform,shadow] duration-700 ease-in-out opacity-90 shadow-[0_0_12px_rgba(217,119,87,0.4)] group-hover:shadow-[0_0_18px_rgba(217,119,87,0.8)]"></div>
          <div className="absolute inset-[1.5px] bg-chronicle-bg rounded-[3px] rotate-45 group-hover:rotate-90 transition-transform duration-700 ease-in-out z-10"></div>
          <div className="absolute w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,1)] z-20 group-hover:scale-110 transition-transform duration-700"></div>
        </div>
        <span className="text-white/95 font-sans text-xl font-light tracking-[0.25em] uppercase">CHRONICLE</span>
      </div>

      <p className="text-chronicle-muted/50 text-xs font-mono uppercase tracking-widest mb-4 px-1">
        Pipeline
      </p>

      {waitingForUser && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 px-3 py-2 rounded-xl bg-chronicle-amber/8 border border-chronicle-amber/20"
        >
          <p className="text-chronicle-amber text-sm font-sans font-medium leading-tight">
            {waitingLabel}
          </p>
        </motion.div>
      )}

      {PIPELINE.map((step, i) => {
        const state = stepStates[i];
        const connectorState = i > 0 ? getConnectorState(stepStates[i - 1], state) : null;
        return (
          <div key={step.id} className="flex flex-col">
            {connectorState && <StepConnector state={connectorState} />}
            <motion.div
              animate={{
                opacity: state === "pending" ? 0.28 : 1,
                x: state === "active" ? 2 : 0,
              }}
              transition={{ duration: 0.3 }}
              className={`flex items-start gap-2.5 px-2.5 py-2 rounded-xl transition-colors duration-300 ${state === "active" ? "bg-chronicle-amber/6 border border-chronicle-amber/15" : ""
                }`}
            >
              <StepIcon state={state} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-sans font-medium leading-tight ${state === "active" ? "text-chronicle-amber" : "text-chronicle-text"
                  }`}>
                  {step.label}
                </p>
                <p className="text-chronicle-muted/60 text-xs font-sans mt-0.5 leading-tight">
                  {step.sublabel}
                </p>

                {state === "active" && agentActivity &&
                  ["research", "validate_research", "narrative", "validate_narrative"].includes(step.id) && (
                    <motion.p
                      key={agentActivity}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-chronicle-amber/70 text-xs font-sans mt-1 leading-snug"
                    >
                      {agentActivity}
                    </motion.p>
                  )}

                {state === "active" && step.id === "media" && (
                  <p className="text-chronicle-amber text-xs font-sans mt-1 font-medium">
                    {mediaSegments.length} / {totalSegments} images
                  </p>
                )}
                {state === "active" && step.id === "video" && (
                  <p className="text-chronicle-amber text-xs font-sans mt-1 font-medium">
                    {videoClips.length} clips rendered
                  </p>
                )}
                {state === "active" && step.id === "assembly" && assemblyPercent > 0 && (
                  <div className="mt-1.5 space-y-1">
                    <div className="h-0.5 bg-chronicle-border/50 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-chronicle-amber rounded-full"
                        animate={{ width: `${assemblyPercent}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                    <p className="text-chronicle-amber/80 text-xs font-mono">
                      {assemblyPercent}% · {assemblyStage}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        );
      })}

      {/* New documentary link — pinned to bottom */}
      <div className="mt-auto pt-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-chronicle-muted/40 text-xs font-sans hover:text-chronicle-muted/70 hover:bg-chronicle-border/20 transition-colors duration-200"
        >
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m-8-8h16" />
          </svg>
          New documentary
        </Link>
      </div>
    </aside>
  );
}

// ── Pending placeholder ───────────────────────────────────────────────────────

function PendingState({ label, sublabel }: { label: string; sublabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
      <motion.div
        className="w-8 h-8 rounded-full border-2 border-chronicle-amber/25 border-t-chronicle-amber"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
      />
      <div>
        <p className="text-chronicle-text font-serif text-lg">{label}</p>
        <p className="text-chronicle-muted/60 text-sm font-sans mt-1 max-w-xs leading-relaxed">{sublabel}</p>
      </div>
    </div>
  );
}

// ── Main ChronicleStream ──────────────────────────────────────────────────────

interface ChronicleStreamProps {
  sessionId: string;
}

export function ChronicleStream({ sessionId }: ChronicleStreamProps) {
  const [sseKey, setSseKey] = useState(0);
  useChronicleSSE(sessionId, sseKey);

  const {
    status,
    topic,
    eraStyle,
    researchBrief,
    documentarySegments,
    editableSegments,
    mediaSegments,
    videoClips,
    clipsStarted,
    characterReferenceImages,
    assemblyPercent,
    assemblyStage,
    finalVideoUrl,
    transcript,
    error,
    errorRecoverable,
    isAutonomous,
    setStatus,
    setIsAutonomous,
    resetResearch,
  } = useChronicleStore();

  const [retrying, setRetrying] = useState(false);
  const [restarting, setRestarting] = useState(false);

  async function handleRetry() {
    if (!sessionId || retrying) return;
    setRetrying(true);
    try {
      await retryPipeline(sessionId);
      setStatus("researching");
      setSseKey((k) => k + 1);   // reconnect SSE stream
    } catch {
      // keep error state visible
    } finally {
      setRetrying(false);
    }
  }

  const [activeTab, setActiveTab] = useState<TabId>("research");
  const [userPickedTab, setUserPickedTab] = useState(false);
  const totalVideoClips =
    editableSegments.length ||
    documentarySegments.length ||
    Object.keys(clipsStarted).length ||
    videoClips.length;

  useEffect(() => {
    if (!userPickedTab) setActiveTab(getAutoTab(status, characterReferenceImages.length > 0));
  }, [status, userPickedTab, characterReferenceImages.length]);

  useEffect(() => {
    if (status === "complete") {
      setActiveTab("documentary");
      setUserPickedTab(false);
    }
  }, [status]);

  async function handleRestartResearch(notes?: string) {
    if (!sessionId || restarting) return;
    setRestarting(true);
    try {
      await restartResearch(sessionId, notes);
      resetResearch();           // clear research state in store
      setSseKey((k) => k + 1);  // reconnect SSE
    } catch {
      // keep current state if restart fails
    } finally {
      setRestarting(false);
    }
  }

  async function handleCharacterReviewStarted(autonomous = false) {
    setIsAutonomous(autonomous);
    setUserPickedTab(false);
    setActiveTab("characters");

    // If manual, trigger character development now
    if (!autonomous && sessionId) {
      try {
        const { generateCharacters } = await import("@/lib/api");
        setStatus("generating_characters");
        await generateCharacters(sessionId);
        setSseKey((k) => k + 1); // Reconnect to see character discovery events
      } catch (err) {
        console.error("Failed to start character research:", err);
      }
    }
  }

  function handleNarrativeStarted() {
    // Immediately flip to "narrating" so the ResearchCard hides the "Write Story"
    // button, and auto-navigate to the Story tab so the user sees the narrative
    // writing progress (NarrativePipeline) right away.
    setStatus("narrating");
    setActiveTab("story");
    setUserPickedTab(false);
    setSseKey((k) => k + 1); // reconnect SSE for narrative phase
  }

  function handleStoryboardStarted() {
    setStatus("generating_media");
    setSseKey((k) => k + 1);
    setActiveTab("storyboard");
    setUserPickedTab(false);
  }

  function handleVideoStarted() {
    setStatus("generating_video");
    setSseKey((k) => k + 1);
    setActiveTab("video");
    setUserPickedTab(false);
  }

  const tabAvailable: Record<TabId, boolean> = {
    research: true, // Always available once started
    characters: ["generating_characters", "awaiting_narrative"].includes(status) ||
      (characterReferenceImages && characterReferenceImages.length > 0),
    story: [
      "narrating", "validating_narrative", "awaiting_storyboard",
      "generating_media", "awaiting_video", "generating_video",
      "assembling", "complete",
    ].includes(status) || editableSegments.length > 0 || documentarySegments.length > 0,
    storyboard: mediaSegments.length > 0 || ["generating_media", "awaiting_video"].includes(status),
    video: videoClips.length > 0 || ["generating_video", "assembling"].includes(status),
    documentary: !!finalVideoUrl,
  };

  return (
    <div className="flex gap-6 h-full">
      <AgentSidebar />

      {/* Divider */}
      <div className="w-px bg-chronicle-border/40 shrink-0" />

      {/* Right: topic header + tabs + content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 gap-5">
        {/* Topic header */}
        <motion.div
          initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ type: "spring", damping: 22, stiffness: 180 }}
          className="flex flex-col items-center gap-2 text-center shrink-0 pt-6"
        >
          <h2 className="text-chronicle-text font-serif text-3xl tracking-tight">{topic}</h2>
          {eraStyle && (
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-chronicle-amber/8 text-chronicle-amber border border-chronicle-amber/20 uppercase tracking-wide">
              {eraStyle}
            </span>
          )}
        </motion.div>

        {/* Error */}
        {error && (
          <div className={`p-3 rounded-xl border text-sm font-sans flex items-start justify-between gap-3 shrink-0 ${errorRecoverable
            ? "bg-orange-950/30 border-orange-800/50 text-orange-300"
            : "bg-red-950/30 border-red-800/50 text-red-400"
            }`}>
            <span>{error}</span>
            {errorRecoverable && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="shrink-0 px-3 py-1 rounded-lg border border-orange-600/50 text-orange-300 hover:bg-orange-900/40 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {retrying ? "Retrying…" : "Try Again"}
              </button>
            )}
          </div>
        )}

        {/* Tabs + content */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Tab bar with sliding indicator */}
          <div className="flex gap-0 justify-center border-b border-chronicle-border/40 mb-6 relative">
            {TABS.map((tab) => {
              const available = tabAvailable[tab.id];
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setUserPickedTab(true);
                  }}
                  disabled={!available}
                  className={`relative px-4 py-2.5 text-base font-sans transition-colors duration-200 whitespace-nowrap ${selected
                    ? "text-chronicle-amber"
                    : available
                      ? "text-chronicle-muted/60 hover:text-chronicle-muted"
                      : "text-chronicle-border/50 cursor-not-allowed"
                    }`}
                >
                  {tab.label}
                  {selected && (
                    <motion.div
                      layoutId="tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-px bg-chronicle-amber"
                      transition={{ type: "spring", damping: 30, stiffness: 300 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content stays mounted after first render so video elements keep their playback state. */}
          <div className="relative flex-1 min-h-0">
            {TABS.map((tab) => {
              const mounted = shouldMountTab(tab.id, activeTab, tabAvailable[tab.id]);
              if (!mounted) return null;

              return (
                <motion.div
                  key={tab.id}
                  initial={{ opacity: tab.id === activeTab ? 0 : 1, y: tab.id === activeTab ? 10 : 0, filter: tab.id === activeTab ? "blur(6px)" : "blur(0px)" }}
                  animate={{
                    opacity: activeTab === tab.id ? 1 : 0,
                    y: activeTab === tab.id ? 0 : 6,
                    filter: activeTab === tab.id ? "blur(0px)" : "blur(4px)",
                    pointerEvents: activeTab === tab.id ? "auto" : "none",
                  }}
                  transition={{ type: "spring", damping: 24, stiffness: 200 }}
                  className={activeTab === tab.id ? "h-full overflow-y-auto pr-1" : "absolute inset-x-0 top-0 h-0 overflow-hidden"}
                >
                  <div className="max-w-[1100px] mx-auto">
                    {tab.id === "research" && (
                      <div className="space-y-4">
                        <ResearchPipeline onRestart={handleRestartResearch} restarting={restarting} />
                        {researchBrief && (
                          <ResearchCard onCharacterReviewStarted={handleCharacterReviewStarted} />
                        )}
                      </div>
                    )}

                    {tab.id === "story" && (
                      status === "narrating" || status === "validating_narrative"
                        ? <NarrativePipeline />
                        : status === "awaiting_storyboard"
                          ? <NarrativeReview onStoryboardStarted={handleStoryboardStarted} />
                          : editableSegments.length > 0
                            ? <NarrativeActs segments={editableSegments} eraStyle={eraStyle} />
                            : documentarySegments.length > 0
                              ? <NarrativeActs segments={documentarySegments} eraStyle={eraStyle} />
                              : null
                    )}

                    {tab.id === "characters" && (
                      <CharacterPipeline
                        onStoryboardStarted={handleStoryboardStarted}
                        onNarrativeStarted={handleNarrativeStarted}
                      />
                    )}

                    {tab.id === "storyboard" && (
                      status === "awaiting_video"
                        ? <StoryboardReview onVideoStarted={handleVideoStarted} />
                        : editableSegments.length > 0
                          ? <StorySegmentList scriptSegments={editableSegments} mediaSegments={mediaSegments} />
                          : <PendingState label="Generating storyboard..." sublabel="Creating illustrated scenes with Gemini" />
                    )}

                    {tab.id === "video" && (
                      <div className="space-y-6">
                        <VideoClipProgress
                          sessionId={sessionId}
                          totalClips={totalVideoClips}
                          doneClips={videoClips.length}
                          status={status}
                          assemblyPercent={assemblyPercent}
                          assemblyStage={assemblyStage}
                        />
                      </div>
                    )}

                    {tab.id === "documentary" && (
                      finalVideoUrl
                        ? (
                          <div className="space-y-4">
                            <h3 className="text-chronicle-text font-serif text-xl tracking-tight">Your Documentary</h3>
                            <FinalPlayer url={finalVideoUrl} transcript={transcript} />
                          </div>
                        )
                        : <PendingState label="Assembling documentary..." sublabel="7-step ffmpeg pipeline: LUT grading, narration mix, titles" />
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
