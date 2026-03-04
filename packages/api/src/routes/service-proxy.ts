/**
 * Service Proxy Routes
 *
 * These routes sit between agents and the live containers launched for
 * "environment" type challenges. All agent traffic flows through here:
 *
 *   ALL /matches/:matchId/services/:serviceName/*
 *       → authenticated reverse proxy to the named service container
 *
 *   ALL /matches/:matchId/mcp/:serverName/*
 *       → authenticated reverse proxy to the named MCP server container
 *
 *   GET /matches/:matchId/proxy/*
 *       → rate-limited proxy to docs.lighthouse.internal (and any other
 *         allowed domains declared in the challenge's ProxySpec)
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

export const serviceProxyRoutes = new Hono();

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

    try {
      const upstream = await fetch(forwardUrl, {
        method: c.req.method,
        headers,
        body: ["GET", "HEAD"].includes(c.req.method) ? undefined : c.req.raw.body,
        signal: AbortSignal.timeout(30_000),
        // @ts-ignore — duplex needed for streaming POST bodies in Node 18+
        duplex: "half",
      });

      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.delete("transfer-encoding");

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (err: any) {
      return errorEnvelope(c, `Service unreachable: ${err.message}`, 502);
    }
  },
);

// ── MCP server proxy ──────────────────────────────────────────────────

serviceProxyRoutes.all(
  "/:matchId/mcp/:serverName/*",
  authMiddleware,
  async (c) => {
    const agent = c.get("agent");
    const { matchId, serverName } = c.req.param();

    const resolved = await resolveMatchForProxy(matchId, agent.id);
    if (!resolved) {
      return errorEnvelope(c, "Match not found, not active, or no services running", 404);
    }

    const mcpServer = resolved.containerData.mcpServers.find((m) => m.name === serverName);
    if (!mcpServer) {
      return errorEnvelope(
        c,
        `MCP server "${serverName}" not found. Available: ${resolved.containerData.mcpServers.map((m) => m.name).join(", ")}`,
        404,
      );
    }

    const routePrefix = `/api/v1/matches/${matchId}/mcp/${serverName}`;
    const url = new URL(c.req.url);
    const forwardPath = url.pathname.replace(routePrefix, "") || "/";
    const forwardUrl = `${mcpServer.internalUrl}${forwardPath}${url.search}`;

    const headers = new Headers(c.req.raw.headers);
    headers.delete("host");
    headers.delete("connection");
    headers.delete("transfer-encoding");
    // Inject the MCP server's auth token so agents don't need separate credentials
    headers.set("authorization", `Bearer ${mcpServer.token}`);

    try {
      const upstream = await fetch(forwardUrl, {
        method: c.req.method,
        headers,
        body: ["GET", "HEAD"].includes(c.req.method) ? undefined : c.req.raw.body,
        signal: AbortSignal.timeout(60_000), // MCP SSE connections can be long
        // @ts-ignore
        duplex: "half",
      });

      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.delete("transfer-encoding");

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (err: any) {
      return errorEnvelope(c, `MCP server unreachable: ${err.message}`, 502);
    }
  },
);

// ── Documentation proxy ───────────────────────────────────────────────
//
// Serves docs content from docs.lighthouse.internal by forwarding to the
// lighthouse-api container's /docs/* routes.
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

    // Find the lighthouse-api service (docs are served from it)
    const lighthouseService = resolved.containerData.services.find(
      (s) => s.name === "lighthouse-api",
    );
    if (!lighthouseService) {
      return errorEnvelope(c, "No documentation service available for this challenge", 404);
    }

    // Look up rate limit from challenge's ProxySpec
    const mod = getChallenge(resolved.challengeSlug);
    const proxySpec = mod?.workspaceSpec?.proxy;
    const rateLimit = proxySpec?.rateLimit ?? 30;

    if (!checkRateLimit(matchId, rateLimit)) {
      return errorEnvelope(
        c,
        `Proxy rate limit exceeded (${rateLimit} requests/minute). Slow down your documentation queries.`,
        429,
        "The arena's knowledge vaults are not a search engine. Pace yourself.",
      );
    }

    // Strip the /proxy prefix and forward to lighthouse-api's /docs/
    const url = new URL(c.req.url);
    const routePrefix = `/api/v1/matches/${matchId}/proxy`;
    const docPath = url.pathname.replace(routePrefix, "") || "/";
    const forwardUrl = `${lighthouseService.internalUrl}/docs${docPath}${url.search}`;

    const headers = new Headers();
    headers.set("authorization", `Bearer ${resolved.containerData.serviceToken}`);

    try {
      const upstream = await fetch(forwardUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      const responseHeaders = new Headers();
      const contentType = upstream.headers.get("content-type");
      if (contentType) responseHeaders.set("content-type", contentType);
      responseHeaders.set("x-proxy-rate-remaining", String(rateLimit));

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (err: any) {
      return errorEnvelope(c, `Documentation proxy error: ${err.message}`, 502);
    }
  },
);
