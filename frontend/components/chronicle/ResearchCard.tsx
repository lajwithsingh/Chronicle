"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useChronicleStore } from "@/hooks/useChronicleStore";
import type { ResearchDoneData } from "@/lib/types";

// ── Inline editable text ──────────────────────────────────────────────────────

function EditableText({
  value, onSave, className = "", inputClassName = "", style,
}: {
  value: string; onSave: (v: string) => void;
  className?: string; inputClassName?: string; style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  if (editing) {
    return (
      <input ref={ref} value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onSave(draft.trim() || value); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onSave(draft.trim() || value); setEditing(false); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={`bg-transparent border-b focus:outline-none ${inputClassName}`}
        style={{ borderColor: "rgba(204,255,0,0.4)" }}
      />
    );
  }
  return (
    <span className={`cursor-text hover:opacity-80 transition-opacity ${className}`}
      onClick={() => setEditing(true)}
      style={style}>
      {value}
    </span>
  );
}

// ── Inline editable paragraph ─────────────────────────────────────────────────

function EditablePara({
  value, onSave, rows = 3, className = "", placeholder = "", style,
}: {
  value: string; onSave: (v: string) => void;
  rows?: number; className?: string; placeholder?: string; style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) { ref.current?.focus(); ref.current?.select(); } }, [editing]);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  if (editing) {
    return (
      <textarea ref={ref} value={draft} rows={rows} placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onSave(draft.trim() || value); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className={`w-full bg-transparent focus:outline-none resize-none ${className}`}
        style={{ borderBottom: "1px solid rgba(204,255,0,0.25)" }}
      />
    );
  }
  return (
    <p className={`cursor-text hover:opacity-80 transition-opacity ${className}`}
      onClick={() => setEditing(true)}
      style={style}>
      {value || <span className="opacity-30 italic">{placeholder}</span>}
    </p>
  );
}

// ── Figure chips ───────────────────────────────────────────────────────────────

function FigureChip({ name, onEdit, onDelete }: {
  name: string; onEdit: (v: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <input ref={ref} value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim()) onEdit(draft.trim()); else onDelete(); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { if (draft.trim()) onEdit(draft.trim()); else onDelete(); setEditing(false); }
          if (e.key === "Escape") { setDraft(name); setEditing(false); }
        }}
        className="text-[11px] px-2 py-0.5 rounded-full focus:outline-none w-28"
        style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(204,255,0,0.35)" }}
      />
    );
  }
  return (
    <span className="group inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full cursor-pointer transition-all"
      style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
      onClick={() => setEditing(true)}>
      {name}
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity leading-none text-sm"
        style={{ color: "rgba(255,255,255,0.4)" }}>
        ×
      </button>
    </span>
  );
}

// ── Era Intelligence Modal ─────────────────────────────────────────────────────

function ModalField({ label, value, onSave, placeholder, rows = 2 }: {
  label: string; value: string; onSave: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-mono uppercase tracking-widest" style={{ color: "rgba(204,255,0,0.5)" }}>
        {label}
      </p>
      <EditablePara value={value} onSave={onSave} rows={rows} placeholder={placeholder}
        className="text-sm leading-relaxed"
        style={{ color: "rgba(255,255,255,0.72)" } as React.CSSProperties} />
    </div>
  );
}

function EraModal({ brief, onUpdate, onClose }: {
  brief: ResearchDoneData;
  onUpdate: (patch: Partial<ResearchDoneData>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"bible" | "clothing" | "architecture" | "technology">("bible");

  const mc = brief.era_material_culture || {};
  const ar = brief.era_architecture || {};
  const tech = brief.era_technology || {};
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const tabs = [
    { id: "bible" as const, label: "Style Bible" },
    { id: "clothing" as const, label: "Clothing" },
    { id: "architecture" as const, label: "Architecture" },
    { id: "technology" as const, label: "Technology" },
  ];

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-8"
      style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(10px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ type: "spring", damping: 30, stiffness: 340 }}
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "#0f0f16", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 40px 100px rgba(0,0,0,0.7)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-7 pt-6 pb-5">
          <div>
            <h2 className="text-lg font-serif font-semibold tracking-tight" style={{ color: "rgba(255,255,255,0.92)" }}>
              Era Intelligence
            </h2>
            <p className="text-sm font-mono mt-1" style={{ color: "#CCFF00" }}>
              {brief.era_style} · {brief.detected_year}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors mt-0.5"
            style={{ color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.05)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.8)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.35)"; }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 px-7 pb-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-2 rounded-xl text-sm font-sans font-medium transition-all"
              style={tab === t.id
                ? { background: "rgba(204,255,0,0.14)", color: "#CCFF00", border: "1px solid rgba(204,255,0,0.3)" }
                : { color: "rgba(255,255,255,0.38)", border: "1px solid rgba(255,255,255,0.07)" }
              }>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
          {tab === "bible" && (
            <>
              <p className="text-xs font-sans leading-relaxed" style={{ color: "rgba(255,255,255,0.3)" }}>
                Compiled from all 3 specialists. Injected into every Veo video prompt.
              </p>
              <EditablePara value={brief.style_bible || ""} onSave={(v) => onUpdate({ style_bible: v })}
                rows={8} placeholder="Appears after era research completes…"
                className="text-sm leading-relaxed font-mono"
                style={{ color: "rgba(255,255,255,0.65)" } as React.CSSProperties} />
            </>
          )}
          {tab === "clothing" && (
            <div className="grid grid-cols-2 gap-6">
              <ModalField label="Primary clothing" value={mc.primary_clothing || ""} onSave={(v) => onUpdate({ era_material_culture: { ...mc, primary_clothing: v } })} placeholder="Main figures' garments…" />
              <ModalField label="Background crowd" value={mc.secondary_clothing || ""} onSave={(v) => onUpdate({ era_material_culture: { ...mc, secondary_clothing: v } })} />
              <ModalField label="Hairstyles" value={mc.hairstyles || ""} onSave={(v) => onUpdate({ era_material_culture: { ...mc, hairstyles: v } })} />
              <ModalField label="Accessories" value={mc.accessories || ""} onSave={(v) => onUpdate({ era_material_culture: { ...mc, accessories: v } })} />
              <ModalField label="Physical descriptors" value={mc.physical_descriptors || ""} onSave={(v) => onUpdate({ era_material_culture: { ...mc, physical_descriptors: v } })} />
              <ModalField label="Fabrics" value={mc.fabrics_materials || ""} onSave={(v) => onUpdate({ era_material_culture: { ...mc, fabrics_materials: v } })} />
              <div className="col-span-2">
                <ModalField label="Anachronisms to exclude" value={mc.wardrobe_negative_nouns || ""} onSave={(v) => onUpdate({ era_material_culture: { ...mc, wardrobe_negative_nouns: v } })} placeholder="Nouns only…" />
              </div>
            </div>
          )}
          {tab === "architecture" && (
            <div className="grid grid-cols-2 gap-6">
              <ModalField label="Architecture" value={ar.dominant_architecture || ""} onSave={(v) => onUpdate({ era_architecture: { ...ar, dominant_architecture: v } })} />
              <ModalField label="Streets" value={ar.street_environment || ""} onSave={(v) => onUpdate({ era_architecture: { ...ar, street_environment: v } })} />
              <ModalField label="Landscape" value={ar.landscape_vegetation || ""} onSave={(v) => onUpdate({ era_architecture: { ...ar, landscape_vegetation: v } })} />
              <ModalField label="Transport" value={ar.vehicles_transport || ""} onSave={(v) => onUpdate({ era_architecture: { ...ar, vehicles_transport: v } })} />
              <div className="col-span-2">
                <ModalField label="Visual anchors" value={ar.distinctive_visual_elements || ""} onSave={(v) => onUpdate({ era_architecture: { ...ar, distinctive_visual_elements: v } })} placeholder="2–3 instantly recognisable details…" />
              </div>
              <div className="col-span-2">
                <ModalField label="Anachronisms to exclude" value={ar.architecture_negative_nouns || ""} onSave={(v) => onUpdate({ era_architecture: { ...ar, architecture_negative_nouns: v } })} />
              </div>
            </div>
          )}
          {tab === "technology" && (
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <ModalField label="Era-defining objects" value={tech.era_defining_objects || ""} onSave={(v) => onUpdate({ era_technology: { ...tech, era_defining_objects: v } })} placeholder="Objects that instantly signal this era…" />
              </div>
              <ModalField label="Communication" value={tech.communication_devices || ""} onSave={(v) => onUpdate({ era_technology: { ...tech, communication_devices: v } })} />
              <ModalField label="Computing / media" value={tech.computing_media || ""} onSave={(v) => onUpdate({ era_technology: { ...tech, computing_media: v } })} />
              <ModalField label="Everyday tools" value={tech.everyday_tools_objects || ""} onSave={(v) => onUpdate({ era_technology: { ...tech, everyday_tools_objects: v } })} />
              <div className="col-span-2">
                <ModalField label="Anachronisms to exclude" value={tech.technology_negative_nouns || ""} onSave={(v) => onUpdate({ era_technology: { ...tech, technology_negative_nouns: v } })} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t flex items-center justify-between" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-sans" style={{ color: "rgba(255,255,255,0.2)" }}>
            Click any field to edit · changes apply instantly
          </p>
          <button onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-sans font-medium transition-all"
            style={{ background: "#CCFF00", color: "#111111" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}>
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ── Main ResearchCard ──────────────────────────────────────────────────────────

export function ResearchCard({ onCharacterReviewStarted }: { onCharacterReviewStarted?: (autonomous?: boolean) => void }) {
  const { researchBrief, updateResearchBrief, userNotes, setUserNotes, status, sessionId } =
    useChronicleStore();

  const [submitting, setSubmitting] = useState(false);
  const [eraOpen, setEraOpen] = useState(false);

  if (!researchBrief) return null;

  const awaiting = status === "awaiting_narrative";
  const upd = (patch: Parameters<typeof updateResearchBrief>[0]) => updateResearchBrief(patch);

  async function handleProceedToCharacters() {
    if (onCharacterReviewStarted) onCharacterReviewStarted();
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 200 }}
        className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Top meta bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
            <EditableText
              value={String(researchBrief.detected_year)}
              onSave={(v) => { const n = parseInt(v); if (!isNaN(n)) upd({ detected_year: n }); }}
              className="text-base font-serif font-semibold shrink-0"
              inputClassName="text-base font-serif w-16 bg-transparent focus:outline-none"
              style={{ color: "#CCFF00" } as React.CSSProperties}
            />
            <span className="shrink-0" style={{ color: "rgba(255,255,255,0.12)" }}>·</span>
            <div className="flex-1 min-w-0">
              <EditableText
                value={researchBrief.era_style}
                onSave={(v) => upd({ era_style: v })}
                className="text-sm font-sans"
                inputClassName="text-sm font-sans w-full bg-transparent focus:outline-none"
                style={{ color: "rgba(255,255,255,0.55)" } as React.CSSProperties}
              />
            </div>
          </div>
          <button onClick={() => setEraOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-all"
            style={{ color: "#CCFF00", background: "rgba(204,255,0,0.08)", border: "1px solid rgba(204,255,0,0.2)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(204,255,0,0.15)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(204,255,0,0.08)"; }}>
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Era Intelligence
          </button>
        </div>

        {/* Main content */}
        <div className="px-6 py-6 space-y-6">
          {/* Defining moment */}
          <div className="space-y-1.5">
            <p className="text-xs font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>
              Defining Moment
            </p>
            <EditablePara
              value={researchBrief.defining_moment}
              onSave={(v) => upd({ defining_moment: v })}
              rows={4}
              placeholder="Defining moment…"
              className="font-serif leading-relaxed text-base"
              style={{ color: "rgba(255,255,255,0.85)" } as React.CSSProperties}
            />
          </div>

          {/* Key figures */}
          <div className="space-y-2">
            <p className="text-xs font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>
              Key Figures
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <AnimatePresence mode="popLayout">
                {researchBrief.key_figures.map((fig, i) => (
                  <motion.div key={`${fig}-${i}`}
                    initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }} transition={{ type: "spring", damping: 22, stiffness: 280 }}>
                    <FigureChip name={fig}
                      onEdit={(v) => { const next = [...researchBrief.key_figures]; next[i] = v; upd({ key_figures: next }); }}
                      onDelete={() => upd({ key_figures: researchBrief.key_figures.filter((_, j) => j !== i) })}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              <AddFigure onAdd={(v) => upd({ key_figures: [...researchBrief.key_figures, v] })} />
            </div>
          </div>

          {/* Notes for story writer */}
          <div className="space-y-2">
            <p className="text-xs font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>
              Notes for Story Writer
            </p>
            <textarea
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder="Extra context, focus areas, or corrections the story writer should know…"
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-sm font-sans leading-relaxed resize-none focus:outline-none transition-colors"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                color: "rgba(255,255,255,0.65)",
                caretColor: "#CCFF00",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(204,255,0,0.3)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
            />
          </div>
        </div>

        {/* Action bar */}
        <AnimatePresence>
          {awaiting && (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="flex items-center justify-end gap-3 px-5 py-4 border-t"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={() => onCharacterReviewStarted?.(true)}
          className="px-4 py-2 rounded-xl text-xs font-sans font-semibold transition-all border border-chronicle-amber/30 text-chronicle-amber/80 hover:bg-chronicle-amber/5 hover:text-chronicle-amber h-[38px] flex items-center justify-center"
        >
          Go Autonomous
        </button>
        <button
          onClick={() => onCharacterReviewStarted?.(false)}
          className="px-5 py-2 rounded-xl text-xs font-sans font-semibold transition-all h-[38px] flex items-center justify-center"
          style={{ background: "#CCFF00", color: "#111111" }}
        >
          Research Character
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 ml-1.5 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {eraOpen && (
          <EraModal
            brief={researchBrief}
            onUpdate={(patch) => upd(patch as Parameters<typeof updateResearchBrief>[0])}
            onClose={() => setEraOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function AddFigure({ onAdd }: { onAdd: (v: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (adding) ref.current?.focus(); }, [adding]);

  if (adding) {
    return (
      <input ref={ref} placeholder="Name…" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim()) onAdd(draft.trim()); setDraft(""); setAdding(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { if (draft.trim()) onAdd(draft.trim()); setDraft(""); setAdding(false); }
          if (e.key === "Escape") { setDraft(""); setAdding(false); }
        }}
        className="text-[11px] px-2 py-0.5 rounded-full focus:outline-none w-24"
        style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(204,255,0,0.3)" }}
      />
    );
  }
  return (
    <button onClick={() => setAdding(true)}
      className="text-[11px] px-2 py-0.5 rounded-full transition-opacity hover:opacity-80"
      style={{ color: "rgba(255,255,255,0.25)", border: "1px dashed rgba(255,255,255,0.12)" }}>
      + add
    </button>
  );
}
