"use client";
import { motion } from "framer-motion";
import { useChronicleStore } from "@/hooks/useChronicleStore";
import { resolveImageSrc, resolveMediaUrl, regenerateVideoClip, regenerateVideoAll } from "@/lib/api";
import type { GenerationStatus } from "@/lib/types";
import { useState } from "react";

interface VideoClipProgressProps {
  sessionId: string;
  totalClips: number;
  doneClips: number;
  status: GenerationStatus;
  assemblyPercent: number;
  assemblyStage: string;
}

export function VideoClipProgress({
  sessionId,
  totalClips,
  doneClips,
  status,
  assemblyPercent,
  assemblyStage,
}: VideoClipProgressProps) {
  const { clipsStarted, videoClips, mediaSegments, setStatus } = useChronicleStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegenerateClip(segNum: number, prompt: string) {
    if (!sessionId || loading) return;
    setLoading(true);
    setError(null);
    try {
      await regenerateVideoClip(sessionId, segNum, prompt);
      // Backend will emit events, UI will update automatically via SSE
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate clip");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerateAll() {
    if (!sessionId || loading) return;
    if (!window.confirm("This will restart the entire video generation phase. Continue?")) return;
    setLoading(true);
    setError(null);
    try {
      await regenerateVideoAll(sessionId);
      setStatus("generating_video");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate video");
    } finally {
      setLoading(false);
    }
  }
  const isAssembling = status === "assembling";
  const pct = totalClips > 0 ? Math.round((doneClips / totalClips) * 100) : 0;

  // Build lookups
  const mediaBySegNum = new Map(mediaSegments.map((ms) => [ms.segment_number, ms]));
  const clipDoneByWindow = new Map(videoClips.map((c) => [c.window_index ?? -1, c]));

  // All window indices we know about (from clip_started events or clip_done events)
  const allWindowIndices = new Set<number>([
    ...Object.keys(clipsStarted).map(Number),
    ...videoClips.map((c) => c.window_index ?? -1).filter((i) => i >= 0),
  ]);
  const sortedWindows = Array.from(allWindowIndices).sort((a, b) => a - b);

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <motion.div
        initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ type: "spring", damping: 22, stiffness: 180 }}
        className="bg-chronicle-bg-card border border-chronicle-border rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-chronicle-muted/50 text-[10px] font-mono uppercase tracking-widest mb-1">
                {isAssembling ? "Assembling" : pct === 100 && assemblyPercent === 100 ? "Done" : "Rendering"}
              </p>
              <h3 className="text-chronicle-text font-serif text-xl tracking-tight">Video Generation</h3>
            </div>
            <span className="text-chronicle-amber font-mono text-sm font-medium tabular-nums">
              {doneClips} / {totalClips}
            </span>
          </div>

          {/* Remake Video Panel */}
          {pct === 100 && !isAssembling && assemblyPercent === 100 && (
            <div className="p-3 border border-chronicle-border/30 rounded-lg bg-black/20 flex flex-col gap-2">
              <div className="flex gap-2 items-center justify-between">
                <div>
                  <p className="text-xs text-chronicle-text font-medium">Want to remake the entire video?</p>
                  <p className="text-[10px] text-chronicle-muted">This will redraw every scene and reassemble them.</p>
                </div>
                <button
                  onClick={handleRegenerateAll}
                  disabled={loading}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-chronicle-text border border-chronicle-border rounded-md text-xs transition-colors font-medium whitespace-nowrap disabled:opacity-50"
                >
                  {loading ? "Restarting..." : "Regenerate Entire Video"}
                </button>
              </div>
            </div>
          )}
          {error && (
            <div className="p-2 bg-red-950/30 border border-red-800/50 rounded text-red-400 text-[10px] font-sans">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="h-1 bg-chronicle-border/50 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-chronicle-amber rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          <p className="text-chronicle-muted/50 text-[10px] font-mono">{pct}% clips complete</p>
        </div>

        {isAssembling && assemblyPercent > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-2 pt-2 border-t border-chronicle-border/40"
          >
            <div className="flex items-center justify-between">
              <p className="text-chronicle-muted/60 text-xs font-sans">{assemblyStage || "Assembling..."}</p>
              <p className="text-chronicle-amber text-xs font-mono font-medium">{assemblyPercent}%</p>
            </div>
            <div className="h-0.5 bg-chronicle-border/50 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-chronicle-amber rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${assemblyPercent}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Per-clip detail cards */}
      {sortedWindows.length > 0 && (
        <div className="space-y-4">
          <p className="text-chronicle-muted/50 text-[10px] font-mono uppercase tracking-widest">Clip details</p>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {sortedWindows.map((windowIdx) => {
              const started = clipsStarted[windowIdx];
              const done = clipDoneByWindow.get(windowIdx);
              const isDone = !!done;

              const segNum = started?.segment_number ?? done?.segment_number ?? windowIdx + 1;
              const segTitle = started?.segment_title ?? done?.segment_title ?? `Clip ${windowIdx + 1}`;
              const narration = started?.narration_text ?? done?.narration_text ?? "";
              const refSegNums = started?.reference_segment_numbers ?? [];
              const hasCollage = started?.has_character_collage ?? false;

              return (
                <motion.div
                  key={windowIdx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: windowIdx * 0.04, type: "spring", damping: 22, stiffness: 200 }}
                  className={`rounded-xl border overflow-hidden transition-colors ${
                    isDone
                      ? "border-chronicle-amber/30 bg-zinc-900/70"
                      : "border-chronicle-border bg-zinc-900/40"
                  }`}
                >
                  <div className="flex h-full flex-col">
                    <div className="relative aspect-video overflow-hidden bg-zinc-800">
                      {isDone && done?.clip_signed_url ? (
                        <video
                          src={resolveMediaUrl(done.clip_signed_url)}
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                          onMouseLeave={(e) => e.currentTarget.pause()}
                          className="w-full h-full object-cover cursor-pointer"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <motion.span
                            className="w-5 h-5 rounded-full border-2 border-chronicle-amber/25 border-t-chronicle-amber"
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                          />
                        </div>
                      )}
                      {/* Done badge */}
                      {isDone && (
                        <div className="absolute top-1.5 right-1.5">
                          <span className="w-4 h-4 rounded-full bg-chronicle-amber flex items-center justify-center">
                            <svg className="w-2.5 h-2.5 text-chronicle-bg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        </div>
                      )}
                      {/* Segment number */}
                      <div className="absolute top-1.5 left-1.5">
                        <span className="w-5 h-5 rounded-full bg-black/70 border border-chronicle-amber/40 flex items-center justify-center">
                          <span className="text-chronicle-amber text-[10px] font-mono font-semibold">{segNum}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <p className="text-chronicle-text font-sans text-xs font-medium leading-tight truncate flex-1">
                          {segTitle}
                        </p>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                          isDone
                            ? "bg-chronicle-amber/10 text-chronicle-amber border border-chronicle-amber/20"
                            : "bg-zinc-800 text-chronicle-muted/60 border border-chronicle-border"
                        }`}>
                          {isDone ? "done" : "rendering"}
                        </span>
                      </div>

                      {narration && (
                        <p className="line-clamp-3 text-sm leading-relaxed text-chronicle-muted font-sans italic">
                          "{narration}"
                        </p>
                      )}

                      {(refSegNums.length > 0 || hasCollage) && (
                        <div className="flex items-center gap-2">
                          <span className="text-chronicle-muted/40 text-[9px] font-mono uppercase tracking-wider shrink-0">
                            refs
                          </span>
                          <div className="flex gap-2">
                            {refSegNums.map((refSeg, ri) => {
                              const media = mediaBySegNum.get(refSeg);
                              return (
                                <div
                                  key={ri}
                                  className="relative h-12 w-12 shrink-0 overflow-hidden rounded border border-chronicle-border bg-zinc-800"
                                  title={ri === 0 ? `Start: Segment ${refSeg}` : `End: Segment ${refSeg}`}
                                >
                                  {(media?.image_b64 || media?.image_url) ? (
                                    <img
                                      src={resolveImageSrc(media?.image_b64, media?.image_mime, media?.image_url)}
                                      alt={`Ref ${refSeg}`}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <span className="text-chronicle-border/60 text-[8px] font-mono">{refSeg}</span>
                                    </div>
                                  )}
                                  {/* Label: S = start, E = end */}
                                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-center">
                                    <span className="text-[7px] font-mono text-chronicle-amber/80">
                                      {ri === 0 ? "S" : "E"}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                            {hasCollage && (
                              <div
                                className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-chronicle-border/60 bg-zinc-800"
                                title="Character collage reference"
                              >
                                <span className="text-chronicle-muted/40 text-[8px] font-mono">char</span>
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-center">
                                  <span className="text-[7px] font-mono text-chronicle-amber/60">C</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {isDone && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            id={`regen-video-prompt-${segNum}`}
                            placeholder="e.g. 'Make camera pan left'"
                            className="flex-1 bg-zinc-900 border border-chronicle-border rounded px-2 text-[10px] text-chronicle-text focus:outline-none focus:border-chronicle-amber placeholder:text-zinc-600"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleRegenerateClip(segNum, (e.target as HTMLInputElement).value);
                                (e.target as HTMLInputElement).value = '';
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const input = document.getElementById(`regen-video-prompt-${segNum}`) as HTMLInputElement;
                              handleRegenerateClip(segNum, input.value);
                              input.value = '';
                            }}
                            disabled={loading}
                            className="text-[10px] font-sans px-2.5 py-1.5 rounded border border-chronicle-border text-chronicle-muted hover:border-chronicle-amber hover:text-chronicle-amber bg-zinc-800 transition-colors whitespace-nowrap disabled:opacity-50"
                          >
                            {loading ? "Redrawing..." : "Redraw Clip"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
