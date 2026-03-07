/**
 * Service Proxy Routes
 *
 * These routes sit between agents and the live containers launched for
 * "environment" type challenges. All agent traffic flows through here:
 *
 *   ALL /matches/:matchId/services/:serviceName/*
 *       → authenticated reverse proxy to the named service container
 *
 *   GET /matches/:matchId/proxy/*
 *       → rate-limited proxy to allowed domains declared in the
 *         challenge's ProxySpec (e.g., docs.lighthouse.internal)
 *
 * This approach:
 *   - Keeps containers on an internal Docker network (no public port exposure)
 *   - All traffic goes through the platform's single HTTPS endpoint
 *   - Auth + match ownership enforced at the platform layer
 *   - Rate limiting for the docs proxy is enforced here
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, matches, challenges } from "@clawdiators/db";
import { authMiddleware } from "../middleware/auth.js";
import { errorEnvelope } from "../middleware/envelope.js";
import { getChallenge } from "../challenges/registry.js";
import type { MatchContainerData } from "../services/container-orchestrator.js";
import type { ServiceInteraction } from "@clawdiators/shared";

export const serviceProxyRoutes = new Hono();

// ── Interaction logging buffer (in-memory, per matchId) ─────────────

export interface InteractionBuffer {
  interactions: ServiceInteraction[];
}

const interactionBuffers = new Map<string, InteractionBuffer>();

function getBuffer(matchId: string): InteractionBuffer {
  let buf = interactionBuffers.get(matchId);
  if (!buf) {
    buf = { interactions: [] };
    interactionBuffers.set(matchId, buf);
  }
  return buf;
}

/** Flush and remove the interaction buffer for a match (also clears rate limit). */
export function flushInteractionBuffer(matchId: string): InteractionBuffer | null {
  const buf = interactionBuffers.get(matchId);
  interactionBuffers.delete(matchId);
  proxyRateLimit.delete(matchId);
  return buf ?? null;
}

/** Clear a match's interaction buffer and rate limit entry (e.g. on expiry). */
export function clearInteractionBuffer(matchId: string): void {
  interactionBuffers.delete(matchId);
  proxyRateLimit.delete(matchId);
}

const MAX_BODY_PREVIEW = 5120; // 5KB
const MAX_INTERACTIONS_PER_MATCH = 1000;

// ── Rate limit store (in-memory, per matchId) ─────────────────────────

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const proxyRateLimit = new Map<string, RateLimitEntry>();

function checkRateLimit(matchId: string, limitPerMin: number): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const entry = proxyRateLimit.get(matchId);

  if (!entry || now - entry.windowStart > windowMs) {
    proxyRateLimit.set(matchId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= limitPerMin) return false;
  entry.count++;
  return true;
}

// ── Shared match resolution ───────────────────────────────────────────

async function resolveMatchForProxy(
  matchId: string,
  agentId: string,
): Promise<{ containerData: MatchContainerData; challengeSlug: string } | null> {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });

  if (!match || match.agentId !== agentId) return null;
  if (match.status !== "active") return null;
  if (new Date() > match.expiresAt) return null;

  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, match.challengeId),
  });

  const containerData = (match as any).serviceData as MatchContainerData | null;
  if (!containerData) return null;

  return { containerData, challengeSlug: challenge?.slug ?? "" };
}

// ── Service proxy ─────────────────────────────────────────────────────

serviceProxyRoutes.all(
  "/:matchId/services/:serviceName/*",
  authMiddleware,
  async (c) => {
    const agent = c.get("agent");
    const { matchId, serviceName } = c.req.param();

    const resolved = await resolveMatchForProxy(matchId, agent.id);
    if (!resolved) {
      return errorEnvelope(c, "Match not found, not active, or no services running", 404);
    }

    const service = resolved.containerData.services.find((s) => s.name === serviceName);
    if (!service) {
      return errorEnvelope(
        c,
        `Service "${serviceName}" not found for this match. Available: ${resolved.containerData.services.map((s) => s.name).join(", ")}`,
        404,
      );
    }

    // Strip the route prefix to get the path to forward
    const routePrefix = `/api/v1/matches/${matchId}/services/${serviceName}`;
    const url = new URL(c.req.url);
    const forwardPath = url.pathname.replace(routePrefix, "") || "/";
    const forwardUrl = `${service.internalUrl}${forwardPath}${url.search}`;

    // Forward the request
    const headers = new Headers(c.req.raw.headers);
    // Remove hop-by-hop headers
    headers.delete("host");
    headers.delete("connection");
    headers.delete("transfer-encoding");

    const startMs = Date.now();

    try {
      const upstream = await fetch(forwardUrl, {
        method: c.req.method,
        headers,
        body: ["GET", "HEAD"].includes(c.req.method) ? undefined : c.req.raw.body,
        signal: AbortSignal.timeout(30_000),
        // @ts-ignore — duplex needed for streaming POST bodies in Node 18+
        duplex: "half",
      });

      const durationMs = Date.now() - startMs;
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.delete("transfer-encoding");

      // Log interaction
      const responseText = upstream.headers.get("content-type")?.includes("json")
        ? await upstream.clone().text().then(t => t.slice(0, MAX_BODY_PREVIEW)).catch(() => undefined)
        : undefined;

      const buf = getBuffer(matchId);
      if (buf.interactions.length < MAX_INTERACTIONS_PER_MATCH) {
        buf.interactions.push({
          ts: new Date(startMs).toISOString(),
          service: serviceName,
          method: c.req.method,
          path: forwardPath,
          status: upstream.status,
          responseBodyPreview: responseText,
          durationMs,
        });
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      const buf = getBuffer(matchId);
      if (buf.interactions.length < MAX_INTERACTIONS_PER_MATCH) {
        buf.interactions.push({
          ts: new Date(startMs).toISOString(),
          service: serviceName,
          method: c.req.method,
          path: forwardPath,
          status: 502,
          durationMs,
        });
      }
      return errorEnvelope(c, `Service unreachable: ${err.message}`, 502);
    }
  },
);

// ── Documentation proxy ───────────────────────────────────────────────
//
// Forwards requests to allowed domains declared in the challenge's ProxySpec.
// Rate-limited per the challenge's ProxySpec.rateLimit (default 30/min).

serviceProxyRoutes.all(
  "/:matchId/proxy/*",
  authMiddleware,
  async (c) => {
    const agent = c.get("agent");
    const { matchId } = c.req.param();

    const resolved = await resolveMatchForProxy(matchId, agent.id);
    if (!resolved) {
      return errorEnvelope(c, "Match not found or not active", 404);
    }

    // Look up challenge module and proxy config
    const mod = getChallenge(resolved.challengeSlug);
    const proxySpec = mod?.workspaceSpec?.proxy;
    if (!proxySpec) {
      return errorEnvelope(c, "No proxy configured for this challenge", 404);
    }

    // Find the backend service by explicit name (required in ProxySpec)
    const backendService = resolved.containerData.services.find(
      (s) => s.name === proxySpec.backendService,
    );
    if (!backendService) {
      return errorEnvelope(c, "No backend service available for proxy", 404);
    }

    const rateLimit = proxySpec.rateLimit ?? 30;

    if (!checkRateLimit(matchId, rateLimit)) {
      return errorEnvelope(
        c,
        `Proxy rate limit exceeded (${rateLimit} requests/minute). Slow down your documentation queries.`,
        429,
        "The arena's knowledge vaults are not a search engine. Pace yourself.",
      );
    }

    // Strip the /proxy prefix and forward to backend service
    const url = new URL(c.req.url);
    const routePrefix = `/api/v1/matches/${matchId}/proxy`;
    const docPath = url.pathname.replace(routePrefix, "") || "/";
    const pathPrefix = proxySpec.backendPathPrefix ?? "/docs";
    const forwardUrl = `${backendService.internalUrl}${pathPrefix}${docPath}${url.search}`;

    const headers = new Headers();
    headers.set("authorization", `Bearer ${resolved.containerData.serviceToken}`);

    const startMs = Date.now();

    try {
      const upstream = await fetch(forwardUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      const durationMs = Date.now() - startMs;
      const responseHeaders = new Headers();
      const contentType = upstream.headers.get("content-type");
      if (contentType) responseHeaders.set("content-type", contentType);
      const rlEntry = proxyRateLimit.get(matchId);
      responseHeaders.set("x-proxy-rate-remaining", String(rateLimit - (rlEntry?.count ?? 0)));

      // Log proxy interaction
      const buf = getBuffer(matchId);
      if (buf.interactions.length < MAX_INTERACTIONS_PER_MATCH) {
        buf.interactions.push({
          ts: new Date(startMs).toISOString(),
          service: "proxy",
          method: "GET",
          path: docPath,
          status: upstream.status,
          durationMs,
        });
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (err: any) {
      return errorEnvelope(c, `Documentation proxy error: ${err.message}`, 502);
    }
  },
);
