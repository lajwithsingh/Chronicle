"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MosaicInput } from "@/components/ui/MosaicInput";
import { startGeneration } from "@/lib/api";
import { useChronicleStore } from "@/hooks/useChronicleStore";
import { Navbar } from "@/components/shared/Navbar";
import { Footer } from "@/components/shared/Footer";

const EXAMPLES = [
  "Apollo Moon Landing, 1969",
  "The Rise of Artificial Intelligence",
  "Marie Curie & Radioactivity",
  "The Discovery of Tutankhamun's Tomb",
  "Climate Crisis & Our Future",
];

// ── Animation variants ────────────────────────────────────────────────────────

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 28, filter: "blur(10px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring", damping: 22, stiffness: 180 },
  },
};

const fadeScale = {
  hidden: { opacity: 0, scale: 0.88, filter: "blur(6px)" },
  show: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { type: "spring", damping: 20, stiffness: 260 },
  },
};

const pillVariant = {
  hidden: { opacity: 0, scale: 0.9 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", damping: 18, stiffness: 280 },
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setSessionId, setTopic, setStatus, setIsAutonomous, reset } = useChronicleStore();

  const handleGenerate = async (data: { prompt: string; visualStyle?: string; voicePreference?: string; autonomous?: boolean }) => {
    if (!data.prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      reset();
      setTopic(data.prompt);
      setIsAutonomous(data.autonomous ?? false);
      setStatus("researching");
      const { session_id } = await startGeneration(
        data.prompt,
        undefined,
        data.visualStyle ?? "cinematic",
        data.voicePreference ?? "male",
        data.autonomous
      );
      setSessionId(session_id);
      router.push(`/chronicle/${session_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-chronicle-bg text-chronicle-text font-sans">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-20 relative overflow-hidden">
        {/* Dot grid */}
        <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />

        {/* Breathing glow */}
        <motion.div
          animate={{ scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] bg-chronicle-amber/5 blur-[130px] rounded-full pointer-events-none"
        />

        {/* Content */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="relative z-10 w-full max-w-3xl mx-auto flex flex-col items-center gap-8"
        >
          {/* Headline */}
          <motion.h1
            variants={fadeUp}
            className="font-serif text-6xl md:text-7xl text-center leading-[1.08] tracking-tight"
          >
            True Events.<br />
            <span className="italic text-chronicle-amber">Brought to Life.</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={fadeUp}
            className="text-chronicle-muted text-sm font-sans text-center max-w-xl leading-relaxed"
          >
            Transform real-world events into fully produced documentaries. Meticulous research, factual scripts, and cinematic visuals — powerfully crafted by AI.
          </motion.p>

          {/* Input */}
          <motion.div variants={fadeUp} className="w-full">
            {loading ? (
              <div className="flex flex-col items-center gap-4 py-10">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-9 h-9 border-2 border-chronicle-border border-t-chronicle-amber rounded-full"
                />
                <motion.p
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-chronicle-amber/80 font-mono text-[10px] tracking-widest uppercase"
                >
                  Starting pipeline...
                </motion.p>
              </div>
            ) : (
              <>
                <MosaicInput onSubmit={handleGenerate} loading={loading} />
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 text-red-400 text-xs font-sans text-center"
                  >
                    {error}
                  </motion.p>
                )}
              </>
            )}
          </motion.div>

          {/* Examples */}
          {!loading && (
            <motion.div variants={fadeUp} className="flex flex-col items-center gap-3">
              <p className="text-[10px] font-mono text-chronicle-muted/40 uppercase tracking-widest">
                Or try one of these
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((ex) => (
                  <motion.button
                    key={ex}
                    variants={pillVariant}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => handleGenerate({ prompt: ex })}
                    className="text-xs font-sans text-chronicle-muted/70 hover:text-chronicle-amber border border-chronicle-border/60 hover:border-chronicle-amber/30 px-3.5 py-1.5 rounded-full bg-chronicle-bg-card/40 transition-colors"
                  >
                    {ex}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
