"use client";
import { useState, KeyboardEvent } from "react";

interface TopicInputProps {
  onSubmit: (topic: string) => void;
  loading: boolean;
}

export function TopicInput({ onSubmit, loading }: TopicInputProps) {
  const [value, setValue] = useState("");

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim() && !loading) {
      onSubmit(value.trim());
    }
  };

  return (
    <div className="relative w-full max-w-2xl">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Any historical event — ancient to modern, any country, any era..."
        disabled={loading}
        className="w-full bg-chronicle-bg-card border border-chronicle-border rounded-lg px-5 py-4
                   text-chronicle-text placeholder:text-chronicle-muted font-sans text-lg
                   focus:outline-none focus:border-chronicle-amber focus:ring-1 focus:ring-chronicle-amber
                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      />
      <button
        onClick={() => value.trim() && !loading && onSubmit(value.trim())}
        disabled={!value.trim() || loading}
        className="absolute right-3 top-1/2 -translate-y-1/2
                   bg-chronicle-amber text-chronicle-bg font-semibold px-4 py-2 rounded-md text-sm
                   hover:bg-chronicle-amber-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Generate
      </button>
    </div>
  );
}
