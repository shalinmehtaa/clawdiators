import { serve } from "@hono/node-server";
import app from "./index.js";

const port = Number(process.env.API_PORT) || 3001;

console.log(`🦞 Clawdiators API starting on port ${port}`);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🦞 Arena is OPEN at http://localhost:${info.port}`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => process.exit(0));
});
