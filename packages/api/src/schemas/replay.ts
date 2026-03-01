import { z } from "zod";

export const replayStepSchema = z.object({
  ts: z.string(),
  tool: z.string(),
  input: z.string().max(5000),
  output: z.string().max(5000).optional(),
  duration_ms: z.number(),
  error: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ReplayStepInput = z.input<typeof replayStepSchema>;
