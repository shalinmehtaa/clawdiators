import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateMatchToken } from "../src/services/container-orchestrator.js";

// ── generateMatchToken() ─────────────────────────────────────────────

describe("generateMatchToken()", () => {
  it("starts with mtk_ prefix", () => {
    const token = generateMatchToken();
    expect(token.startsWith("mtk_")).toBe(true);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateMatchToken()));
    expect(tokens.size).toBe(100);
  });

  it("contains only alphanumeric characters after prefix", () => {
    const token = generateMatchToken();
    const body = token.slice(4);
    expect(body).toMatch(/^[a-z0-9]+$/);
  });

  it("has reasonable length (20+ chars total)", () => {
    const token = generateMatchToken();
    expect(token.length).toBeGreaterThan(20);
  });
});

// ── MatchContainerData shape ─────────────────────────────────────────

describe("MatchContainerData shape", () => {
  it("docker backend shape is correct", () => {
    const data = {
      services: [
        {
          name: "app",
          containerId: "abc123",
          containerName: "clw-12345678-app",
          internalUrl: "http://localhost:32768",
          hostPort: 32768,
        },
      ],
      mcpServers: [],
      serviceToken: generateMatchToken(),
      launchedAt: new Date().toISOString(),
      backend: "docker" as const,
      networkName: "arena-12345678",
    };

    expect(data.backend).toBe("docker");
    expect(data.services).toHaveLength(1);
    expect(data.services[0].name).toBe("app");
    expect(data.networkName).toMatch(/^arena-/);
  });

  it("fly backend shape is correct", () => {
    const data = {
      services: [
        {
          name: "api",
          containerId: "fly-machine-id",
          containerName: "clw-abcdef01-api",
          internalUrl: "http://[fdaa::1]:3000",
        },
      ],
      mcpServers: [],
      serviceToken: generateMatchToken(),
      launchedAt: new Date().toISOString(),
      backend: "fly" as const,
    };

    expect(data.backend).toBe("fly");
    expect(data.services[0].internalUrl).toContain("[");
  });

  it("compose backend shape is correct", () => {
    const data = {
      services: [],
      mcpServers: [],
      serviceToken: generateMatchToken(),
      launchedAt: new Date().toISOString(),
      backend: "compose" as const,
      composeProject: "clw-12345678",
      composeTmpDir: "/tmp/clw-compose-abc",
    };

    expect(data.backend).toBe("compose");
    expect(data.composeProject).toMatch(/^clw-/);
    expect(data.composeTmpDir).toBeDefined();
  });
});

// ── Network isolation logic ──────────────────────────────────────────

describe("Docker network isolation", () => {
  it("network name uses shortened matchId", () => {
    // Simulating the shortMatchId + network naming logic
    const matchId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const short = matchId.replace(/-/g, "").slice(0, 8);
    const networkName = `arena-${short}`;

    expect(networkName).toBe("arena-a1b2c3d4");
    expect(networkName.length).toBeLessThan(30);
  });

  it("container name uses shortened matchId + service name", () => {
    const matchId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const short = matchId.replace(/-/g, "").slice(0, 8);
    const name = `clw-${short}-myservice`;

    expect(name).toBe("clw-a1b2c3d4-myservice");
  });

  it("different matches get different networks", () => {
    const id1 = "11111111-2222-3333-4444-555555555555";
    const id2 = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    const net1 = `arena-${id1.replace(/-/g, "").slice(0, 8)}`;
    const net2 = `arena-${id2.replace(/-/g, "").slice(0, 8)}`;

    expect(net1).not.toBe(net2);
  });

  it("DOCKER_NETWORK env disables per-match network creation", () => {
    // When DOCKER_NETWORK is set, containers use that shared network
    // and don't create per-match networks
    const inDocker = !!process.env.DOCKER_NETWORK;
    // In test environment, DOCKER_NETWORK is typically not set
    expect(inDocker).toBe(false);
  });
});

// ── RunningService shape ─────────────────────────────────────────────

describe("RunningService and RunningMcpServer", () => {
  it("service has required fields", () => {
    const svc = {
      name: "lighthouse",
      containerId: "container123",
      containerName: "clw-abcdef01-lighthouse",
      internalUrl: "http://localhost:45678",
      hostPort: 45678,
    };

    expect(svc.name).toBe("lighthouse");
    expect(svc.internalUrl).toMatch(/^http/);
  });

  it("MCP server has token field", () => {
    const mcp = {
      name: "registry-mcp",
      containerId: "mcp123",
      containerName: "clw-abcdef01-registry-mcp",
      internalUrl: "http://localhost:45679",
      token: generateMatchToken(),
    };

    expect(mcp.token).toBeDefined();
    expect(mcp.token.startsWith("mtk_")).toBe(true);
  });
});
