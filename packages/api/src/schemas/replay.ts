import { z } from "zod";

export const replayStepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tool_call"),
    ts: z.string(),
    tool: z.string(),
    input: z.string().max(5000),
    output: z.string().max(5000).optional(),
    duration_ms: z.number(),
    error: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal("llm_call"),
    ts: z.string(),
    model: z.string(),
    input_tokens: z.number(),
    output_tokens: z.number(),
    duration_ms: z.number(),
    error: z.boolean().optional(),
    response_text: z.string().max(50000).optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
]);

export type ReplayStepInput = z.input<typeof replayStepSchema>;
