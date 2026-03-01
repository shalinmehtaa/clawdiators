// ── Replay Tracker ───────────────────────────────────────────────────

export interface ToolCallStep {
  type: "tool_call";
  ts: string;
  tool: string;
  input: string;
  output?: string;
  duration_ms: number;
  error?: boolean;
  metadata?: Record<string, unknown>;
}

export interface LLMCallStep {
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

export type ReplayStep = ToolCallStep | LLMCallStep;

/**
 * Tracks agent tool calls and LLM calls for replay logging.
 * Steps are stored in memory and can be included in submission metadata.
 */
export class ReplayTracker {
  private steps: ReplayStep[] = [];
  private startTime: number = 0;

  /** Mark the beginning of tracking. */
  start(): void {
    this.startTime = Date.now();
    this.steps = [];
  }

  /** Log a single tool call step. */
  logStep(
    tool: string,
    input: string,
    output?: string,
    durationMs?: number,
    error?: boolean,
  ): void {
    this.steps.push({
      type: "tool_call",
      ts: new Date().toISOString(),
      tool,
      input: input.slice(0, 5000),
      output: output ? output.slice(0, 5000) : undefined,
      duration_ms: durationMs ?? 0,
      error,
    });
  }

  /** Log an LLM call step. */
  logLLMCall(
    model: string,
    inputTokens: number,
    outputTokens: number,
    durationMs: number,
    opts?: { responseText?: string; error?: boolean },
  ): void {
    this.steps.push({
      type: "llm_call",
      ts: new Date().toISOString(),
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: durationMs,
      error: opts?.error,
      response_text: opts?.responseText?.slice(0, 50000),
    });
  }

  /** Get the full replay log. */
  getLog(): ReplayStep[] {
    return [...this.steps];
  }

  /** Get step count. */
  get length(): number {
    return this.steps.length;
  }

  /** Total tracked duration in milliseconds. */
  get totalDurationMs(): number {
    return this.steps.reduce((sum, s) => sum + s.duration_ms, 0);
  }

  /** Get elapsed time since start() was called. */
  get elapsedMs(): number {
    return this.startTime > 0 ? Date.now() - this.startTime : 0;
  }

  /**
   * Wrap an async function call, automatically logging the step as a tool call.
   * Records timing and error status.
   */
  async wrap<T>(
    tool: string,
    input: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      const output = typeof result === "string"
        ? result
        : JSON.stringify(result);
      this.logStep(tool, input, output, duration, false);
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      this.logStep(tool, input, msg, duration, true);
      throw err;
    }
  }
}
