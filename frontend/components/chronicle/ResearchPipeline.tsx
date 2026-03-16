"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChronicleStore } from "@/hooks/useChronicleStore";
import type { GenerationStatus, PipelineLogEntry } from "@/lib/types";

// ── Agent definitions ──────────────────────────────────────────────────────────

interface AgentDef {
  key: string;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  matchEntry: (e: PipelineLogEntry) => boolean;
}

function IconSearch() {
  return (
    <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
    </svg>
  );
}
function IconMicroscope() {
  return (
    <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18l-2 2h4l-2-2zM12 18V9m0 0a3 3 0 100-6 3 3 0 000 6zM7 12l5 2 5-2" />
      <path d="M12 9s0-2-1-2-1 2-1 2 1 2 1 2 1-2 1-2z" />
    </svg>
  );
}
function IconColumns() {
  return (
    <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16M4 20h16M7 4v16M12 4v16M17 4v16" />
    </svg>
  );
}
function IconTemple() {
  return (
    <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10l9-5 9 5M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18" />
    </svg>
  );
}
function IconPen() {
  return (
    <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}
function IconScroll() {
  return (
    <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6.5A2.5 2.5 0 0110.5 4H18v13a3 3 0 01-3 3H9a3 3 0 110-6h9" />
      <path strokeLinecap="round" d="M10 8h5M10 11h5" />
    </svg>
  );
}
function IconBadge() {
  return (
    <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
function IconSparkFrame() {
  return (
    <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
      <rect x="4" y="5" width="16" height="12" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19h6M12 9l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
    </svg>
  );
}

const AGENT_PRESENTATION: Record<string, Pick<AgentDef, "label" | "sublabel" | "icon">> = {
  research_agent: {
    label: "Research Agent",
    sublabel: "Historical context",
    icon: <IconSearch />,
  },
  era_intel: {
    label: "EraResearch Agent",
    sublabel: "Clothing and architecture",
    icon: <IconTemple />,
  },
  fact_checker: {
    label: "Research Validator",
    sublabel: "Verification and sources",
    icon: <IconBadge />,
  },
  narrative_writer: {
    label: "Narrative Agent",
    sublabel: "8-11 segment script",
    icon: <IconScroll />,
  },
  script_validator: {
    label: "Narrative Validator",
    sublabel: "Veo prompt quality check",
    icon: <IconBadge />,
  },
};

const RESEARCH_AGENTS: AgentDef[] = [
  {
    key: "research_agent", label: "Research Agent", sublabel: "Google Search · sources",
    icon: <IconSearch />,
    matchEntry: (e) => e.stage === "research" && e.step === "researching",
  },
  {
    key: "era_intel", label: "Era Intelligence", sublabel: "Clothing · tech · film",
    icon: <IconColumns />,
    matchEntry: (e) => e.stage === "research" && e.step === "era_research",
  },
  {
    key: "fact_checker", label: "Fact Checker", sublabel: "Dates · figures · validation",
    icon: <IconMicroscope />,
    matchEntry: (e) => e.stage === "research" && ["validating", "pass", "fail"].includes(e.step),
  },
];

// ── State derivation ──────────────────────────────────────────────────────────

type AgentState = "pending" | "active" | "done" | "retrying";

function deriveState(
  agent: AgentDef, agentIdx: number, activeIdx: number,
  running: boolean, log: PipelineLogEntry[],
): AgentState {
  const entries = log.filter(agent.matchEntry);
  const hasFail = entries.some((e) => e.step === "fail");
  const hasPass = entries.some((e) => e.step === "pass");
  if (agentIdx < activeIdx) return "done";
  if (agentIdx === activeIdx) {
    if (!running) return "done";
    if (hasFail && !hasPass) return "retrying";
    return "active";
  }
  return "pending";
}

// ── Agent card ────────────────────────────────────────────────────────────────

function AgentCard({ agent, state }: { agent: AgentDef; state: AgentState }) {
  const display = AGENT_PRESENTATION[agent.key] ?? agent;
  const isActive = state === "active";
  const isDone = state === "done";
  const isRetrying = state === "retrying";
  const isPending = state === "pending";
  const isWorking = isActive || isRetrying;

  const iconColor = isWorking ? "#CCFF00"
      : isDone ? "rgba(255,255,255,0.6)"
        : "rgba(255,255,255,0.2)";

  const cardBorder = isWorking ? "2px solid #CCFF00"
      : isDone ? "1px solid rgba(255,255,255,0.1)"
        : "1px solid rgba(255,255,255,0.05)";

  const cardBg = isWorking ? "rgba(204,255,0,0.03)"
    : "transparent";

  const statusLabel = isActive ? "Running"
    : isRetrying ? "Retrying"
      : isDone ? "Done"
        : "Waiting";
  const statusColor = isWorking ? "#CCFF00"
      : isDone ? "rgba(255,255,255,0.5)"
        : "rgba(255,255,255,0.2)";

  return (
    <motion.div
      animate={{ opacity: isPending ? 0.45 : 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center gap-4"
    >
      {/* Icon card */}
      <div className="relative">
        <div
          className="w-[84px] h-[84px] rounded-2xl flex items-center justify-center relative overflow-hidden transition-colors duration-500"
          style={{ background: cardBg, border: cardBorder }}
        >
          {/* Inner animated icon */}
          <motion.div
            className="w-12 h-12 flex items-center justify-center"
            style={{ color: iconColor }}
            animate={isWorking ? { rotate: 360 } : { rotate: 0 }}
            transition={isWorking ? { repeat: Infinity, duration: 4, ease: "linear" } : {}}
          >
            {display.icon}
          </motion.div>

          {/* Done checkmark overlay (Lime Highlighted) */}
          {isDone && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: "#CCFF00", border: "1px solid #CCFF00" }}
            >
              <svg width="10" height="10" fill="none" stroke="#111111" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
          )}
        </div>
      </div>

      {/* Label */}
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-[15px] font-sans font-bold leading-tight"
          style={{ color: isWorking || isDone ? "#ffffff" : "rgba(255,255,255,0.4)" }}>
          {display.label}
        </span>
        <span className="text-[11px] font-sans"
          style={{ color: isWorking || isDone ? "rgba(255,255,255,0.48)" : "rgba(255,255,255,0.28)" }}>
          {display.sublabel}
        </span>
        {/* Status text (no background pill) */}
        <span className="text-[12px] font-sans font-medium"
          style={{ color: statusColor }}>
          {statusLabel}
        </span>
      </div>
    </motion.div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function computeProgress(log: PipelineLogEntry[], status: GenerationStatus): number {
  if (status === "validating_research") return 88;
  if (status === "era_researching") return 62;
  if (status === "researching") return 24;

  const hasResearch = log.some((e) => e.stage === "research" && e.step === "researching");
  const hasEra = log.some((e) => e.stage === "research" && e.step === "era_research");
  const hasValidation = log.some((e) => e.stage === "research" && ["validating", "pass", "fail"].includes(e.step));
  if (hasValidation) return 88;
  if (hasEra) return 62;
  if (hasResearch) return 24;
  return 5;
}

function getResearchStageCopy(status: GenerationStatus) {
  if (status === "validating_research") {
    return {
      title: "Validating Your Research",
      subtitle: "Verifying facts before we unlock the next stage",
      footer: "The research brief will appear after validation completes",
    };
  }

  if (status === "era_researching") {
    return {
      title: "Researching Your Story",
      subtitle: "Building the era bible for accurate visuals and tone",
      footer: "Results will appear automatically when complete",
    };
  }

  return {
    title: "Researching Your Story",
    subtitle: "Three specialized agents working in sequence",
    footer: "Results will appear automatically when complete",
  };
}

// ── Compact "done" strip shown after research completes ───────────────────────

function ResearchDoneStrip({
  onRestart, restarting,
}: {
  onRestart: (notes?: string) => void;
  restarting: boolean;
}) {
  const [expanding, setExpanding] = useState(false);
  const [notes, setNotes] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanding) inputRef.current?.focus();
  }, [expanding]);

  function handleCancel() {
    setExpanding(false);
    setNotes("");
  }

  function handleGo() {
    onRestart(notes.trim() || undefined);
    setExpanding(false);
    setNotes("");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden"
      style={{ background: "rgba(204,255,0,0.05)", border: "1px solid rgba(204,255,0,0.18)" }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(204,255,0,0.2)", border: "1px solid rgba(204,255,0,0.4)" }}>
            <svg width="8" height="8" fill="none" stroke="#CCFF00" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <span className="text-[11px] font-mono" style={{ color: "rgba(204,255,0,0.7)" }}>
            Research · Fact Check · Era Intelligence — complete
          </span>
        </div>
        {!expanding && (
          <button
            onClick={() => setExpanding(true)}
            disabled={restarting}
            className="text-[10px] font-mono transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            {restarting ? "Restarting…" : "↺ restart"}
          </button>
        )}
      </div>

      {/* Expandable guidance input */}
      <AnimatePresence>
        {expanding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-0 border-t" style={{ borderColor: "rgba(204,255,0,0.12)" }}>
              <p className="text-[10px] font-mono uppercase tracking-widest mb-2 mt-2.5"
                style={{ color: "rgba(255,255,255,0.25)" }}>
                What should we focus on differently? (optional)
              </p>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleGo();
                    if (e.key === "Escape") handleCancel();
                  }}
                  placeholder="e.g. focus on the economic impact, include more common people…"
                  className="flex-1 text-[12px] font-sans px-3 py-1.5 rounded-lg bg-transparent focus:outline-none"
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    caretColor: "#CCFF00",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(204,255,0,0.3)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                />
                <button
                  onClick={handleCancel}
                  className="text-[11px] font-sans px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleGo}
                  disabled={restarting}
                  className="text-[11px] font-sans font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                  style={{ background: "rgba(204,255,0,0.15)", color: "#CCFF00", border: "1px solid rgba(204,255,0,0.3)" }}
                >
                  {restarting ? "Restarting…" : "Restart →"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface ResearchPipelineProps {
  onRestart?: (notes?: string) => void;
  restarting?: boolean;
}

export function ResearchPipeline({ onRestart, restarting = false }: ResearchPipelineProps) {
  const { pipelineLog, status } = useChronicleStore();

  const running = ["researching", "era_researching", "validating_research"].includes(status);
  const researchDone = [
    "generating_characters", "awaiting_narrative", "narrating", "validating_narrative", "awaiting_storyboard",
    "generating_media", "awaiting_video", "generating_video", "assembling", "complete",
  ].includes(status);

  // Find active agent index among research agents only
  let activeIndex = -1;
  for (let i = pipelineLog.length - 1; i >= 0; i--) {
    const idx = RESEARCH_AGENTS.findIndex((s) => s.matchEntry(pipelineLog[i]));
    if (idx >= 0) { activeIndex = idx; break; }
  }

  // Live message from most recent research log entry
  const researchEntries = pipelineLog.filter((e) => e.stage === "research");
  const lastEntry = researchEntries[researchEntries.length - 1];
  const liveMessage = lastEntry?.message ?? "";
  const stageCopy = getResearchStageCopy(status);

  const progress = pipelineLog.length > 0
    ? (researchDone ? 100 : computeProgress(pipelineLog, status))
    : 0;

  // ── When research done → compact strip ────────────────────────────────────
  if (researchDone) {
    return onRestart
      ? <ResearchDoneStrip onRestart={onRestart} restarting={restarting} />
      : null;
  }

  // ── Nothing started yet ────────────────────────────────────────────────────
  if (pipelineLog.length === 0 && !running) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col flex-1 w-full max-w-4xl mx-auto py-12 px-4 gap-12"
    >
      {/* Header */}
      <div className="flex flex-col items-center gap-3 text-center w-full">
        <span className="text-[10px] font-sans font-bold uppercase tracking-[0.3em]"
          style={{ color: "#CCFF00" }}>
          AI Production Pipeline
        </span>
        <h3 className="text-[32px] md:text-[40px] font-sans font-bold tracking-tight leading-none"
          style={{ color: "#ffffff" }}>
          {stageCopy.title}
        </h3>
        <p className="text-[16px] font-sans mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
          {stageCopy.subtitle}
        </p>
      </div>

      {/* Agent cards */}
      <div className="flex items-start justify-center gap-12 md:gap-20 w-full mt-4">
        {RESEARCH_AGENTS.map((agent, i) => {
          const state = deriveState(agent, i, activeIndex, running, pipelineLog);
          return (
            <AgentCard key={agent.key} agent={agent} state={state} />
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-2xl mx-auto space-y-4 mt-12">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-sans font-medium uppercase tracking-[0.1em]"
            style={{ color: "rgba(255,255,255,0.3)" }}>
            Overall Progress
          </span>
          <span className="text-[11px] font-sans font-bold" style={{ color: "#CCFF00" }}>
            {progress}%
          </span>
        </div>
        <div className="h-[2px] w-full bg-chronicle-bg-card relative rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.08)" }}>
          <motion.div
            className="absolute top-0 left-0 h-full rounded-full"
            style={{ background: "linear-gradient(90deg, rgba(204,255,0,0.5), #CCFF00)" }}
            initial={{ width: "0%" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>

        {/* Live message */}
        <div className="min-h-[24px] flex items-center justify-center mt-2">
          <AnimatePresence mode="wait">
            {liveMessage && running && (
              <motion.p
                key={liveMessage}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-[13px] font-sans italic text-center"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                {liveMessage}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <p className="text-[11px] font-sans font-medium text-center uppercase tracking-[0.15em] mt-12"
          style={{ color: "rgba(255,255,255,0.2)" }}>
          {stageCopy.footer}
        </p>
      </div>
    </motion.div>
  );
}

// ── Narrative pipeline shown on the Story tab while writing ──────────────────

const NARRATIVE_AGENTS: AgentDef[] = [
  {
    key: "narrative_writer", label: "Narrative Writer", sublabel: "8–11 segment script",
    icon: <IconPen />,
    matchEntry: (e) => e.stage === "script" && e.step === "writing",
  },
  {
    key: "script_validator", label: "Script Validator", sublabel: "Veo prompt quality",
    icon: <IconBadge />,
    matchEntry: (e) => e.stage === "script" && ["validating", "pass", "fail"].includes(e.step),
  },
];

function computeNarrativeProgress(log: PipelineLogEntry[], status: GenerationStatus): number {
  if (status === "validating_narrative") return 86;
  if (status === "narrating") return 42;
  if (["awaiting_storyboard", "generating_media", "awaiting_video", "generating_video", "assembling", "complete"].includes(status)) {
    return 100;
  }

  const hasWriting = log.some((e) => e.stage === "script" && e.step === "writing");
  const hasValidating = log.some((e) => e.stage === "script" && ["validating", "pass", "fail"].includes(e.step));
  if (hasValidating) return 86;
  if (hasWriting) return 42;
  return 5;
}

function getNarrativeStageCopy(status: GenerationStatus) {
  if (status === "validating_narrative") {
    return {
      title: "Validating Your Story",
      subtitle: "Checking narration flow and Veo prompt quality",
      footer: "The final story appears after validation completes",
    };
  }

  return {
    title: "Writing Your Story",
    subtitle: "Two specialized agents working in sequence",
    footer: "Results will appear automatically when complete",
  };
}

export function NarrativePipeline() {
  const { pipelineLog, status } = useChronicleStore();

  const running = ["narrating", "validating_narrative"].includes(status);

  let activeIndex = -1;
  for (let i = pipelineLog.length - 1; i >= 0; i--) {
    const idx = NARRATIVE_AGENTS.findIndex((s) => s.matchEntry(pipelineLog[i]));
    if (idx >= 0) { activeIndex = idx; break; }
  }

  const scriptEntries = pipelineLog.filter((e) => e.stage === "script");
  const lastEntry = scriptEntries[scriptEntries.length - 1];
  const liveMessage = lastEntry?.message ?? "";
  const stageCopy = getNarrativeStageCopy(status);

  const progress = computeNarrativeProgress(pipelineLog, status);

  if (!running && scriptEntries.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col flex-1 w-full max-w-4xl mx-auto py-12 px-4 gap-12"
    >
      {/* Header */}
      <div className="flex flex-col items-center gap-3 text-center w-full">
        <span className="text-[10px] font-sans font-bold uppercase tracking-[0.3em]"
          style={{ color: "#CCFF00" }}>
          AI Production Pipeline
        </span>
        <h3 className="text-[32px] md:text-[40px] font-sans font-bold tracking-tight leading-none"
          style={{ color: "#ffffff" }}>
          {stageCopy.title}
        </h3>
        <p className="text-[16px] font-sans mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
          {stageCopy.subtitle}
        </p>
      </div>

      {/* Agent cards */}
      <div className="flex items-start justify-center gap-12 md:gap-20 w-full mt-4">
        {NARRATIVE_AGENTS.map((agent, i) => {
          const state = deriveState(agent, i, activeIndex, running, pipelineLog);
          return (
            <AgentCard key={agent.key} agent={agent} state={state} />
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-2xl mx-auto space-y-4 mt-12">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-sans font-medium uppercase tracking-[0.1em]"
            style={{ color: "rgba(255,255,255,0.3)" }}>
            Overall Progress
          </span>
          <span className="text-[11px] font-sans font-bold" style={{ color: "#CCFF00" }}>
            {progress}%
          </span>
        </div>
        <div className="h-[2px] w-full bg-chronicle-bg-card relative rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.08)" }}>
          <motion.div
            className="absolute top-0 left-0 h-full rounded-full"
            style={{ background: "linear-gradient(90deg, rgba(204,255,0,0.5), #CCFF00)" }}
            initial={{ width: "0%" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>

        <div className="min-h-[24px] flex items-center justify-center mt-2">
          <AnimatePresence mode="wait">
            {liveMessage && running && (
              <motion.p
                key={liveMessage}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-[13px] font-sans italic text-center"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                {liveMessage}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <p className="text-[11px] font-sans font-medium text-center uppercase tracking-[0.15em] mt-12"
          style={{ color: "rgba(255,255,255,0.2)" }}>
          {stageCopy.footer}
        </p>
      </div>
    </motion.div>
  );
}
