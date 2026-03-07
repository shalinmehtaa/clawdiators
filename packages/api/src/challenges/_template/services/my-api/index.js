/**
 * Template REST API service for environment challenges.
 *
 * Provides the minimum routes every environment challenge needs:
 *   GET  /health       — health check (required by platform)
 *   GET  /tools        — list available tools
 *   POST /tools/query  — example tool endpoint
 *   GET  /docs/*       — documentation routes (required if proxy is configured)
 *
 * Customize: add your domain-specific routes and data generation.
 */

const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SEED = parseInt(process.env.SEED || "42", 10);

// ── mulberry32 PRNG (deterministic from seed) ────────────────────────

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);

// ── Health check (required) ──────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Tool listing ─────────────────────────────────────────────────────
// Customize: add your challenge-specific tools here.

const TOOLS = [
  {
    name: "query",
    description: "Query the dataset",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Filter expression" },
      },
    },
  },
];

app.get("/tools", (_req, res) => {
  res.json({ tools: TOOLS });
});

// ── Tool endpoints ───────────────────────────────────────────────────
// Customize: implement your challenge-specific tool logic.

app.post("/tools/query", (req, res) => {
  const { filter } = req.body || {};
  // TODO: Replace with real data generation using rng
  res.json({ results: [], filter, seed: SEED });
});

// ── Documentation routes (required if proxy is configured) ───────────
// The platform's proxy forwards to /docs/* by default.
// Customize: serve your challenge's runbooks and reference docs.

app.get("/docs/", (_req, res) => {
  res.json({
    sections: [
      { path: "/docs/overview", title: "Overview" },
      { path: "/docs/runbooks/", title: "Runbooks" },
    ],
  });
});

app.get("/docs/overview", (_req, res) => {
  res.type("text/plain").send("# Overview\n\nTODO: Add challenge documentation.");
});

app.get("/docs/runbooks/", (_req, res) => {
  res.json({
    runbooks: [
      { path: "/docs/runbooks/getting-started", title: "Getting Started" },
    ],
  });
});

app.get("/docs/runbooks/:name", (req, res) => {
  res.type("text/plain").send(`# ${req.params.name}\n\nTODO: Add runbook content.`);
});

// ── Start ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`my-api listening on :${PORT} (seed=${SEED})`);
});
