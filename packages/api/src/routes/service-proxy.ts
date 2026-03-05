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
import type { ServiceInteraction, McpToolCallRecord, McpResourceReadRecord } from "@clawdiators/shared";

export const serviceProxyRoutes = new Hono();

// ── Interaction logging buffer (in-memory, per matchId) ─────────────

export interface InteractionBuffer {
  interactions: ServiceInteraction[];
  mcpToolCalls: McpToolCallRecord[];
  mcpResourceReads: McpResourceReadRecord[];
}

const interactionBuffers = new Map<string, InteractionBuffer>();

function getBuffer(matchId: string): InteractionBuffer {
  let buf = interactionBuffers.get(matchId);
  if (!buf) {
    buf = { interactions: [], mcpToolCalls: [], mcpResourceReads: [] };
    interactionBuffers.set(matchId, buf);
  }
  return buf;
}

/** Flush and remove the interaction buffer for a match. */
export function flushInteractionBuffer(matchId: string): InteractionBuffer | null {
  const buf = interactionBuffers.get(matchId);
  interactionBuffers.delete(matchId);
  return buf ?? null;
}

/** Clear a match's interaction buffer (e.g. on expiry). */
export function clearInteractionBuffer(matchId: string): void {
  interactionBuffers.delete(matchId);
}

const MAX_BODY_PREVIEW = 5120; // 5KB

async function captureBodyPreview(body: ReadableStream<Uint8Array> | string | null | undefined): Promise<string | undefined> {
  if (!body) return undefined;
  if (typeof body === "string") return body.slice(0, MAX_BODY_PREVIEW);
  try {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    while (totalLen < MAX_BODY_PREVIEW) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLen += value.length;
    }
    reader.releaseLock();
    const decoder = new TextDecoder();
    return chunks.map(c => decoder.decode(c, { stream: true })).join("").slice(0, MAX_BODY_PREVIEW);
  } catch {
    return undefined;
  }
}

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
      buf.interactions.push({
        ts: new Date(startMs).toISOString(),
        service: serviceName,
        method: c.req.method,
        path: forwardPath,
        status: upstream.status,
        responseBodyPreview: responseText,
        durationMs,
      });

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      const buf = getBuffer(matchId);
      buf.interactions.push({
        ts: new Date(startMs).toISOString(),
        service: serviceName,
        method: c.req.method,
        path: forwardPath,
        status: 502,
        durationMs,
      });
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

    // SSE connections persist for the entire match duration (up to 90 min).
    // Use a 3-hour timeout so we never kill a live MCP session mid-operation.
    // Regular tool-call requests complete in well under 30 seconds.
    const isSSE = (c.req.header("accept") ?? "").includes("text/event-stream");
    const mcpTimeoutMs = isSSE ? 3 * 60 * 60 * 1000 : 30_000;

    const startMs = Date.now();

    // Try to parse MCP request body for tool call / resource read logging
    let mcpRequestBody: Record<string, unknown> | null = null;
    if (c.req.method === "POST" && !isSSE) {
      try {
        mcpRequestBody = await c.req.json();
      } catch {
        // Not JSON or body already consumed — skip MCP-specific logging
      }
    }

    try {
      const upstream = await fetch(forwardUrl, {
        method: c.req.method,
        headers,
        body: mcpRequestBody ? JSON.stringify(mcpRequestBody) : (
          ["GET", "HEAD"].includes(c.req.method) ? undefined : c.req.raw.body
        ),
        signal: AbortSignal.timeout(mcpTimeoutMs),
        // @ts-ignore
        duplex: "half",
      });

      const durationMs = Date.now() - startMs;
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.delete("transfer-encoding");

      // Log MCP interactions (non-SSE only — SSE is long-lived)
      if (!isSSE) {
        const buf = getBuffer(matchId);

        // Detect MCP tool calls vs resource reads from JSON-RPC method
        if (mcpRequestBody && mcpRequestBody.method === "tools/call") {
          const params = mcpRequestBody.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
          let resultData: unknown;
          try {
            const respJson = await upstream.clone().json() as { result?: unknown };
            resultData = respJson?.result;
          } catch { /* best-effort */ }
          buf.mcpToolCalls.push({
            ts: new Date(startMs).toISOString(),
            server: serverName,
            tool: params?.name ?? "unknown",
            arguments: params?.arguments ?? {},
            result: resultData,
            durationMs,
          });
        } else if (mcpRequestBody && mcpRequestBody.method === "resources/read") {
          const params = mcpRequestBody.params as { uri?: string } | undefined;
          let contentPreview: string | undefined;
          let mimeType: string | undefined;
          try {
            const respJson = await upstream.clone().json() as { result?: { contents?: Array<{ text?: string; mimeType?: string }> } };
            const first = respJson?.result?.contents?.[0];
            contentPreview = first?.text?.slice(0, MAX_BODY_PREVIEW);
            mimeType = first?.mimeType;
          } catch { /* best-effort */ }
          buf.mcpResourceReads.push({
            ts: new Date(startMs).toISOString(),
            server: serverName,
            uri: params?.uri ?? "unknown",
            mimeType,
            contentPreview,
            durationMs,
          });
        } else {
          // Generic MCP interaction — log as service interaction
          buf.interactions.push({
            ts: new Date(startMs).toISOString(),
            service: `mcp:${serverName}`,
            method: c.req.method,
            path: forwardPath,
            status: upstream.status,
            durationMs,
          });
        }
      }

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

    // Find the backend service: explicit backendService, or first service
    const backendServiceName = proxySpec.backendService ?? mod?.workspaceSpec?.services?.[0]?.name;
    const backendService = resolved.containerData.services.find(
      (s) => s.name === backendServiceName,
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
      buf.interactions.push({
        ts: new Date(startMs).toISOString(),
        service: "proxy",
        method: "GET",
        path: docPath,
        status: upstream.status,
        durationMs,
      });

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (err: any) {
      return errorEnvelope(c, `Documentation proxy error: ${err.message}`, 502);
    }
  },
);
