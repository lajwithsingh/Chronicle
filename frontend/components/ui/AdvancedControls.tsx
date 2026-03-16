"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AdvancedControlsProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (settings: any) => void;
}

const DOCUMENTARY_STYLES = [
    { id: "ken_burns", title: "Ken Burns", desc: "Still photography, slow pans, intimate narration", icon: "📽️" },
    { id: "attenborough", title: "Attenborough", desc: "Grand scope, poetic narration, nature-inspired", icon: "🌍" },
    { id: "investigative", title: "Investigative", desc: "60 Minutes style — evidence-driven, probing", icon: "🔍" },
    { id: "immersive", title: "Immersive", desc: "You Are There — first-person, visceral", icon: "🎭" },
    { id: "academic", title: "Academic", desc: "Expert-led, scholarly, rigorous fact-checking", icon: "🎓" },
    { id: "cinematic", title: "Cinematic", desc: "Epic wide shots, dramatic music, theatrical", icon: "🎬" },
];

const SUBJECT_AREAS = ["History", "Science", "Biography", "Nature", "War & Conflict", "Art & Culture", "Society", "Technology", "Religion", "Economics"];

const HISTORICAL_ERAS = [
    "Ancient World (before 500 AD)",
    "Medieval (500–1500)",
    "Early Modern (1500–1800)",
    "Industrial Age (1800–1900)",
    "20th Century",
    "Contemporary (2000–present)",
];

function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(" ");
}

export function AdvancedControls({ isOpen, onClose, onApply }: AdvancedControlsProps) {
    const [depth, setDepth] = useState(70);
    const [selectedStyle, setSelectedStyle] = useState("attenborough");
    const [selectedEra, setSelectedEra] = useState("20th Century");
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>(["History"]);

    const toggleSubject = (s: string) => {
        setSelectedSubjects(prev =>
            prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
        );
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-chronicle-bg border border-chronicle-border rounded-[32px] shadow-2xl z-[101] p-10"
                    >
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h2 className="text-2xl font-serif text-chronicle-text mb-2">Advanced Documentary Options</h2>
                                <p className="text-chronicle-muted font-sans text-sm">
                                    Fine-tune how Mosaic approaches your documentary — or leave on{" "}
                                    <span className="text-chronicle-amber italic">Auto</span> to let the AI decide.
                                </p>
                            </div>
                            <button onClick={onClose} className="p-2 rounded-full hover:bg-chronicle-border/40 transition-colors">
                                <svg className="w-6 h-6 text-chronicle-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-10">
                            {/* Research Depth */}
                            <section>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xs font-sans font-bold uppercase tracking-widest text-chronicle-muted">Research Depth</h3>
                                    <span className="text-chronicle-amber font-sans font-bold text-sm">{depth}%</span>
                                </div>
                                <div className="relative h-2 bg-chronicle-border rounded-full">
                                    <div
                                        className="absolute h-full bg-chronicle-amber rounded-full transition-all"
                                        style={{ width: `${depth}%` }}
                                    />
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={depth}
                                        onChange={(e) => setDepth(parseInt(e.target.value))}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <div
                                        className="absolute w-5 h-5 bg-chronicle-text border-4 border-chronicle-amber rounded-full -top-1.5 transition-all shadow-lg"
                                        style={{ left: `calc(${depth}% - 10px)` }}
                                    />
                                </div>
                                <div className="flex justify-between mt-2 text-xs font-sans text-chronicle-muted">
                                    <span>Broad overview</span>
                                    <span>Deep scholarly</span>
                                </div>
                            </section>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                {/* Left Column */}
                                <div className="space-y-10">
                                    <section>
                                        <h3 className="text-xs font-sans font-bold uppercase tracking-widest text-chronicle-amber mb-5">Documentary Style</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {DOCUMENTARY_STYLES.map((s) => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => setSelectedStyle(s.id)}
                                                    className={cn(
                                                        "flex flex-col p-4 rounded-2xl border transition-all text-left",
                                                        selectedStyle === s.id
                                                            ? "bg-chronicle-amber/8 border-chronicle-amber/50"
                                                            : "bg-chronicle-bg-card border-chronicle-border hover:border-chronicle-muted"
                                                    )}
                                                >
                                                    <span className="text-xl mb-2">{s.icon}</span>
                                                    <span className="font-sans font-bold text-chronicle-text uppercase text-xs">{s.title}</span>
                                                    <span className="text-[10px] font-sans text-chronicle-muted mt-0.5 leading-tight">{s.desc}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                </div>

                                {/* Right Column */}
                                <div className="space-y-10">
                                    <section>
                                        <h3 className="text-xs font-sans font-bold uppercase tracking-widest text-chronicle-amber mb-5">Historical Era</h3>
                                        <div className="grid grid-cols-1 gap-2">
                                            {HISTORICAL_ERAS.map((e) => (
                                                <button
                                                    key={e}
                                                    onClick={() => setSelectedEra(e)}
                                                    className={cn(
                                                        "py-2.5 px-4 rounded-xl border text-xs font-sans font-medium transition-all text-left",
                                                        selectedEra === e
                                                            ? "bg-chronicle-amber/8 border-chronicle-amber/50 text-chronicle-amber"
                                                            : "bg-chronicle-bg-card border-chronicle-border text-chronicle-text hover:border-chronicle-muted"
                                                    )}
                                                >
                                                    {e}
                                                </button>
                                            ))}
                                        </div>
                                    </section>

                                    <section>
                                        <h3 className="text-xs font-sans font-bold uppercase tracking-widest text-chronicle-amber mb-5">Subject Focus</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {SUBJECT_AREAS.map((s) => (
                                                <button
                                                    key={s}
                                                    onClick={() => toggleSubject(s)}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-full border text-xs font-sans font-medium transition-all",
                                                        selectedSubjects.includes(s)
                                                            ? "bg-chronicle-amber text-chronicle-bg border-chronicle-amber"
                                                            : "bg-chronicle-bg-card text-chronicle-muted border-chronicle-border hover:border-chronicle-muted"
                                                    )}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                </div>
                            </div>

                            <div className="flex justify-end pt-6 border-t border-chronicle-border">
                                <button
                                    onClick={() => onApply({ depth, selectedStyle, selectedEra, selectedSubjects })}
                                    className="bg-chronicle-amber text-chronicle-bg font-sans font-bold px-8 py-3 rounded-2xl text-sm hover:scale-105 transition-transform"
                                >
                                    Apply Options
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
