/**
 * Arena Runner HTTP/HTTPS Proxy
 *
 * Listens on port 8080 as an HTTP proxy. Intercepts HTTPS traffic via CONNECT
 * tunnels to LLM providers. Builds a hash chain over all LLM calls and writes
 * an attestation file when the /attestation/done sentinel is detected.
 */

import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as tls from "node:tls";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import { computeChainHash, hashBody } from "./chain.js";
import { detectProvider, parseResponseBody, parseRequestBody } from "./providers.js";
import { isStreamingResponse, accumulateSSE, extractStreamingUsage, extractStreamingToolNames, extractNonStreamingToolNames } from "./streaming.js";
import { parseConstraints, checkCallLimit, checkTokenBudget, checkModelAllowed } from "./constraints.js";
import { computeCost, loadPricingFromAPI } from "./pricing.js";
import type { LLMCallRecord, VerifiedAttestation, ConstraintViolation, HarnessSnapshot } from "./types.js";

// ── Configuration ──────────────────────────────────────────────────────

const PORT = parseInt(process.env.PROXY_PORT ?? "8080", 10);
const NONCE = process.env.PROXY_NONCE;
const IMAGE_DIGEST = process.env.IMAGE_DIGEST ?? "sha256:unknown";
const ATTESTATION_DIR = process.env.ATTESTATION_DIR ?? "/attestation";
const CERT_CACHE_DIR = "/tmp/certs";

if (!NONCE) {
  console.error("PROXY_NONCE environment variable is required");
  process.exit(1);
}

// ── Constraints ────────────────────────────────────────────────────────

const constraints = parseConstraints(process.env.PROXY_CONSTRAINTS);

// ── State ──────────────────────────────────────────────────────────────

const state = {
  nonce: NONCE,
  calls: [] as LLMCallRecord[],
  violations: [] as ConstraintViolation[],
  seq: 0,
  prevHash: NONCE,
  cumulativeTokens: 0,
  startedAt: new Date(),
  // Harness fingerprinting — populated from the first intercepted request
  harnessSnapshot: {
    system_prompt_hash: null as string | null,
    tool_definitions_hash: null as string | null,
    tools_observed: [] as string[],
    models_used: [] as string[],
    firstRequestSeen: false,
  },
  // Activity counters
  totalToolCalls: 0,
};

fs.mkdirSync(ATTESTATION_DIR, { recursive: true });
fs.mkdirSync(CERT_CACHE_DIR, { recursive: true });

// ── CA Loading ─────────────────────────────────────────────────────────

const CA_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const CA_KEY_PATH = path.join(CA_DIR, "ca.key");
const CA_CRT_PATH = path.join(CA_DIR, "ca.crt");

let caKey: string;
let caCert: string;

try {
  caKey = fs.readFileSync(CA_KEY_PATH, "utf-8");
  caCert = fs.readFileSync(CA_CRT_PATH, "utf-8");
} catch {
  console.error(`CA cert/key not found at ${CA_DIR}. Run gen-ca first.`);
  process.exit(1);
}

// ── Per-host Certificate Generation ───────────────────────────────────

function getHostCert(hostname: string): { key: string; cert: string } {
  const safeHost = hostname.replace(/[^a-z0-9.-]/gi, "_");
  const keyPath = path.join(CERT_CACHE_DIR, `${safeHost}.key`);
  const crtPath = path.join(CERT_CACHE_DIR, `${safeHost}.crt`);
  const csrPath = path.join(CERT_CACHE_DIR, `${safeHost}.csr`);

  if (fs.existsSync(keyPath) && fs.existsSync(crtPath)) {
    return {
      key: fs.readFileSync(keyPath, "utf-8"),
      cert: fs.readFileSync(crtPath, "utf-8"),
    };
  }

  execSync(
    `openssl genrsa -out "${keyPath}" 2048 2>/dev/null && ` +
      `openssl req -new -key "${keyPath}" -out "${csrPath}" -subj "/CN=${hostname}" 2>/dev/null && ` +
      `openssl x509 -req -in "${csrPath}" -CA "${CA_CRT_PATH}" -CAkey "${CA_KEY_PATH}" ` +
      `-CAcreateserial -out "${crtPath}" -days 365 ` +
      `-extfile <(echo "subjectAltName=DNS:${hostname}") 2>/dev/null`,
    { shell: "/bin/bash" },
  );

  return {
    key: fs.readFileSync(keyPath, "utf-8"),
    cert: fs.readFileSync(crtPath, "utf-8"),
  };
}

// ── LLM Provider Detection ─────────────────────────────────────────────

const LLM_HOSTS = new Set([
  "api.anthropic.com",
  "api.openai.com",
  "generativelanguage.googleapis.com",
  "openrouter.ai",
  "api.together.xyz",
]);

function isLLMHost(hostname: string): boolean {
  return LLM_HOSTS.has(hostname);
}

// ── Call Recording ─────────────────────────────────────────────────────

function recordCall(record: LLMCallRecord): void {
  state.prevHash = computeChainHash(state.prevHash, record.seq, record);
  state.calls.push(record);

  const callsPath = path.join(ATTESTATION_DIR, "calls.jsonl");
  fs.appendFileSync(callsPath, JSON.stringify(record) + "\n");
}

// ── Attestation Finalization ───────────────────────────────────────────

function finalizeAttestation(): void {
  const wallClockSecs = Math.round((Date.now() - state.startedAt.getTime()) / 1000);

  const { firstRequestSeen: _, ...harnessSnapshotData } = state.harnessSnapshot;
  const harness_snapshot: HarnessSnapshot = harnessSnapshotData;

  const estimated_cost = computeCost(state.calls);

  const attestation: VerifiedAttestation = {
    image_digest: IMAGE_DIGEST,
    nonce: state.nonce,
    chain_head_hash: state.prevHash,
    chain_length: state.calls.length,
    llm_calls: state.calls,
    total_input_tokens: state.calls.reduce((s, c) => s + c.input_tokens, 0),
    total_output_tokens: state.calls.reduce((s, c) => s + c.output_tokens, 0),
    total_llm_calls: state.calls.length,
    total_tool_calls: state.totalToolCalls,
    wall_clock_secs: wallClockSecs,
    harness_snapshot,
    estimated_cost,
    activity_summary: {
      unique_tools: [...new Set(state.harnessSnapshot.tools_observed)],
      files_read: 0,
      files_written: 0,
      commands_run: 0,
    },
    constraint_violations: state.violations,
  };

  fs.writeFileSync(
    path.join(ATTESTATION_DIR, "attestation.json"),
    JSON.stringify(attestation, null, 2),
  );

  console.log(`[proxy] Attestation finalized: ${state.calls.length} LLM calls`);
}

// ── HTTPS Interception Handler ─────────────────────────────────────────

function handleConnect(
  req: http.IncomingMessage,
  clientSocket: net.Socket,
  _head: Buffer,
): void {
  const [hostname, portStr] = (req.url ?? "").split(":");
  const port = parseInt(portStr ?? "443", 10);

  if (!isLLMHost(hostname)) {
    // Enforce networkAccess=false for non-LLM hosts
    if (constraints?.networkAccess === false) {
      const violation: ConstraintViolation = {
        type: "network_blocked",
        detail: `network access blocked: ${hostname}`,
        seq: 0,
        ts: new Date().toISOString(),
      };
      state.violations.push(violation);
      console.log(`[proxy] Network blocked: ${hostname}`);
      clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      clientSocket.destroy();
      return;
    }
    // Transparent passthrough for non-LLM hosts
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    const serverSocket = net.connect(port, hostname, () => {
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });
    serverSocket.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => serverSocket.destroy());
    return;
  }

  // Enforce call limit before establishing LLM tunnel
  if (constraints?.maxLlmCalls !== undefined && checkCallLimit(state.seq, constraints.maxLlmCalls)) {
    const violation: ConstraintViolation = {
      type: "call_limit",
      detail: `call_limit exceeded: ${state.seq} >= ${constraints.maxLlmCalls}`,
      seq: state.seq,
      ts: new Date().toISOString(),
    };
    state.violations.push(violation);
    console.log(`[proxy] Call limit exceeded: ${state.seq}/${constraints.maxLlmCalls}`);
    clientSocket.write("HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain\r\n\r\nLLM call limit exceeded\n");
    clientSocket.destroy();
    return;
  }

  // Enforce token budget before establishing LLM tunnel (from previous calls)
  if (constraints?.tokenBudget !== undefined && checkTokenBudget(state.cumulativeTokens, constraints.tokenBudget)) {
    const violation: ConstraintViolation = {
      type: "token_budget",
      detail: `token_budget exceeded: ${state.cumulativeTokens} > ${constraints.tokenBudget}`,
      seq: state.seq,
      ts: new Date().toISOString(),
    };
    state.violations.push(violation);
    console.log(`[proxy] Token budget exceeded: ${state.cumulativeTokens}/${constraints.tokenBudget}`);
    clientSocket.write("HTTP/1.1 429 Too Many Requests\r\nContent-Type: text/plain\r\n\r\nToken budget exceeded\n");
    clientSocket.destroy();
    return;
  }

  clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");

  // TLS interception for LLM hosts
  const { key, cert } = getHostCert(hostname);
  const provider = detectProvider(hostname);

  const tlsServer = tls.createServer({ key, cert }, (clientTls) => {
    // Buffer incoming request
    const reqChunks: Buffer[] = [];
    let reqHeaders = "";
    let requestStartMs = 0;

    clientTls.on("data", (chunk: Buffer) => {
      reqChunks.push(chunk);
    });

    clientTls.on("end", () => {
      const rawRequest = Buffer.concat(reqChunks).toString("utf-8");

      // Parse HTTP request
      const headerEnd = rawRequest.indexOf("\r\n\r\n");
      reqHeaders = rawRequest.slice(0, headerEnd);
      const bodyStart = headerEnd + 4;
      const requestBody = rawRequest.slice(bodyStart);

      const requestHash = hashBody(requestBody);
      requestStartMs = Date.now();

      // Harness fingerprinting — extract system prompt + tool definitions from first request
      if (!state.harnessSnapshot.firstRequestSeen && requestBody) {
        state.harnessSnapshot.firstRequestSeen = true;
        const parsedReq = parseRequestBody(provider, requestBody);
        if (parsedReq.system_prompt) {
          state.harnessSnapshot.system_prompt_hash = hashBody(parsedReq.system_prompt);
        }
        if (parsedReq.tools) {
          state.harnessSnapshot.tool_definitions_hash = hashBody(JSON.stringify(parsedReq.tools));
        }
      }

      // Forward to real upstream
      const upstreamReq = https.request(
        {
          hostname,
          port: 443,
          path: reqHeaders.split("\r\n")[0]?.split(" ")[1] ?? "/",
          method: reqHeaders.split("\r\n")[0]?.split(" ")[0] ?? "POST",
          headers: parseHeaders(reqHeaders),
          rejectUnauthorized: true,
        },
        (upstreamRes) => {
          const resChunks: Buffer[] = [];
          const resHeaders = upstreamRes.headers as Record<string, string | string[] | undefined>;
          const streaming = isStreamingResponse(resHeaders);

          // Forward status + headers to client
          const statusLine = `HTTP/1.1 ${upstreamRes.statusCode} ${upstreamRes.statusMessage}\r\n`;
          const headerLines = Object.entries(upstreamRes.headers)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
            .join("\r\n");
          clientTls.write(statusLine + headerLines + "\r\n\r\n");

          upstreamRes.on("data", (chunk: Buffer) => {
            resChunks.push(chunk);
            clientTls.write(chunk);
          });

          upstreamRes.on("end", () => {
            clientTls.end();

            const durationMs = Date.now() - requestStartMs;
            const responseBody = streaming
              ? accumulateSSE(resChunks)
              : Buffer.concat(resChunks).toString("utf-8");
            const responseHash = hashBody(responseBody);

            let parsed;
            if (streaming) {
              parsed = extractStreamingUsage(provider, responseBody);
            } else {
              parsed = parseResponseBody(provider, responseBody);
            }

            state.seq += 1;
            const record: LLMCallRecord = {
              seq: state.seq,
              ts: new Date().toISOString(),
              provider,
              model: parsed.model,
              input_tokens: parsed.input_tokens,
              output_tokens: parsed.output_tokens,
              duration_ms: durationMs,
              status_code: upstreamRes.statusCode ?? 0,
              request_hash: requestHash,
              response_hash: responseHash,
              token_extraction: parsed.extraction,
            };

            recordCall(record);

            // Track tools used and model names
            const toolNames = streaming
              ? extractStreamingToolNames(provider, responseBody)
              : extractNonStreamingToolNames(provider, responseBody);
            state.totalToolCalls += toolNames.length;
            for (const name of toolNames) {
              if (!state.harnessSnapshot.tools_observed.includes(name)) {
                state.harnessSnapshot.tools_observed.push(name);
              }
            }
            if (record.model !== "unknown" && !state.harnessSnapshot.models_used.includes(record.model)) {
              state.harnessSnapshot.models_used.push(record.model);
            }

            console.log(`[proxy] ${provider} call #${record.seq}: ${record.input_tokens}in/${record.output_tokens}out (${record.token_extraction})${toolNames.length > 0 ? ` [${toolNames.length} tool call(s)]` : ""}`);

            // Post-call constraint checks (advisory — blocks next call)
            state.cumulativeTokens += record.input_tokens + record.output_tokens;

            if (constraints?.allowedModels !== undefined && !checkModelAllowed(record.model, constraints.allowedModels)) {
              const v: ConstraintViolation = {
                type: "model_violation",
                detail: `model_violation: ${record.model} not in [${constraints.allowedModels.join(", ")}]`,
                seq: record.seq,
                ts: new Date().toISOString(),
              };
              state.violations.push(v);
              console.log(`[proxy] Model violation: ${record.model}`);
            }

            if (constraints?.tokenBudget !== undefined && checkTokenBudget(state.cumulativeTokens, constraints.tokenBudget)) {
              console.log(`[proxy] Token budget will block next call: ${state.cumulativeTokens}/${constraints.tokenBudget}`);
            }
          });
        },
      );

      upstreamReq.on("error", (err) => {
        console.error(`[proxy] Upstream error: ${err.message}`);
        clientTls.end();
      });

      if (requestBody) {
        upstreamReq.write(requestBody);
      }
      upstreamReq.end();
    });

    clientTls.on("error", () => {});
  });

  tlsServer.listen(0, "127.0.0.1", () => {
    const addr = tlsServer.address() as net.AddressInfo;
    const localSocket = net.connect(addr.port, "127.0.0.1", () => {
      localSocket.pipe(clientSocket as unknown as net.Socket);
      (clientSocket as unknown as net.Socket).pipe(localSocket);
    });
    localSocket.on("error", () => tlsServer.close());
    clientSocket.on("error", () => tlsServer.close());
  });

  tlsServer.on("error", () => clientSocket.destroy());
}

function parseHeaders(rawHeaders: string): Record<string, string> {
  const lines = rawHeaders.split("\r\n").slice(1); // skip request line
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const idx = line.indexOf(": ");
    if (idx > 0) {
      const key = line.slice(0, idx).toLowerCase();
      const val = line.slice(idx + 2);
      // Skip hop-by-hop headers
      if (!["proxy-connection", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade"].includes(key)) {
        headers[key] = val;
      }
    }
  }
  return headers;
}

// ── HTTP Proxy Server ──────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // Health check endpoint — used by VerifiedRunner to confirm proxy is ready
  if (req.method === "GET" && (req.url === "/health" || req.url === "/health/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, calls: state.seq }));
    return;
  }

  // Plain HTTP request (rare for LLMs, but handle generically)
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname + url.search,
    method: req.method,
    headers: req.headers,
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on("error", (err) => {
    console.error(`[proxy] HTTP error: ${err.message}`);
    res.writeHead(502);
    res.end("Bad Gateway");
  });

  req.pipe(proxy);
});

server.on("connect", handleConnect);

// Load live pricing from Clawdiators API before starting (best-effort; falls back to hardcoded)
const CLAWDIATORS_API_URL = process.env.CLAWDIATORS_API_URL;
const startup = CLAWDIATORS_API_URL
  ? loadPricingFromAPI(CLAWDIATORS_API_URL)
  : Promise.resolve();

startup.finally(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[proxy] Listening on port ${PORT}`);
    console.log(`[proxy] Nonce: ${NONCE}`);
    console.log(`[proxy] Attestation dir: ${ATTESTATION_DIR}`);
  });
});

// ── Sentinel Watcher ───────────────────────────────────────────────────

const SENTINEL_PATH = path.join(ATTESTATION_DIR, "done");

const watchInterval = setInterval(() => {
  if (fs.existsSync(SENTINEL_PATH)) {
    clearInterval(watchInterval);
    console.log("[proxy] Sentinel detected. Finalizing attestation...");
    finalizeAttestation();
    server.close(() => {
      process.exit(0);
    });
  }
}, 500);

process.on("SIGTERM", () => {
  clearInterval(watchInterval);
  finalizeAttestation();
  server.close(() => process.exit(0));
});
