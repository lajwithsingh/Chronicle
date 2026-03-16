"use client";
import { motion } from "framer-motion";

interface LoadingOrbProps {
  label?: string;
}

export function LoadingOrb({ label = "Processing..." }: LoadingOrbProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-12 h-12">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-chronicle-amber opacity-30"
          animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute inset-2 rounded-full bg-chronicle-amber"
          animate={{ scale: [1, 0.9, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <p className="text-chronicle-muted text-sm font-sans">{label}</p>
    </div>
  );
}
