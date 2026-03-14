/**
 * Campaign Service Proxy Routes
 *
 * Reverse proxy for campaign lab services. Follows the same pattern as
 * service-proxy.ts but resolves campaigns + active sessions instead of matches.
 *
 *   ALL /campaigns/:campaignId/services/:serviceName/*
 *       → authenticated reverse proxy to the named service container
 */

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { db, campaigns, campaignSessions } from "@clawdiators/db";
import { authMiddleware } from "../middleware/auth.js";
import { errorEnvelope } from "../middleware/envelope.js";
import type { MatchContainerData } from "../services/container-orchestrator.js";
import type { ServiceInteraction } from "@clawdiators/shared";

export const campaignServiceProxyRoutes = new Hono();

// ── Interaction logging buffer (in-memory, per campaignId) ──────────

interface InteractionBuffer {
  interactions: ServiceInteraction[];
}

const interactionBuffers = new Map<string, InteractionBuffer>();

function getBuffer(campaignId: string): InteractionBuffer {
  let buf = interactionBuffers.get(campaignId);
  if (!buf) {
    buf = { interactions: [] };
    interactionBuffers.set(campaignId, buf);
  }
  return buf;
}

/** Flush and remove the interaction buffer for a campaign. */
export function flushCampaignInteractionBuffer(campaignId: string): InteractionBuffer | null {
  const buf = interactionBuffers.get(campaignId);
  interactionBuffers.delete(campaignId);
  return buf ?? null;
}

/** Clear a campaign's interaction buffer. */
export function clearCampaignInteractionBuffer(campaignId: string): void {
  interactionBuffers.delete(campaignId);
}

const MAX_BODY_PREVIEW = 5120; // 5KB
const MAX_INTERACTIONS_PER_CAMPAIGN = 1000;

// ── Campaign resolution ─────────────────────────────────────────────

async function resolveCampaignForProxy(
  campaignId: string,
  agentId: string,
): Promise<{ containerData: MatchContainerData } | null> {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });

  if (!campaign || campaign.agentId !== agentId) return null;
  if (campaign.status !== "active") return null;

  // Find active session
  const activeSession = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.campaignId, campaignId),
      eq(campaignSessions.status, "active"),
    ),
  });

  if (!activeSession) return null;
  if (new Date() > activeSession.expiresAt) return null;

  const containerData = activeSession.serviceData as unknown as MatchContainerData | null;
  if (!containerData) return null;

  return { containerData };
}

// ── Service proxy ───────────────────────────────────────────────────

campaignServiceProxyRoutes.all(
  "/:campaignId/services/:serviceName/*",
  authMiddleware,
  async (c) => {
    const agent = c.get("agent");
    const { campaignId, serviceName } = c.req.param();

    const resolved = await resolveCampaignForProxy(campaignId, agent.id);
    if (!resolved) {
      return errorEnvelope(c, "Campaign not found, not active, or no services running", 404);
    }

    const service = resolved.containerData.services.find((s) => s.name === serviceName);
    if (!service) {
      return errorEnvelope(
        c,
        `Service "${serviceName}" not found for this campaign. Available: ${resolved.containerData.services.map((s) => s.name).join(", ")}`,
        404,
      );
    }

    // Strip the route prefix to get the path to forward
    const routePrefix = `/api/v1/campaigns/${campaignId}/services/${serviceName}`;
    const url = new URL(c.req.url);
    const forwardPath = url.pathname.replace(routePrefix, "") || "/";
    const forwardUrl = `${service.internalUrl}${forwardPath}${url.search}`;

    // Forward the request
    const headers = new Headers(c.req.raw.headers);
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

      const buf = getBuffer(campaignId);
      if (buf.interactions.length < MAX_INTERACTIONS_PER_CAMPAIGN) {
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
      const buf = getBuffer(campaignId);
      if (buf.interactions.length < MAX_INTERACTIONS_PER_CAMPAIGN) {
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
