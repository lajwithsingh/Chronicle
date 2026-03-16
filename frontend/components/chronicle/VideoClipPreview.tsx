"use client";
import { motion } from "framer-motion";
import type { VideoClip } from "@/lib/types";
import { resolveMediaUrl } from "@/lib/api";

interface VideoClipPreviewProps {
  clips: VideoClip[];
}

export function VideoClipPreview({ clips }: VideoClipPreviewProps) {
  if (clips.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-chronicle-muted/50 text-[10px] font-mono uppercase tracking-widest">Clip previews</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {clips.map((clip, i) => (
          <motion.div
            key={clip.window_index ?? i}
            initial={{ opacity: 0, scale: 0.92, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ delay: i * 0.08, type: "spring", damping: 20, stiffness: 220 }}
            className="relative aspect-video rounded-xl overflow-hidden bg-chronicle-bg-card border border-chronicle-border group"
          >
            <video
              src={resolveMediaUrl(clip.clip_signed_url)}
              muted
              loop
              playsInline
              preload="metadata"
              onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
              onMouseLeave={(e) => e.currentTarget.pause()}
              className="w-full h-full object-cover cursor-pointer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="absolute bottom-0 left-0 right-0 px-2.5 py-2 translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
              <p className="text-white text-xs font-sans truncate">{clip.segment_title}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
