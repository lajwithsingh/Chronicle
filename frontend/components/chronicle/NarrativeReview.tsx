"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { useChronicleStore } from "@/hooks/useChronicleStore";
import { generateNarrative, generateStoryboard, rewriteSegmentNarrative } from "@/lib/api";
import type { SegmentEdit } from "@/lib/types";

interface NarrativeReviewProps {
  onStoryboardStarted?: () => void;
}

export function NarrativeReview({ onStoryboardStarted }: NarrativeReviewProps) {
  const {
    sessionId,
    documentaryTitle,
    editableSegments,
    updateEditableSegment,
    setStatus,
    researchBrief,
  } = useChronicleStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedVeo, setExpandedVeo] = useState<Set<number>>(new Set());

  async function handleGenerateStoryboard(autonomous = false) {
    if (!sessionId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const edits: SegmentEdit[] = editableSegments.map((seg) => ({
        segment_number: seg.segment_number,
        narration_chunk: seg.narration_chunk,
        veo_prompt: seg.veo_prompt,
        segment_title: seg.segment_title,
      }));
      await generateStoryboard(sessionId, edits, autonomous);
      setStatus("generating_media");
      if (onStoryboardStarted) onStoryboardStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start storyboard generation");
      setLoading(false);
    }
  }

  function toggleVeo(segNum: number) {
    setExpandedVeo((prev) => {
      const next = new Set(prev);
      if (next.has(segNum)) {
        next.delete(segNum);
      } else {
        next.add(segNum);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header and Story Remake Action */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-chronicle-text font-serif text-xl leading-tight">
              {documentaryTitle ?? "Documentary Script"}
            </h3>
            <p className="text-chronicle-muted text-sm font-sans mt-1">
              Review and edit the narrative script before generating visuals.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
                onClick={() => handleGenerateStoryboard(true)}
                disabled={loading || editableSegments.length === 0}
                className={`px-4 py-2 rounded-xl text-xs font-sans font-semibold transition-all border h-[38px] flex items-center justify-center ${loading || editableSegments.length === 0
                  ? "border-chronicle-border text-chronicle-muted cursor-not-allowed"
                  : "border-chronicle-amber/30 text-chronicle-amber/80 hover:bg-chronicle-amber/5 hover:text-chronicle-amber"
                  }`}
              >
                {loading ? "Drawing..." : "Go Autonomous"}
            </button>
            <button
              onClick={() => handleGenerateStoryboard(false)}
              disabled={loading || editableSegments.length === 0}
              className={`px-4 py-2 rounded-xl text-xs font-sans font-semibold transition-all h-[38px] flex items-center justify-center ${loading || editableSegments.length === 0
                ? "bg-chronicle-border text-chronicle-muted cursor-not-allowed"
                : "bg-chronicle-amber text-chronicle-bg hover:opacity-90"
                }`}
              style={!(loading || editableSegments.length === 0) ? { background: "#CCFF00", color: "#111111" } : {}}
            >
              {loading ? "Drawing..." : "Generate Storyboard"}
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 ml-1.5 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Remake Story Panel */}
        <div className="p-4 border border-chronicle-border/30 rounded-xl bg-black/20 flex flex-col gap-3">
          <p className="text-sm text-chronicle-text font-medium">Want a completely different story direction?</p>
          <div className="flex gap-2">
            <input
              type="text"
              id="story-remake-input"
              placeholder="e.g. 'Make it more dramatic', 'Focus on the political aspects'"
              className="flex-1 bg-zinc-900 border border-chronicle-border rounded-lg px-3 py-2 text-sm text-chronicle-text focus:outline-none focus:border-chronicle-amber placeholder:text-zinc-600"
            />
            <button
              onClick={async () => {
                const input = document.getElementById('story-remake-input') as HTMLInputElement;
                if (!sessionId || !input.value) return;
                setLoading(true);
                try {
                  await generateNarrative(sessionId, { userNotes: input.value, autonomous: false });
                  input.value = '';
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to remake narrative");
                }
              }}
              disabled={loading}
              className="px-5 py-2 rounded-xl text-xs font-sans font-semibold transition-all h-[38px] flex items-center justify-center border border-chronicle-border/60 text-chronicle-text/80 hover:bg-white/5 hover:text-white shrink-0"
            >
              Remake Entire Story
            </button>
          </div>
        </div>
      </div>



      {/* Research context summary */}
      {researchBrief && (
        <div className="flex flex-col gap-4 p-5 rounded-xl bg-[#1A1A1A] border border-[#333333]">
          {researchBrief.defining_moment && (
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/30 block mb-1">
                Defining Moment
              </span>
              <p className="text-white/80 font-serif text-sm leading-relaxed">
                {researchBrief.defining_moment}
              </p>
            </div>
          )}
          {researchBrief.key_figures && researchBrief.key_figures.length > 0 && (
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-white/30 block mb-1.5">
                Key Figures
              </span>
              <div className="flex flex-wrap gap-2">
                {researchBrief.key_figures.map((fig, i) => (
                  <span key={i} className="text-[11px] px-2.5 py-0.5 rounded-full"
                    style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    {fig}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Segment cards */}
      <div className="space-y-4">
        {editableSegments.map((seg, i) => (
          <motion.div
            key={seg.segment_number}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl border border-chronicle-border bg-zinc-900/60 overflow-hidden"
          >
            {/* Segment header */}
            <div className="px-4 pt-4 pb-3 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-chronicle-amber/10 border border-chronicle-amber/30 flex items-center justify-center shrink-0">
                <span className="text-chronicle-amber text-xs font-sans font-semibold">
                  {seg.segment_number}
                </span>
              </span>
              <input
                type="text"
                value={seg.segment_title}
                onChange={(e) =>
                  updateEditableSegment(seg.segment_number, "segment_title", e.target.value)
                }
                className="flex-1 bg-transparent text-chronicle-text font-sans text-sm font-medium border-b border-transparent hover:border-chronicle-border focus:border-chronicle-amber outline-none transition-colors py-0.5"
                placeholder="Segment title"
              />
            </div>

            {/* Badges */}
            <div className="px-4 pb-3 flex gap-2 flex-wrap">
              <span className="text-xs font-sans px-2 py-0.5 rounded bg-zinc-800 text-chronicle-muted border border-chronicle-border">
                {seg.visual_purpose}
              </span>
              <span className="text-xs font-sans px-2 py-0.5 rounded bg-zinc-800 text-chronicle-muted border border-chronicle-border">
                {seg.emotional_beat}
              </span>
            </div>

            {/* Narration */}
            <div className="px-4 pb-3">
              <label className="text-xs font-sans text-chronicle-muted uppercase tracking-wider block mb-1.5">
                Narration
              </label>
              <textarea
                value={seg.narration_chunk}
                onChange={(e) =>
                  updateEditableSegment(seg.segment_number, "narration_chunk", e.target.value)
                }
                rows={3}
                className="w-full bg-zinc-800/60 border border-chronicle-border rounded-lg px-3 py-2 text-chronicle-text font-sans text-sm resize-none focus:border-chronicle-amber focus:outline-none transition-colors"
                placeholder="Documentary narration..."
              />
              
              {/* AI rewrite for this segment */}
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  id={`rewrite-prompt-${seg.segment_number}`}
                  placeholder="e.g. 'Make it sound more urgent'"
                  className="flex-1 bg-zinc-900 border border-chronicle-border rounded-lg px-3 py-1.5 text-xs text-chronicle-text focus:outline-none focus:border-chronicle-amber placeholder:text-zinc-600"
                />
                <button
                  onClick={async () => {
                    const input = document.getElementById(`rewrite-prompt-${seg.segment_number}`) as HTMLInputElement;
                    if (!sessionId || !input.value) return;
                    setLoading(true);
                    try {
                      await rewriteSegmentNarrative(sessionId, seg.segment_number, input.value);
                      input.value = '';
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed to rewrite segment");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="px-4 py-1.5 rounded-lg text-[11px] font-sans font-semibold transition-all h-[28px] flex items-center justify-center border border-chronicle-border/60 text-chronicle-text/80 hover:bg-white/5 hover:text-white shrink-0"
                >
                  AI Rewrite
                </button>
              </div>
            </div>

            {/* Veo Prompt — collapsible */}
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={() => toggleVeo(seg.segment_number)}
                className="flex items-center gap-2 text-xs font-sans text-chronicle-muted hover:text-chronicle-amber transition-colors mb-2"
              >
                <span className={`transition-transform ${expandedVeo.has(seg.segment_number) ? "rotate-90" : ""}`}>
                  ›
                </span>
                Veo Prompt
              </button>
              {expandedVeo.has(seg.segment_number) && (
                <textarea
                  value={seg.veo_prompt}
                  onChange={(e) =>
                    updateEditableSegment(seg.segment_number, "veo_prompt", e.target.value)
                  }
                  rows={5}
                  className="w-full bg-zinc-800/60 border border-chronicle-border rounded-lg px-3 py-2 text-chronicle-muted font-mono text-xs resize-none focus:border-chronicle-amber focus:outline-none transition-colors"
                  placeholder="Veo video generation prompt..."
                />
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-950/30 border border-red-800 rounded-lg text-red-400 text-sm font-sans">
          {error}
        </div>
      )}

      {/* Bottom action */}
      {editableSegments.length > 0 && (
        <div className="flex justify-end pt-2 gap-3">
          <button
              onClick={() => handleGenerateStoryboard(true)}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-sans font-semibold transition-all border border-chronicle-amber/30 text-chronicle-amber/80 hover:bg-chronicle-amber/5 hover:text-chronicle-amber h-[38px] flex items-center justify-center"
            >
              {loading ? "Generating..." : "Go Autonomous"}
          </button>
          <button
            onClick={() => handleGenerateStoryboard(false)}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl text-xs font-sans font-semibold transition-all h-[38px] flex items-center justify-center"
            style={{ background: "#CCFF00", color: "#111111" }}
          >
            {loading ? "Generating..." : "Generate Storyboard"}
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 ml-1.5 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
