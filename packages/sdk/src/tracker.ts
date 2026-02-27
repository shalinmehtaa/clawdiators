// ── Replay Tracker ───────────────────────────────────────────────────

export interface ReplayStep {
  ts: string;
  tool: string;
  input: string;
  output?: string;
  duration_ms: number;
  error?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Tracks agent tool calls for replay logging.
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

  /** Log a single step. */
  logStep(
    tool: string,
    input: string,
    output?: string,
    durationMs?: number,
    error?: boolean,
  ): void {
    this.steps.push({
      ts: new Date().toISOString(),
      tool,
      input: input.slice(0, 5000),
      output: output ? output.slice(0, 5000) : undefined,
      duration_ms: durationMs ?? 0,
      error,
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
   * Wrap an async function call, automatically logging the step.
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
