"use client";
import { motion } from "framer-motion";
import { useVideoPlayer } from "@/hooks/useVideoPlayer";
import { resolveMediaUrl } from "@/lib/api";

interface FinalPlayerProps {
  url: string;
  transcript?: string | null;
}

export function FinalPlayer({ url, transcript }: FinalPlayerProps) {
  const {
    videoRef,
    playing,
    progress,
    duration,
    muted,
    toggle,
    toggleMute,
    seek,
    handleTimeUpdate,
    handleLoadedMetadata,
  } = useVideoPlayer();

  const pct = duration > 0 ? (progress / duration) * 100 : 0;
  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ type: "spring", damping: 22, stiffness: 160 }}
      className="space-y-4"
    >
      {/* Player */}
      <div className="relative w-full rounded-2xl overflow-hidden bg-black border border-chronicle-border shadow-2xl shadow-black/60">
        {/* Cinematic letterbox */}
        <div className="absolute top-0 left-0 right-0 h-5 bg-black z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-5 bg-black z-10 pointer-events-none" />

        <video
          ref={videoRef}
          src={resolveMediaUrl(url)}
          className="w-full"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => {}}
          playsInline
        />

        {/* Play/pause overlay */}
        <button
          onClick={toggle}
          className="absolute inset-0 flex items-center justify-center z-20 group"
          aria-label={playing ? "Pause" : "Play"}
        >
          {!playing && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-14 h-14 rounded-full bg-chronicle-amber/90 flex items-center justify-center backdrop-blur-sm group-hover:bg-chronicle-amber transition-colors"
            >
              <svg className="w-6 h-6 text-chronicle-bg ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </motion.div>
          )}
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 px-1">
        <button
          onClick={toggle}
          className="text-chronicle-muted/60 hover:text-chronicle-amber transition-colors"
        >
          {playing ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <span className="text-chronicle-muted/50 text-[11px] font-mono tabular-nums">
          {fmt(progress)} / {fmt(duration)}
        </span>

        {/* Scrubber */}
        <div
          className="flex-1 h-0.5 bg-chronicle-border/50 rounded-full cursor-pointer relative group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seek(((e.clientX - rect.left) / rect.width) * duration);
          }}
        >
          <div
            className="h-full bg-chronicle-amber rounded-full relative"
            style={{ width: `${pct}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-chronicle-amber opacity-0 group-hover:opacity-100 transition-opacity -translate-x-0.5" />
          </div>
        </div>

        <button
          onClick={toggleMute}
          className="text-chronicle-muted/60 hover:text-chronicle-amber transition-colors"
        >
          {muted ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97V10l2.45 2.45c.03-.15.05-.3.05-.45zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.76v2.06c2.89.86 5 3.54 5 6.7zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0 0 17.73 17L19 18.27 20.27 17 5.27 2 4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          )}
        </button>
      </div>

      {/* Transcript */}
      {transcript && (
        <details className="group">
          <summary className="text-chronicle-muted/50 text-[10px] font-mono uppercase tracking-widest cursor-pointer hover:text-chronicle-muted transition-colors list-none flex items-center gap-2">
            <svg className="w-3 h-3 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Transcript
          </summary>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 text-chronicle-muted/70 text-sm font-serif italic leading-relaxed border-l-2 border-chronicle-amber/20 pl-4"
          >
            {transcript}
          </motion.p>
        </details>
      )}
    </motion.div>
  );
}
