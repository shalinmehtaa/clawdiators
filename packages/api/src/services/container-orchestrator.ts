/**
 * Container Orchestrator
 *
 * Manages Docker containers for "environment" type challenges.
 * Uses the same execFile("docker") pattern as docker-evaluator.ts.
 *
 * At match entry: launches service + MCP containers, waits for health checks,
 * returns internal URLs for proxy routing and agent-facing URLs for CHALLENGE.md.
 *
 * At match completion/expiry: stops and removes all containers.
 *
 * Network modes:
 *   - If DOCKER_NETWORK env is set: API is inside Docker on that network,
 *     containers are reachable by name (no host port publish needed).
 *   - Otherwise: API is on the host, containers publish random host ports,
 *     internal URLs use localhost:<hostPort>.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ServiceSpec, McpServerSpec, WorkspaceSpec } from "@clawdiators/shared";

const execFileAsync = promisify(execFile);

// ── Types ─────────────────────────────────────────────────────────────

export interface RunningService {
  name: string;
  containerId: string;
  containerName: string;
  /** Internal URL reachable from the API process (for proxy forwarding) */
  internalUrl: string;
  hostPort?: number;
}

export interface RunningMcpServer {
  name: string;
  containerId: string;
  containerName: string;
  internalUrl: string;
  hostPort?: number;
  /** Per-match auth token for this MCP server */
  token: string;
}

/**
 * Stored in matches.serviceData — everything needed to proxy requests
 * and stop containers at match end.
 */
export interface MatchContainerData {
  services: RunningService[];
  mcpServers: RunningMcpServer[];
  /** Shared auth token for all live simulation services */
  serviceToken: string;
  /** When containers were launched (ISO string) */
  launchedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Cryptographically weak but sufficient per-match token. */
function generateMatchToken(): string {
  return `mtk_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Stable, unique container name for a match + service. */
function makeContainerName(matchId: string, serviceName: string): string {
  // Shorten matchId to 8 hex chars to keep names under 63 chars
  const shortId = matchId.replace(/-/g, "").slice(0, 8);
  return `clw-${shortId}-${serviceName}`;
}

/**
 * True when the API process is running inside a Docker container
 * and therefore can reach sibling containers by name on the shared network.
 */
function isApiInDocker(): boolean {
  return !!process.env.DOCKER_NETWORK;
}

function getDockerNetwork(): string {
  return process.env.DOCKER_NETWORK ?? "arena";
}

// ── Core: start one container ─────────────────────────────────────────

interface ContainerStartResult {
  containerId: string;
  containerName: string;
  internalUrl: string;
  hostPort?: number;
}

async function startContainer(
  matchId: string,
  serviceName: string,
  image: string,
  containerPort: number,
  env: Record<string, string>,
  resources: { memory?: string; cpus?: number } = {},
): Promise<ContainerStartResult> {
  const name = makeContainerName(matchId, serviceName);

  const envFlags: string[] = [];
  for (const [k, v] of Object.entries(env)) {
    envFlags.push("-e", `${k}=${v}`);
  }

  const memFlag = resources.memory ?? "512m";
  const cpuFlag = String(resources.cpus ?? 1);

  const inDocker = isApiInDocker();
  const network = getDockerNetwork();
  const portFlags = inDocker ? [] : ["-p", `0:${containerPort}`];

  const { stdout: idRaw } = await execFileAsync(
    "docker",
    [
      "run",
      "-d",
      "--rm",
      "--name", name,
      "--network", network,
      `--memory=${memFlag}`,
      `--cpus=${cpuFlag}`,
      "--pids-limit=100",
      ...portFlags,
      ...envFlags,
      image,
    ],
    { timeout: 30_000 },
  );

  const containerId = idRaw.trim();

  let internalUrl: string;
  let hostPort: number | undefined;

  if (inDocker) {
    // Reachable by container name on the shared Docker network
    internalUrl = `http://${name}:${containerPort}`;
  } else {
    // Get the random host port Docker assigned
    const { stdout: portRaw } = await execFileAsync(
      "docker",
      ["port", containerId, String(containerPort)],
      { timeout: 5_000 },
    );
    // portRaw: "0.0.0.0:49153\n" or "[::]:49153\n"
    const m = portRaw.trim().match(/:(\d+)$/);
    if (!m) throw new Error(`Could not parse host port for container ${name}: "${portRaw.trim()}"`);
    hostPort = parseInt(m[1], 10);
    internalUrl = `http://localhost:${hostPort}`;
  }

  return { containerId, containerName: name, internalUrl, hostPort };
}

// ── Health checking ───────────────────────────────────────────────────

async function waitForHttpHealth(
  internalUrl: string,
  path: string,
  intervalSecs: number,
  timeoutSecs: number,
  startDelaySecs: number,
): Promise<void> {
  if (startDelaySecs > 0) {
    await sleep(startDelaySecs * 1000);
  }

  const deadline = Date.now() + timeoutSecs * 1000;
  const url = `${internalUrl}${path}`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (res.ok) return;
    } catch {
      // Not ready yet — keep polling
    }
    await sleep(intervalSecs * 1000);
  }

  throw new Error(`Health check timed out for ${url} after ${timeoutSecs}s`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Launch all services and MCP servers declared in a workspaceSpec.
 * Called from the match entry route before returning to the agent.
 *
 * Containers are started sequentially (respecting dependsOn order for services).
 * MCP servers start in parallel after services are healthy.
 *
 * Returns MatchContainerData which is stored in matches.serviceData and used
 * by the proxy routes + cleanup code.
 */
export async function launchMatchContainers(
  matchId: string,
  seed: number,
  workspaceSpec: Pick<WorkspaceSpec, "services" | "mcpServers">,
): Promise<MatchContainerData> {
  const serviceToken = generateMatchToken();
  const services: RunningService[] = [];
  const mcpServers: RunningMcpServer[] = [];

  // Start live simulation services (sequentially — may have dependsOn ordering)
  for (const spec of workspaceSpec.services ?? []) {
    const containerPort = spec.ports[0]?.container ?? 3000;
    const env: Record<string, string> = {
      SEED: String(seed),
      MATCH_ID: matchId,
      SERVICE_TOKEN: serviceToken,
      PORT: String(containerPort),
      ...Object.fromEntries(
        Object.entries(spec.env ?? {}).map(([k, v]) => [
          k,
          v.replace(/\{\{seed\}\}/g, String(seed)).replace(/\{\{match_id\}\}/g, matchId),
        ]),
      ),
    };

    const res = await startContainer(
      matchId, spec.name, spec.image, containerPort, env,
      { memory: spec.resources?.memory, cpus: spec.resources?.cpus },
    );

    if (spec.healthCheck) {
      const hc = spec.healthCheck;
      await waitForHttpHealth(
        res.internalUrl,
        hc.path,
        hc.intervalSecs ?? 2,
        hc.timeoutSecs ?? 45,
        hc.startDelaySecs ?? 3,
      );
    }

    services.push({ name: spec.name, ...res });
  }

  // Start MCP servers (each gets its own auth token)
  const mcpStartPromises = (workspaceSpec.mcpServers ?? []).map(async (spec) => {
    const mcpToken = generateMatchToken();
    const containerPort = spec.port ?? 3000;
    const env: Record<string, string> = {
      SEED: String(seed),
      MATCH_ID: matchId,
      MCP_TOKEN: mcpToken,
      PORT: String(containerPort),
      ...Object.fromEntries(
        Object.entries(spec.env ?? {}).map(([k, v]) => [
          k,
          v.replace(/\{\{seed\}\}/g, String(seed)).replace(/\{\{match_id\}\}/g, matchId),
        ]),
      ),
    };

    const res = await startContainer(
      matchId, spec.name, spec.image, containerPort, env,
      { memory: spec.resourceLimits?.memory, cpus: spec.resourceLimits?.cpus },
    );

    // MCP health: poll /health (all three services expose this)
    await waitForHttpHealth(
      res.internalUrl, "/health", 2, spec.healthCheckTimeoutSecs ?? 30, 2,
    );

    return { name: spec.name, ...res, token: mcpToken };
  });

  const started = await Promise.all(mcpStartPromises);
  mcpServers.push(...started);

  return { services, mcpServers, serviceToken, launchedAt: new Date().toISOString() };
}

/**
 * Stop and remove all containers associated with a match.
 * Called on submit, expire, or heartbeat miss. Best-effort — never throws.
 */
export function stopMatchContainers(containerData: MatchContainerData): void {
  const names = [
    ...containerData.services.map((s) => s.containerName),
    ...containerData.mcpServers.map((m) => m.containerName),
  ];

  for (const name of names) {
    execFileAsync("docker", ["rm", "-f", name], { timeout: 10_000 }).catch(() => {
      // Best-effort — container may have already exited
    });
  }
}
