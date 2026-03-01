"use client";

import { useState } from "react";

interface ToolCallStep {
  type: "tool_call";
  ts: string;
  tool: string;
  input: string;
  output?: string;
  duration_ms: number;
  error?: boolean;
  metadata?: Record<string, unknown>;
}

interface LLMCallStep {
  type: "llm_call";
  ts: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  error?: boolean;
  response_text?: string;
  metadata?: Record<string, unknown>;
}

type ReplayStep = ToolCallStep | LLMCallStep;

const TOOL_COLORS: Record<string, string> = {
  bash: "bg-coral",
  read: "bg-sky",
  write: "bg-emerald",
  grep: "bg-gold",
  browser: "bg-purple",
  llm_call: "bg-purple",
};

const TOOL_TEXT_COLORS: Record<string, string> = {
  bash: "text-coral",
  read: "text-sky",
  write: "text-emerald",
  grep: "text-gold",
  browser: "text-purple",
  llm_call: "text-purple",
};

function getStepLabel(step: ReplayStep): string {
  if (step.type === "llm_call") return "llm";
  return step.tool;
}

function getStepColorKey(step: ReplayStep): string {
  if (step.type === "llm_call") return "llm_call";
  return step.tool;
}

function getStepPreview(step: ReplayStep): string {
  if (step.type === "llm_call") {
    return `${step.model} (${step.input_tokens}→${step.output_tokens} tokens)`;
  }
  const preview = step.input.slice(0, 120);
  return preview + (step.input.length > 120 ? "..." : "");
}

export function ReplayViewer({ steps }: { steps: ReplayStep[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (!steps || steps.length === 0) return null;

  // Summary stats
  const totalDuration = steps.reduce((sum, s) => sum + s.duration_ms, 0);
  const toolCounts: Record<string, number> = {};
  for (const step of steps) {
    const label = getStepLabel(step);
    toolCounts[label] = (toolCounts[label] || 0) + 1;
  }
  const errorCount = steps.filter((s) => s.error).length;

  // LLM token totals
  const llmSteps = steps.filter((s): s is LLMCallStep => s.type === "llm_call");
  const totalInputTokens = llmSteps.reduce((sum, s) => sum + s.input_tokens, 0);
  const totalOutputTokens = llmSteps.reduce((sum, s) => sum + s.output_tokens, 0);

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
        {llmSteps.length > 0 && (
          <span className="text-[10px] text-text-muted">
            {totalInputTokens.toLocaleString()}→{totalOutputTokens.toLocaleString()} tokens
          </span>
        )}
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
          const colorKey = getStepColorKey(step);
          const dotColor = TOOL_COLORS[colorKey] || "bg-text-muted";
          const label = getStepLabel(step);

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
                      TOOL_TEXT_COLORS[colorKey] || "text-text-muted"
                    }`}
                  >
                    {label}
                  </span>
                  <span className="text-[10px] text-text-secondary truncate flex-1">
                    {getStepPreview(step)}
                  </span>
                  <span className="text-[10px] text-text-muted shrink-0">
                    {step.duration_ms}ms
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="ml-16 mr-2 mb-2 space-y-2">
                  {step.type === "tool_call" ? (
                    <>
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
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-3">
                        <span className="text-[10px] text-text-muted">
                          <span className="font-bold">Model:</span> {step.model}
                        </span>
                        <span className="text-[10px] text-text-muted">
                          <span className="font-bold">Input:</span> {step.input_tokens.toLocaleString()} tokens
                        </span>
                        <span className="text-[10px] text-text-muted">
                          <span className="font-bold">Output:</span> {step.output_tokens.toLocaleString()} tokens
                        </span>
                      </div>
                      {step.response_text && (
                        <div>
                          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                            Response
                          </p>
                          <pre className={`bg-bg rounded p-3 text-[10px] overflow-x-auto border whitespace-pre-wrap max-h-60 overflow-y-auto ${
                            step.error
                              ? "text-coral border-coral/30"
                              : "text-text-secondary border-border"
                          }`}>
                            {step.response_text}
                          </pre>
                        </div>
                      )}
                    </>
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
