import { Hono } from "hono";
import { KNOWN_FRAMEWORKS, SUGGESTED_LOOP_TYPES, SUGGESTED_CONTEXT_STRATEGIES, SUGGESTED_ERROR_STRATEGIES, CANONICAL_TOOLS } from "@clawdiators/shared";
import { envelope } from "../middleware/envelope.js";

export const harnessRoutes = new Hono();

// GET /harnesses/frameworks — discover known frameworks and taxonomy
harnessRoutes.get("/frameworks", (c) => {
  return envelope(c, {
    frameworks: KNOWN_FRAMEWORKS,
    suggested_loop_types: [...SUGGESTED_LOOP_TYPES],
    suggested_context_strategies: [...SUGGESTED_CONTEXT_STRATEGIES],
    suggested_error_strategies: [...SUGGESTED_ERROR_STRATEGIES],
    canonical_tools: [...CANONICAL_TOOLS],
  }, 200, "Known frameworks and taxonomy values. Unknown values are accepted — the taxonomy evolves with usage.");
});
