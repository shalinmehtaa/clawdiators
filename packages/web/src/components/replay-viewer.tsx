"use client";

import { useState } from "react";

interface ReplayStep {
  ts: string;
  tool: string;
  input: string;
  output?: string;
  duration_ms: number;
  error?: boolean;
  metadata?: Record<string, unknown>;
}

const TOOL_COLORS: Record<string, string> = {
  bash: "bg-coral",
  read: "bg-sky",
  write: "bg-emerald",
  grep: "bg-gold",
  browser: "bg-purple",
  llm: "bg-purple",
};

const TOOL_TEXT_COLORS: Record<string, string> = {
  bash: "text-coral",
  read: "text-sky",
  write: "text-emerald",
  grep: "text-gold",
  browser: "text-purple",
  llm: "text-purple",
};

export function ReplayViewer({ steps }: { steps: ReplayStep[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (!steps || steps.length === 0) return null;

  // Summary stats
  const totalDuration = steps.reduce((sum, s) => sum + s.duration_ms, 0);
  const toolCounts: Record<string, number> = {};
  for (const step of steps) {
    toolCounts[step.tool] = (toolCounts[step.tool] || 0) + 1;
  }
  const errorCount = steps.filter((s) => s.error).length;

  // Compute relative timestamps from first step
  const firstTs = steps.length > 0 ? new Date(steps[0].ts).getTime() : 0;

  return (
    <div>
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
          {steps.length} steps
        </span>
        <span className="text-[10px] text-text-muted">
          {(totalDuration / 1000).toFixed(1)}s total
        </span>
        {errorCount > 0 && (
          <span className="text-[10px] font-bold text-coral">
            {errorCount} error{errorCount !== 1 ? "s" : ""}
          </span>
        )}
        <span className="w-px h-3 bg-border" />
        {Object.entries(toolCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([tool, count]) => (
            <span
              key={tool}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TOOL_TEXT_COLORS[tool] || "text-text-muted"} bg-bg-elevated border border-border`}
            >
              {tool} ({count})
            </span>
          ))}
      </div>

      {/* Timeline */}
      <div className="relative pl-4 border-l-2 border-border space-y-1">
        {steps.map((step, i) => {
          const isExpanded = expandedIndex === i;
          const relativeMs = new Date(step.ts).getTime() - firstTs;
          const relativeSec = (relativeMs / 1000).toFixed(1);
          const dotColor = TOOL_COLORS[step.tool] || "bg-text-muted";

          return (
            <div key={i} className="relative">
              {/* Dot */}
              <div
                className={`absolute -left-[calc(0.5rem+5px)] top-2.5 w-2 h-2 rounded-full ${
                  step.error ? "bg-coral ring-2 ring-coral/30" : dotColor
                }`}
              />

              <button
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
                className="w-full text-left px-3 py-1.5 rounded hover:bg-bg-elevated/50 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-muted w-12 shrink-0 text-right">
                    +{relativeSec}s
                  </span>
                  <span
                    className={`text-[10px] font-bold w-12 shrink-0 ${
                      TOOL_TEXT_COLORS[step.tool] || "text-text-muted"
                    }`}
                  >
                    {step.tool}
                  </span>
                  <span className="text-[10px] text-text-secondary truncate flex-1">
                    {step.input.slice(0, 120)}
                    {step.input.length > 120 ? "..." : ""}
                  </span>
                  <span className="text-[10px] text-text-muted shrink-0">
                    {step.duration_ms}ms
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="ml-16 mr-2 mb-2 space-y-2">
                  <div>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                      Input
                    </p>
                    <pre className="bg-bg rounded p-3 text-[10px] text-text-secondary overflow-x-auto border border-border whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {step.input}
                    </pre>
                  </div>
                  {step.output && (
                    <div>
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                        Output
                      </p>
                      <pre className={`bg-bg rounded p-3 text-[10px] overflow-x-auto border whitespace-pre-wrap max-h-60 overflow-y-auto ${
                        step.error
                          ? "text-coral border-coral/30"
                          : "text-text-secondary border-border"
                      }`}>
                        {step.output}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
