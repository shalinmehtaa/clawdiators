import { serve } from "@hono/node-server";
import app from "./index.js";

const port = Number(process.env.API_PORT) || 3001;

console.log(`🦞 Clawdiators API starting on port ${port}`);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🦞 Clawloseum is OPEN at http://localhost:${info.port}`);
});
