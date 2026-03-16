"use client";

import { useState, useEffect } from "react";
import { useChronicleStore } from "@/hooks/useChronicleStore";
import { motion, AnimatePresence } from "framer-motion";
import { generateStoryboard } from "@/lib/api";
import { resolveImageSrc } from "@/lib/api";
import type { SegmentEdit } from "@/lib/types";

interface CharacterPipelineProps {
    onStoryboardStarted?: () => void;
    onNarrativeStarted?: () => void;
}

export function CharacterPipeline({ onStoryboardStarted, onNarrativeStarted }: CharacterPipelineProps) {
    const {
        characterReferenceImages,
        characterCollageB64,
        sessionId,
        researchBrief,
        userNotes,
        editableSegments,
        setStatus,
        status,
        agentActivity,
        isAutonomous
    } = useChronicleStore();

    const [loading, setLoading] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Autonomous transitions
    useEffect(() => {
        if (!isAutonomous || loading || searchLoading) return;

        if (status === "awaiting_narrative") {
            handleWriteStory(true);
        } else if (status === "awaiting_storyboard") {
            handleGenerateStoryboard(true);
        }
    }, [isAutonomous, status, loading, searchLoading]);

    async function handleManualGenerateCharacters(prompt?: string) {
        if (!sessionId) return;
        setSearchLoading(true);
        setError(null);
        try {
            const { generateCharacters } = await import("@/lib/api");
            setStatus("generating_characters");
            await generateCharacters(sessionId, prompt);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to search for characters");
            setStatus("awaiting_narrative");
        } finally {
            setSearchLoading(false);
        }
    }

    async function handleWriteStory(autonomous = false) {
        if (!sessionId || !researchBrief || loading) return;
        setLoading(true);
        setError(null);
        try {
            const { generateNarrative } = await import("@/lib/api");
            await generateNarrative(sessionId, {
                definingMoment: researchBrief.defining_moment,
                keyFigures: researchBrief.key_figures,
                briefSummary: researchBrief.brief_summary,
                detectedYear: researchBrief.detected_year,
                eraStyle: researchBrief.era_style,
                styleBible: researchBrief.style_bible,
                userNotes: userNotes || undefined,
                autonomous: autonomous,
            });
            onNarrativeStarted?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to start story generation");
        } finally {
            setLoading(false);
        }
    }

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
        } finally {
            setLoading(false);
        }
    }

    const isGenerating = status === "generating_characters";
    const isAwaitingNarrative = status === "awaiting_narrative";
    const isAwaitingStoryboard = status === "awaiting_storyboard";

    const content = isGenerating ? (
        <div className="flex flex-col items-center justify-center p-20 text-chronicle-muted gap-8 border border-chronicle-border/20 rounded-3xl bg-black/20">
            <div className="relative">
                <motion.div
                    animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-32 h-32 rounded-full bg-chronicle-amber/20 flex items-center justify-center"
                >
                    <div className="w-20 h-28 bg-chronicle-amber/10 rounded-t-full relative overflow-hidden">
                        <motion.div
                            animate={{ y: [40, -40], opacity: [0, 1, 0] }}
                            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                            className="absolute inset-0 bg-gradient-to-t from-transparent via-chronicle-amber/40 to-transparent"
                        />
                    </div>
                </motion.div>
                <div className="absolute inset-0 border border-chronicle-amber/30 rounded-full animate-spin-slow opacity-20"
                    style={{ animationDuration: '8s' }} />
            </div>

            <div className="flex flex-col items-center gap-2">
                <h4 className="text-chronicle-text font-serif text-lg animate-pulse">
                    Scanning Archives
                </h4>
                <p className="text-xs font-mono text-chronicle-muted uppercase tracking-widest text-center max-w-xs">
                    Searching web for verified portraits & mapping facial features...
                </p>
                {agentActivity && (
                    <div className="mt-4 px-3 py-1 bg-chronicle-border/40 rounded-full border border-chronicle-border/60">
                        <span className="text-[10px] font-mono text-chronicle-amber">{agentActivity}</span>
                    </div>
                )}
            </div>
        </div>
    ) : (!characterReferenceImages || characterReferenceImages.length === 0) ? (
        <div className="flex flex-col items-center justify-center p-20 text-chronicle-muted border border-dashed border-chronicle-border/30 rounded-3xl bg-black/10 gap-6">
            <div className="flex flex-col items-center gap-2">
                <p className="font-sans text-sm italic">No character references found yet.</p>
                <p className="text-[10px] font-mono text-chronicle-muted uppercase tracking-widest">
                    Manual research required for primary figures.
                </p>
            </div>

            <button
                onClick={() => handleManualGenerateCharacters()}
                disabled={searchLoading}
                className="flex items-center gap-2.5 px-5 py-2 rounded-xl text-xs font-sans font-semibold transition-all h-[38px] justify-center"
                style={{ background: "#CCFF00", color: "#111111" }}
            >
                {searchLoading ? (
                    <>
                        <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        Scanning...
                    </>
                ) : (
                    <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                        Search Characters Now
                    </>
                )}
            </button>
        </div>
    ) : (
        <div className="space-y-12">
            {/* Collage section */}
            {characterCollageB64 && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col gap-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-chronicle-amber animate-pulse" />
                        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">
                            Style-Adaptive Character Collage
                        </span>
                    </div>
                    <div className="relative rounded-2xl overflow-hidden border border-chronicle-amber/20 bg-black/40 p-1">
                        <img
                            src={resolveImageSrc(characterCollageB64)}
                            alt="Character Collage"
                            className="w-full h-auto rounded-xl object-cover grayscale-[0.3] hover:grayscale-0 transition-all duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                    </div>
                    <p className="text-[11px] text-chronicle-muted/60 leading-relaxed max-w-xl">
                        This collage is converted into the selected visual style and used as the primary continuity
                        anchor for storyboard and video generation. It keeps character identity stable while matching
                        the same rendering style you chose for the documentary.
                    </p>
                </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-sans">
                {characterReferenceImages.map((b64, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20, delay: idx * 0.1 }}
                        className="flex flex-col gap-3"
                    >
                        <div className="relative aspect-square rounded-2xl overflow-hidden border border-chronicle-border/40 bg-chronicle-elements shadow-md">
                            <img
                                src={resolveImageSrc(b64)}
                                alt={`Character ${idx + 1} Reference`}
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                            <div className="absolute bottom-3 left-4 text-[10px] font-mono font-medium text-white/90 uppercase tracking-widest">
                                Raw Reference {idx + 1}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Retry Panel */}
            <div className="p-4 border border-chronicle-border/30 rounded-xl bg-black/20 flex flex-col gap-3">
                <p className="text-sm text-chronicle-text font-medium">Not quite right?</p>
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="e.g. 'Make the main character older', 'Include a female scientist'"
                        id="character-prompt-input"
                        className="flex-1 bg-zinc-900 border border-chronicle-border rounded-lg px-3 py-2 text-sm text-chronicle-text focus:outline-none focus:border-chronicle-amber placeholder:text-zinc-600"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleManualGenerateCharacters((e.target as HTMLInputElement).value);
                                (e.target as HTMLInputElement).value = '';
                            }
                        }}
                    />
                    <button
                        onClick={() => {
                            const input = document.getElementById('character-prompt-input') as HTMLInputElement;
                            handleManualGenerateCharacters(input.value);
                            input.value = '';
                        }}
                        disabled={searchLoading}
                        className="px-5 py-2 rounded-xl text-xs font-sans font-semibold transition-all h-[38px] flex items-center justify-center border border-chronicle-border/60 text-chronicle-text/80 hover:bg-white/5 hover:text-white"
                    >
                        {searchLoading ? 'Retrying...' : 'Retry Generation'}
                    </button>
                </div>
            </div>

            {/* Stage Transitions */}
            {isAwaitingNarrative && (
                <div className="pt-12 border-t border-chronicle-border/30 flex flex-col items-center gap-6">
                    <div className="text-center space-y-2">
                        <p className="text-sm font-sans text-chronicle-text font-medium">Research & Characters Confirmed?</p>
                        <p className="text-xs font-sans text-chronicle-muted">Proceed to generate the full documentary narrative script.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => handleWriteStory(true)}
                            disabled={loading}
                            className="px-4 py-2 rounded-xl text-xs font-sans font-semibold transition-all border border-chronicle-amber/30 text-chronicle-amber/80 hover:bg-chronicle-amber/5 hover:text-chronicle-amber h-[38px] flex items-center justify-center"
                        >
                            {loading ? "Writers Bench Active..." : "Go Autonomous"}
                        </button>
                        <button
                            onClick={() => handleWriteStory(false)}
                            disabled={loading}
                            className="px-5 py-2 rounded-xl text-xs font-sans font-semibold transition-all h-[38px] flex items-center justify-center"
                            style={{ background: "#CCFF00", color: "#111111" }}
                        >
                            {loading ? "Writers Bench Active..." : "Write Story"}
                            <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 ml-1.5 flex-shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {isAwaitingStoryboard && (
                <div className="pt-12 border-t border-chronicle-border/30 flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <p className="text-sm font-sans text-chronicle-text font-medium">Narrative Script Finalized?</p>
                        <p className="text-xs font-sans text-chronicle-muted">Convert the story segments into a visual storyboard.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => handleGenerateStoryboard(true)}
                            disabled={loading}
                            className="px-4 py-2 rounded-xl text-xs font-sans font-semibold transition-all border border-chronicle-amber/30 text-chronicle-amber/80 hover:bg-chronicle-amber/5 hover:text-chronicle-amber h-[38px] flex items-center justify-center"
                        >
                            {loading ? "Drawing Scenes..." : "Go Autonomous"}
                        </button>
                        <button
                            onClick={() => handleGenerateStoryboard(false)}
                            disabled={loading}
                            className="px-5 py-2 rounded-xl text-xs font-sans font-semibold transition-all h-[38px] flex items-center justify-center"
                            style={{ background: "#CCFF00", color: "#111111" }}
                        >
                            {loading ? "Drawing Scenes..." : "Generate Storyboard"}
                            <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 ml-1.5 flex-shrink-0">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-12">
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h3 className="text-chronicle-text font-serif text-2xl tracking-tight">
                        Primary Characters
                    </h3>
                    <p className="text-sm text-chronicle-muted max-w-2xl leading-relaxed">
                        The top collage is a style-adapted character map used for continuity. The smaller cards below
                        remain the raw archival references so you can still inspect the original source material.
                    </p>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-950/30 border border-red-800 rounded-lg text-red-400 text-sm font-sans">
                    {error}
                </div>
            )}

            {content}
        </div>
    );
}
