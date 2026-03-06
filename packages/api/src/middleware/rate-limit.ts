import type { Context, MiddlewareHandler } from "hono";

interface RateLimitOpts {
  /** Maximum requests allowed in the window. */
  max: number;
  /** Window size in seconds. */
  windowSecs: number;
  /** Extract the key to rate-limit on. Defaults to bearer token prefix or IP. */
  keyFn?: (c: Context) => string;
}

const buckets = new Map<string, number[]>();

// Periodic cleanup — remove stale keys every 60s
let cleanupStarted = false;
function ensureCleanup(windowSecs: number): void {
  if (cleanupStarted) return;
  cleanupStarted = true;
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of buckets) {
      const cutoff = now - windowSecs * 1000;
      const filtered = timestamps.filter((t) => t > cutoff);
      if (filtered.length === 0) {
        buckets.delete(key);
      } else {
        buckets.set(key, filtered);
      }
    }
  }, 60_000);
  // Don't block process exit
  if (typeof interval === "object" && "unref" in interval) {
    interval.unref();
  }
}

function defaultKeyFn(c: Context): string {
  const auth = c.req.header("authorization") ?? "";
  if (auth.startsWith("Bearer clw_")) {
    // Use the first 12 chars after "clw_" as the key — unique per agent
    return `bearer:${auth.slice(11, 23)}`;
  }
  // Fall back to IP
  return `ip:${c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown"}`;
}

/**
 * Sliding-window in-memory rate limiter.
 * Returns 429 with Retry-After header when exceeded.
 */
export function rateLimit(opts: RateLimitOpts): MiddlewareHandler {
  const { max, windowSecs, keyFn = defaultKeyFn } = opts;
  ensureCleanup(windowSecs);

  return async (c, next) => {
    const key = keyFn(c);
    const now = Date.now();
    const cutoff = now - windowSecs * 1000;

    let timestamps = buckets.get(key);
    if (timestamps) {
      timestamps = timestamps.filter((t) => t > cutoff);
    } else {
      timestamps = [];
    }

    if (timestamps.length >= max) {
      const oldestInWindow = timestamps[0];
      const retryAfter = Math.ceil((oldestInWindow + windowSecs * 1000 - now) / 1000);
      c.header("Retry-After", String(Math.max(1, retryAfter)));
      c.header("X-RateLimit-Limit", String(max));
      c.header("X-RateLimit-Remaining", "0");
      return c.json(
        { ok: false, data: { error: "Rate limit exceeded" }, flavour: "The arena demands patience." },
        429,
      );
    }

    timestamps.push(now);
    buckets.set(key, timestamps);

    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(max - timestamps.length));

    await next();
  };
}

/** Clear all rate-limit state — for testing. */
export function resetRateLimitState(): void {
  buckets.clear();
}
