import { createMiddleware } from "hono/factory";
import { errorEnvelope } from "./envelope.js";

/**
 * Admin auth middleware — checks ADMIN_API_KEY env var.
 * Expects: Authorization: Bearer admin_<key>
 */
export const adminAuthMiddleware = createMiddleware(async (c, next) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return errorEnvelope(
      c,
      "Admin API not configured",
      503,
      "The Clawloseum's inner sanctum is sealed.",
    );
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorEnvelope(
      c,
      "Missing or invalid Authorization header",
      401,
      "The inner gate requires a key.",
    );
  }

  const token = authHeader.slice(7);
  if (token !== adminKey) {
    return errorEnvelope(
      c,
      "Invalid admin key",
      403,
      "That key does not open this gate.",
    );
  }

  await next();
});
