"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { MediaSegment } from "@/lib/types";
import { resolveImageSrc } from "@/lib/api";

interface StorySegmentProps {
  segment: MediaSegment & { image_status?: "pending" | "ready" | "failed" | "stale" };
  index: number;
}

function Typewriter({ text, speed = 30 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const interval = setInterval(() => {
      if (i >= text.length) {
        clearInterval(interval);
        return;
      }
      setDisplayed(text.slice(0, i + 1));
      i++;
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      {displayed.length < text.length && (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-chronicle-amber align-middle" />
      )}
    </span>
  );
}

export function StorySegment({ segment, index }: StorySegmentProps) {
  const hasImage = Boolean(segment.image_b64 || segment.image_url);
  const isPending = !hasImage && segment.image_status !== "failed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      className="overflow-hidden rounded-2xl border border-chronicle-border bg-chronicle-bg-card"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-chronicle-border">
        {hasImage ? (
          <motion.img
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            src={resolveImageSrc(segment.image_b64, segment.image_mime, segment.image_url)}
            alt={segment.segment_title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900/70">
            {isPending && (
              <motion.span
                className="inline-block h-9 w-9 rounded-full border-2 border-chronicle-amber/25 border-t-chronicle-amber"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              />
            )}
            <div className="space-y-1 text-center">
              <p className="text-sm font-sans text-chronicle-muted/80">
                {isPending ? "Generating storyboard image..." : "Storyboard image unavailable"}
              </p>
              <p className="text-[10px] font-mono uppercase tracking-widest text-chronicle-muted/50">
                {isPending ? "Scaffold ready" : "Retry recommended"}
              </p>
            </div>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-chronicle-amber/40 bg-black/60 px-2.5 py-1 text-xs font-medium text-chronicle-amber">
              Seg {segment.segment_number}
            </span>
            <span className="truncate text-sm font-sans text-white/90">{segment.segment_title}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-5">
        <p className="text-base leading-relaxed text-chronicle-text font-serif">
          <Typewriter text={segment.narration_chunk} speed={isPending ? 12 : 20} />
        </p>
        <p className="text-[11px] font-mono uppercase tracking-widest text-chronicle-muted">
          Storyboard narration
        </p>
      </div>
    </motion.div>
  );
}
