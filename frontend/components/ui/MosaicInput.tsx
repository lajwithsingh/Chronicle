"use client";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

interface MosaicInputProps {
    onSubmit: (data: { prompt: string; visualStyle: string; voicePreference: string; autonomous: boolean }) => void;
    loading: boolean;
}

const NARRATION_VOICES = [
    { id: "male", label: "Male (Charon)", icon: "MA" },
    { id: "female", label: "Female (Aoede)", icon: "FE" },
];

const VISUAL_STYLES = [
    {
        id: "cinematic",
        label: "Cinematic",
        preview: "/style_preview_cinematic.png",
        tag: "4K Photorealistic",
        desc: "ARRI Alexa documentary footage. Best for modern, breaking, and contemporary events.",
    },
    {
        id: "illustrated",
        label: "Illustrated",
        preview: "/style_preview_illustrated.png",
        tag: "Painterly",
        desc: "Warm oil-painting style. Perfect for history, science, and biographical stories.",
    },
    {
        id: "anime",
        label: "Anime / Ghibli",
        preview: "/style_preview_anime.png",
        tag: "Hand-drawn",
        desc: "Studio Ghibli magic. Ideal for emotional, nature, and human-interest stories.",
    },
    {
        id: "rotoscope",
        label: "Rotoscope",
        preview: "/style_preview_rotoscope.png",
        tag: "Graphic Novel",
        desc: "Raw and visceral. Perfect for conflict, war, and high-stakes journalism.",
    },
];

const cardVariants = {
    hidden: { opacity: 0, y: 14, scale: 0.96 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { delay: i * 0.07, duration: 0.32, ease: [0.22, 1, 0.36, 1] },
    }),
};

export function MosaicInput({ onSubmit, loading }: MosaicInputProps) {
    const [prompt, setPrompt] = useState("");
    const [visualStyle, setVisualStyle] = useState("cinematic");
    const [voicePreference, setVoicePreference] = useState("male");
    const [autonomous, setAutonomous] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const voiceRef = useRef<HTMLDivElement>(null);

    // Need to wait for client mount before using createPortal (SSR compat)
    useEffect(() => { setMounted(true); }, []);

    // Close voice dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (voiceRef.current && !voiceRef.current.contains(event.target as Node)) {
                setVoiceDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedStyle = VISUAL_STYLES.find((s) => s.id === visualStyle)!;
    const selectedVoice = NARRATION_VOICES.find((v) => v.id === voicePreference)!;

    const handleSubmit = () => {
        if (prompt.trim() && !loading) {
            onSubmit({ prompt, visualStyle, voicePreference, autonomous });
        }
    };

    const handleSelect = (id: string) => {
        setVisualStyle(id);
        setModalOpen(false);
    };

    return (
        <>
            {/* ── Input Card ─────────────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ type: "spring", damping: 22, stiffness: 180 }}
                className="w-full bg-chronicle-bg-card border border-chronicle-border rounded-2xl shadow-xl shadow-black/40 transition-colors focus-within:border-chronicle-amber/30"
            >
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. The 2023 Turkey-Syria earthquake, or Marie Curie & Radioactivity"
                    rows={2}
                    className="w-full bg-transparent px-5 pt-5 pb-3 text-chronicle-text font-sans text-base placeholder:text-chronicle-muted resize-none outline-none leading-relaxed rounded-t-2xl"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit();
                        }
                    }}
                />

                {/* Bottom row */}
                <div className="flex items-center justify-between px-4 pb-4 pt-1 gap-3">
                    {/* Style pill trigger */}
                    <button
                        id="visual-style-btn"
                        onClick={() => setModalOpen(true)}
                        className="group flex items-center gap-2 px-2 py-1.5 rounded-xl border border-chronicle-border bg-chronicle-bg hover:border-chronicle-amber/40 transition-all duration-200 text-xs font-sans h-[38px]"
                    >
                        <div className="relative w-10 h-6 rounded-md overflow-hidden flex-shrink-0 border border-white/10">
                            <Image src={selectedStyle.preview} alt={selectedStyle.label} fill className="object-cover" />
                        </div>
                        <span className="text-chronicle-text font-medium">{selectedStyle.label}</span>
                        {/* paintbrush icon */}
                        <svg className="w-3 h-3 text-chronicle-muted/50 group-hover:text-chronicle-amber transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
                        </svg>
                    </button>
                    
                    {/* Voice Selection Dropdown */}
                    <div className="relative" ref={voiceRef}>
                        <button
                            onClick={() => setVoiceDropdownOpen(!voiceDropdownOpen)}
                            className="group flex items-center gap-2 px-3 py-1.5 rounded-xl border border-chronicle-border bg-chronicle-bg hover:border-chronicle-amber/40 transition-all duration-200 text-xs font-sans h-[38px]"
                        >
                            <span className="text-[10px] font-mono font-bold text-chronicle-amber/70 w-5">{selectedVoice.icon}</span>
                            <span className="text-chronicle-text font-medium">{selectedVoice.label.split(' ')[0]}</span>
                            <svg className={`w-3 h-3 text-chronicle-muted/50 transition-transform duration-200 ${voiceDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                        </button>

                        <AnimatePresence>
                            {voiceDropdownOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                    transition={{ duration: 0.15, ease: "easeOut" }}
                                    className="absolute bottom-full left-0 mb-2 w-40 bg-chronicle-bg-card border border-chronicle-border rounded-xl shadow-2xl overflow-hidden z-20"
                                >
                                    <div className="p-1">
                                        {NARRATION_VOICES.map((v) => (
                                            <button
                                                key={v.id}
                                                onClick={() => {
                                                    setVoicePreference(v.id);
                                                    setVoiceDropdownOpen(false);
                                                }}
                                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-sans transition-colors ${
                                                    voicePreference === v.id
                                                        ? "bg-chronicle-amber text-chronicle-bg font-bold"
                                                        : "text-chronicle-text hover:bg-chronicle-border/30"
                                                }`}
                                            >
                                                <span>{v.label}</span>
                                                {voicePreference === v.id && (
                                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Autonomy Toggle */}
                    <div className="flex items-center gap-2 px-1 py-1 rounded-xl border border-chronicle-border bg-chronicle-bg h-[38px]">
                        <button
                            onClick={() => setAutonomous(false)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all duration-200 ${
                                !autonomous 
                                    ? "bg-chronicle-border/40 text-chronicle-text" 
                                    : "text-chronicle-muted/40 hover:text-chronicle-muted"
                            }`}
                        >
                            Controlled
                        </button>
                        <button
                            onClick={() => setAutonomous(true)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-all duration-200 ${
                                autonomous 
                                    ? "bg-chronicle-amber text-chronicle-bg shadow-[0_0_12px_rgba(204,255,0,0.3)]" 
                                    : "text-chronicle-muted/40 hover:text-chronicle-muted"
                            }`}
                        >
                            Autonomous
                        </button>
                    </div>

                    <div className="flex-1" />

                    {/* Submit */}
                    <motion.button
                        id="create-doc-btn"
                        onClick={handleSubmit}
                        disabled={!prompt.trim() || loading}
                        animate={
                            prompt.trim()
                                ? { backgroundColor: "#CCFF00", color: "#111111" }
                                : { backgroundColor: "rgba(204,255,0,0.08)", color: "rgba(204,255,0,0.25)" }
                        }
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="group flex items-center gap-1.5 font-sans font-semibold text-xs px-4 py-2 rounded-xl h-[38px] disabled:cursor-not-allowed"
                    >
                        Create documentary
                        <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                    </motion.button>
                </div>
            </motion.div>

            {/* ── Style Picker Modal — rendered in a portal at document.body ── */}
            {mounted && createPortal(
            <AnimatePresence>
                {modalOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            key="style-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            onClick={() => setModalOpen(false)}
                            className="fixed inset-0 bg-black/75 backdrop-blur-md z-[200]"
                        />

                        {/* Modal panel — centered via flex, not translate, so framer-motion y doesn't conflict */}
                        <div className="fixed inset-0 flex items-center justify-center z-[201] px-4 pointer-events-none">
                        <motion.div
                            key="style-modal"
                            initial={{ opacity: 0, scale: 0.93, y: 24 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.93, y: 24 }}
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="w-full max-w-2xl pointer-events-auto"
                        >
                            <div className="bg-chronicle-bg border border-chronicle-border rounded-3xl shadow-2xl shadow-black/80 overflow-hidden">
                                {/* Header */}
                                <div className="flex items-start justify-between px-7 pt-7 pb-5">
                                    <div>
                                        <h2 className="text-xl font-serif text-chronicle-text tracking-tight">Choose Visual Style</h2>
                                        <p className="text-chronicle-muted text-xs font-sans mt-1">Select how your documentary will look and feel.</p>
                                    </div>
                                    <button
                                        onClick={() => setModalOpen(false)}
                                        className="p-1.5 rounded-full hover:bg-chronicle-border/40 transition-colors text-chronicle-muted"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                {/* 2×2 Grid */}
                                <div className="grid grid-cols-2 gap-3 px-5 pb-7">
                                    {VISUAL_STYLES.map((s, i) => {
                                        const isSelected = visualStyle === s.id;
                                        return (
                                            <motion.button
                                                key={s.id}
                                                id={`style-option-${s.id}`}
                                                custom={i}
                                                variants={cardVariants}
                                                initial="hidden"
                                                animate="visible"
                                                onClick={() => handleSelect(s.id)}
                                                whileHover={{ scale: 1.025 }}
                                                whileTap={{ scale: 0.975 }}
                                                className={`relative rounded-2xl overflow-hidden border text-left transition-colors duration-200 focus:outline-none ${
                                                    isSelected
                                                        ? "border-chronicle-amber shadow-[0_0_20px_rgba(204,255,0,0.12)]"
                                                        : "border-chronicle-border hover:border-chronicle-muted/50"
                                                }`}
                                            >
                                                {/* Preview image */}
                                                <div className="relative w-full aspect-video overflow-hidden">
                                                    <Image
                                                        src={s.preview}
                                                        alt={s.label}
                                                        fill
                                                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                                                    />
                                                    {/* Gradient overlay */}
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                                                    {/* Tag badge */}
                                                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-[9px] font-mono font-bold uppercase tracking-widest text-white/70 border border-white/10">
                                                        {s.tag}
                                                    </span>

                                                    {/* Selected check */}
                                                    <AnimatePresence>
                                                        {isSelected && (
                                                            <motion.div
                                                                initial={{ scale: 0, opacity: 0 }}
                                                                animate={{ scale: 1, opacity: 1 }}
                                                                exit={{ scale: 0, opacity: 0 }}
                                                                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                                                className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-chronicle-amber flex items-center justify-center"
                                                            >
                                                                <svg className="w-3.5 h-3.5 text-chronicle-bg" fill="currentColor" viewBox="0 0 20 20">
                                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                </svg>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>

                                                {/* Card footer */}
                                                <div className="px-4 py-3 bg-chronicle-bg-card">
                                                    <p className={`text-sm font-sans font-semibold ${isSelected ? "text-chronicle-amber" : "text-chronicle-text"}`}>
                                                        {s.label}
                                                    </p>
                                                    <p className="text-[11px] font-sans text-chronicle-muted/70 mt-0.5 leading-snug">
                                                        {s.desc}
                                                    </p>
                                                </div>
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.div>
                        </div>
                    </>
                )}
            </AnimatePresence>
            , document.body)}
        </>
    );
}
