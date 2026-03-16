"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { useChronicleStore } from "@/hooks/useChronicleStore";
import { generateVideo, getRegenerateImageUrl, resolveImageSrc } from "@/lib/api";
import type { MediaSegment, SegmentEdit } from "@/lib/types";

interface StoryboardReviewProps {
  onVideoStarted: () => void;
}

export function StoryboardReview({ onVideoStarted }: StoryboardReviewProps) {
  const {
    sessionId,
    editableSegments,
    mediaSegments,
    selectedStoryboardSegments,
    toggleStoryboardSegment,
    updateEditableSegment,
    updateMediaSegment,
    setStatus,
  } = useChronicleStore();

  const [regenerating, setRegenerating] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build a lookup from segment_number → MediaSegment
  const mediaBySegNum = new Map<number, MediaSegment>(
    mediaSegments.map((ms) => [ms.segment_number, ms]),
  );

  function handleRegenerate(segNum: number, prompt?: string) {
    if (!sessionId) return;
    setRegenerating((prev) => new Set(prev).add(segNum));

    import("@/lib/api").then(({ getRegenerateImageUrl }) => {
      const url = new URL(getRegenerateImageUrl(sessionId, segNum), window.location.origin);
      if (prompt) {
        url.searchParams.set("user_prompt", prompt);
      }
      
      const es = new EventSource(url.toString());

      es.addEventListener("segment_media_done", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          updateMediaSegment({
            segment_number: data.segment_number,
            segment_title: data.segment_title,
            narration_chunk: data.narration_chunk,
            image_b64: data.image_b64,
            image_url: data.image_url,
            image_mime: data.image_mime,
          });
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener("done", () => {
        es.close();
        setRegenerating((prev) => {
          const next = new Set(prev);
          next.delete(segNum);
          return next;
        });
      });

      es.onerror = () => {
        es.close();
        setRegenerating((prev) => {
          const next = new Set(prev);
          next.delete(segNum);
          return next;
        });
      };
    }); // <-- Close the .then block properly
  }

  async function handleGenerateVideo(autonomous = false) {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const { generateVideo } = await import("@/lib/api");
      const edits: SegmentEdit[] = editableSegments.map((seg) => ({
        segment_number: seg.segment_number,
        narration_chunk: seg.narration_chunk,
        veo_prompt: seg.veo_prompt,
        segment_title: seg.segment_title,
      }));
      await generateVideo(sessionId, edits, Array.from(selectedStoryboardSegments), autonomous);
      setStatus("generating_video");
      onVideoStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start video generation");
      setLoading(false);
    }
  }

  // Use editableSegments as the source of truth for segment order/count
  const segments = editableSegments.length > 0 ? editableSegments : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-chronicle-text font-serif text-xl leading-tight">Storyboard Review</h3>
          <p className="text-chronicle-muted text-sm font-sans mt-1">
            Review the storyboard images. Toggle segments to use as Veo visual reference, regenerate individual images, or edit narration.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Go Autonomous — runs video without further review */}
          <button
            onClick={async () => {
              if (!sessionId || loading) return;
              setLoading(true);
              setError(null);
              try {
                const edits = editableSegments.map((seg) => ({
                  segment_number: seg.segment_number,
                  narration_chunk: seg.narration_chunk,
                  veo_prompt: seg.veo_prompt,
                  segment_title: seg.segment_title,
                }));
                await generateVideo(sessionId, edits, Array.from(selectedStoryboardSegments), true);
                setStatus("generating_video");
                onVideoStarted();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to start autonomous video generation");
                setLoading(false);
              }
            }}
            disabled={loading}
            title="Skip review — generate video clips automatically"
            className={`px-4 py-2 rounded-xl text-xs font-sans font-semibold transition-all border h-[38px] flex items-center justify-center ${
              loading
                ? "border-chronicle-border text-chronicle-muted cursor-not-allowed"
                : "border-chronicle-amber/30 text-chronicle-amber/80 hover:bg-chronicle-amber/5 hover:text-chronicle-amber"
            }`}
          >
            {loading ? "Starting..." : "Go Autonomous"}
          </button>
          
          <button
            onClick={() => handleGenerateVideo(false)}
            disabled={loading}
            className={`px-5 py-2.5 rounded-xl text-xs font-sans font-semibold transition-all h-[38px] flex items-center justify-center ${
              loading
                ? "bg-chronicle-border text-chronicle-muted cursor-not-allowed"
                : "bg-chronicle-amber text-chronicle-bg hover:opacity-90"
            }`}
            style={!loading ? { background: "#CCFF00", color: "#111111" } : {}}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <motion.span
                  className="inline-block w-3.5 h-3.5 rounded-full border-2 border-chronicle-amber/40 border-t-chronicle-amber"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                />
                Starting...
              </span>
            ) : (
              <>
                Generate Video
                <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 ml-1.5 flex-shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Remake Storyboard Panel */}
      <div className="p-4 border border-chronicle-border/30 rounded-xl bg-black/20 flex flex-col gap-3">
        <p className="text-sm text-chronicle-text font-medium">Want to completely redraw everything?</p>
        <div className="flex gap-4 items-center">
            <button
            onClick={async () => {
              if (!sessionId) return;
              setLoading(true);
              try {
                const { generateStoryboard } = await import("@/lib/api");
                const edits: SegmentEdit[] = editableSegments.map((seg) => ({
                    segment_number: seg.segment_number,
                    narration_chunk: seg.narration_chunk,
                    veo_prompt: seg.veo_prompt,
                    segment_title: seg.segment_title,
                }));
                const autonomous = false; // We can't automatically bypass storyboard since it's regeneration.
                await generateStoryboard(sessionId, edits, autonomous);
                setStatus("generating_media");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to start autonomous video generation");
                setLoading(false);
              }
            }}
            disabled={loading}
            className="px-5 py-2 rounded-xl text-xs font-sans font-semibold transition-all h-[38px] flex items-center justify-center border border-chronicle-border/60 text-chronicle-text/80 hover:bg-white/5 hover:text-white shrink-0"
          >
            {loading ? "Drawing..." : "Regenerate Entire Storyboard"}
          </button>
          <p className="text-[11px] text-chronicle-muted/60 leading-tight">This will redraw every scene using the current script.</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-950/30 border border-red-800 rounded-lg text-red-400 text-sm font-sans">
          {error}
        </div>
      )}

      {/* Segment grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {segments.map((seg, i) => {
          const media = mediaBySegNum.get(seg.segment_number);
          const isSelected = selectedStoryboardSegments.has(seg.segment_number);
          const isRegenerating = regenerating.has(seg.segment_number);

          return (
            <motion.div
              key={seg.segment_number}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`rounded-xl border overflow-hidden transition-colors ${
                isSelected
                  ? "border-chronicle-amber/50 bg-zinc-900/80"
                  : "border-chronicle-border bg-zinc-900/40"
              }`}
            >
              {/* Storyboard image */}
              <div className="relative aspect-video bg-zinc-800 overflow-hidden">
                {(media?.image_b64 || media?.image_url) ? (
                  <img
                    src={resolveImageSrc(media?.image_b64, media?.image_mime, media?.image_url)}
                    alt={seg.segment_title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    {isRegenerating ? (
                      <motion.span
                        className="w-8 h-8 rounded-full border-2 border-chronicle-amber/30 border-t-chronicle-amber"
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      />
                    ) : (
                      <span className="text-chronicle-border text-xs font-sans">No image</span>
                    )}
                  </div>
                )}

                {isRegenerating && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <motion.span
                      className="w-8 h-8 rounded-full border-2 border-chronicle-amber/30 border-t-chronicle-amber"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    />
                  </div>
                )}

                {/* Segment number badge */}
                <div className="absolute top-2 left-2">
                  <span className="w-6 h-6 rounded-full bg-black/70 border border-chronicle-amber/40 flex items-center justify-center">
                    <span className="text-chronicle-amber text-xs font-sans font-semibold">
                      {seg.segment_number}
                    </span>
                  </span>
                </div>
              </div>

              {/* Card body */}
              <div className="p-3 space-y-3">
                {/* Title */}
                <p className="text-chronicle-text font-sans text-sm font-medium leading-tight truncate">
                  {seg.segment_title}
                </p>

                {/* Narration edit */}
                <textarea
                  value={seg.narration_chunk}
                  onChange={(e) =>
                    updateEditableSegment(seg.segment_number, "narration_chunk", e.target.value)
                  }
                  rows={2}
                  className="w-full bg-zinc-800/60 border border-chronicle-border rounded-lg px-2.5 py-1.5 text-chronicle-muted font-sans text-xs resize-none focus:border-chronicle-amber focus:outline-none transition-colors"
                  placeholder="Narration..."
                />

                {/* Actions row */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    {/* Veo reference toggle */}
                    <label className="flex items-center gap-2 cursor-pointer select-none group">
                      <div
                        onClick={() => toggleStoryboardSegment(seg.segment_number)}
                        className={`w-9 h-5 rounded-full transition-colors relative ${
                          isSelected ? "bg-chronicle-amber" : "bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                            isSelected ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </div>
                      <span className="text-xs font-sans text-chronicle-muted group-hover:text-chronicle-text transition-colors">
                        Veo reference
                      </span>
                    </label>
                  </div>

                  {/* Regenerate input and button */}
                  <div className="mt-1 flex gap-2">
                    <input
                      type="text"
                      id={`regen-prompt-${seg.segment_number}`}
                      placeholder="e.g. 'Make it closer to sunset'"
                      className="flex-1 bg-zinc-900 border border-chronicle-border rounded px-2 text-[10px] text-chronicle-text focus:outline-none focus:border-chronicle-amber placeholder:text-zinc-600"
                      disabled={isRegenerating}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById(`regen-prompt-${seg.segment_number}`) as HTMLInputElement;
                        handleRegenerate(seg.segment_number, input.value);
                        input.value = '';
                      }}
                      disabled={isRegenerating}
                      className="px-4 py-1.5 rounded-lg text-[11px] font-sans font-semibold transition-all h-[28px] flex items-center justify-center border border-chronicle-border/60 text-chronicle-text/80 hover:bg-white/5 hover:text-white shrink-0"
                    >
                      {isRegenerating ? "Redrawing..." : "Redraw"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Bottom action */}
      {segments.length > 0 && (
        <div className="flex justify-between items-center pt-2">
          <p className="text-chronicle-muted text-xs font-sans">
            {selectedStoryboardSegments.size} of {segments.length} segments selected as Veo reference
          </p>
          <div className="flex items-center gap-3">

          <button
            onClick={() => handleGenerateVideo(false)}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl text-xs font-sans font-semibold transition-all h-[38px] flex items-center justify-center"
            style={{ background: "#CCFF00", color: "#111111" }}
          >
            {loading ? "Starting..." : "Generate Video"}
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 ml-1.5 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </button>
          </div>
        </div>
      )}
    </div>
  );
}
