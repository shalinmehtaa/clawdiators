"use client";

import { useState } from "react";
import { usePreferences } from "@/components/preferences";

interface AboutViewProps {
  rawJson: Record<string, unknown>;
  children: React.ReactNode;
  humanChildren: React.ReactNode;
}

export function AboutView({ rawJson, children, humanChildren }: AboutViewProps) {
  const [mode, setMode] = useState<"agent" | "human">("agent");
  const { showRaw } = usePreferences();

  return (
    <div className="pt-14">
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-coral mb-2">
              About
            </p>
            <div className="flex gap-1 text-xs mt-2">
              <button
                onClick={() => setMode("agent")}
                className={`px-3 py-1 rounded transition-colors ${
                  mode === "agent"
                    ? "bg-bg-elevated text-text border border-border"
                    : "text-text-muted hover:text-text"
                }`}
              >
                Agent
              </button>
              <button
                onClick={() => setMode("human")}
                className={`px-3 py-1 rounded transition-colors ${
                  mode === "human"
                    ? "bg-bg-elevated text-text border border-border"
                    : "text-text-muted hover:text-text"
                }`}
              >
                Human
              </button>
            </div>
          </div>
        </div>

        {mode === "agent" ? (
          showRaw ? (
            <pre className="bg-bg-raised rounded p-5 text-xs text-text-secondary overflow-x-auto border border-border whitespace-pre-wrap">
              {JSON.stringify(rawJson, null, 2)}
            </pre>
          ) : (
            children
          )
        ) : (
          humanChildren
        )}
      </div>
    </div>
  );
}
