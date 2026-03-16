"use client";
import { motion } from "framer-motion";
import { useChronicleStore } from "@/hooks/useChronicleStore";
import type { DocumentarySegment, EditableSegment } from "@/lib/types";

interface NarrativeActsProps {
  segments: Array<DocumentarySegment | EditableSegment>;
  eraStyle: string | null;
}

export function NarrativeActs({ segments, eraStyle }: NarrativeActsProps) {
  const { researchBrief } = useChronicleStore();

  if (segments.length === 0) return null;

  return (
    <div className="space-y-6">
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

      <div className="space-y-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-chronicle-muted/50 text-[10px] font-mono uppercase tracking-widest mb-1">Documentary script</p>
            <h3 className="text-chronicle-text font-serif text-xl tracking-tight">Story Structure</h3>
          </div>
          {eraStyle && (
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-chronicle-amber/8 text-chronicle-amber border border-chronicle-amber/20 uppercase tracking-wide shrink-0">
              {eraStyle}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {segments.map((seg, i) => (
            <motion.div
              key={seg.segment_number}
              initial={{ opacity: 0, x: -12, filter: "blur(6px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ delay: i * 0.06, type: "spring", damping: 22, stiffness: 200 }}
              className="flex items-start gap-4 p-4 rounded-xl bg-chronicle-bg-card border border-chronicle-border hover:border-chronicle-border/80 transition-colors"
            >
              {/* Segment number */}
              <span className="text-chronicle-amber font-serif text-base font-medium shrink-0 w-6 text-center pt-0.5">
                {seg.segment_number}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-chronicle-text font-serif text-sm">{seg.segment_title}</p>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-chronicle-border/60 text-chronicle-muted/60 uppercase tracking-wide">
                    {seg.visual_purpose}
                  </span>
                </div>
                {seg.emotional_beat && (
                  <p className="text-chronicle-muted/60 text-xs font-sans mt-1 italic leading-snug">
                    {seg.emotional_beat}
                  </p>
                )}
                {"narration_chunk" in seg && seg.narration_chunk && (
                  <p className="text-chronicle-text/85 text-sm font-sans mt-3 leading-relaxed">
                    {seg.narration_chunk}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
