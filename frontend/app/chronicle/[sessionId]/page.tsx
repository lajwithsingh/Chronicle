"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useChronicleStore } from "@/hooks/useChronicleStore";
import { ChronicleStream } from "@/components/chronicle/ChronicleStream";

export default function ChroniclePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const { sessionId: storedId, setSessionId, topic, status } = useChronicleStore();

  useEffect(() => {
    if (!storedId && sessionId) {
      setSessionId(sessionId);
    }
  }, [sessionId, storedId, setSessionId]);

  if (!sessionId) {
    router.push("/");
    return null;
  }

  return (
    <div className="flex flex-col h-screen bg-chronicle-bg text-chronicle-text font-sans relative overflow-hidden">
      {/* Dot grid */}
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />

      {/* Top ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[180px] bg-chronicle-amber/4 blur-[120px] rounded-full pointer-events-none" />

      {/* Main */}
      <main className="relative z-10 flex-1 overflow-hidden px-6 py-5">
        {status === "idle" && !topic ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-4">
              <motion.div
                className="w-8 h-8 rounded-full border-2 border-chronicle-amber/30 border-t-chronicle-amber"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              />
              <p className="text-chronicle-muted text-sm font-sans">Connecting...</p>
            </div>
          </div>
        ) : (
          <ChronicleStream sessionId={sessionId} />
        )}
      </main>
    </div>
  );
}
