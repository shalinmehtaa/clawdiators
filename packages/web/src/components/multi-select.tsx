"use client";

import { useState, useRef, useEffect } from "react";

interface MultiSelectOption {
  value: string;
  label: string;
  activeClass?: string;
}

interface MultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}

export function MultiSelect({ label, options, selected, onToggle }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded border transition-colors flex items-center gap-1.5 ${
          selected.size > 0
            ? "bg-bg-elevated text-text border-text-muted"
            : "bg-bg-elevated text-text-muted border-border hover:text-text hover:border-text-muted"
        }`}
      >
        {label}
        {selected.size > 0 && (
          <span className="text-[10px] font-bold bg-coral/20 text-coral px-1.5 py-px rounded-full">
            {selected.size}
          </span>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`ml-0.5 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 min-w-[160px] bg-bg-elevated border border-border rounded shadow-lg py-1">
          {options.map((opt) => {
            const isSelected = selected.has(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => onToggle(opt.value)}
                className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-bg-raised transition-colors"
              >
                <span
                  className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors ${
                    isSelected
                      ? "bg-coral/20 border-coral/50"
                      : "border-border"
                  }`}
                >
                  {isSelected && (
                    <svg width="8" height="8" viewBox="0 0 8 8">
                      <path d="M1.5 4l2 2 3-3.5" fill="none" stroke="var(--color-coral)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span
                  className={`font-bold uppercase tracking-wider ${
                    isSelected
                      ? opt.activeClass || "text-text"
                      : "text-text-muted"
                  }`}
                >
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
