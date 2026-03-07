/**
 * PIPELINE BREACH — Live Pipeline API Service
 *
 * Seeded REST API simulating 8 microservice CI/CD pipelines under a supply
 * chain attack. The SEED env var drives deterministic scenario selection and
 * data generation so every match is reproducible.
 *
 * Endpoints:
 *   GET  /health                       — Container health check
 *   GET  /pipeline/status              — All pipeline statuses
 *   GET  /pipeline/service/:id         — Detailed service build info
 *   GET  /pipeline/topology            — Service dependency graph
 *   GET  /pipeline/builds?service=X    — Recent builds for a service
 *   GET  /pipeline/events?limit=N      — Recent security events
 *   POST /pipeline/remediate           — Execute remediation action
 *   GET  /metrics                      — Scoring metrics
 */

import express from "express";

const app = express();
app.use(express.json());

const SEED = parseInt(process.env.SEED || "42", 10);
const PORT = parseInt(process.env.PORT || "3000", 10);

// ── Seeded PRNG ────────────────────────────────────────────────────────
function rng(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(arr, r) { return arr[Math.floor(r() * arr.length)]; }
function randInt(min, max, r) { return min + Math.floor(r() * (max - min + 1)); }
function randHex(len, r) { let o = ""; for (let i = 0; i < len; i++) o += Math.floor(r() * 16).toString(16); return o; }

// ── Scenario data (mirrors data.ts logic) ─────────────────────────────
const MICROSERVICES = [
  { id: "api-gateway", name: "API Gateway", language: "typescript", dependencies: ["auth-service", "user-service"], team: "platform" },
  { id: "auth-service", name: "Authentication Service", language: "typescript", dependencies: [], team: "security" },
  { id: "user-service", name: "User Service", language: "python", dependencies: ["auth-service"], team: "identity" },
  { id: "payment-service", name: "Payment Service", language: "python", dependencies: ["auth-service", "user-service"], team: "payments" },
  { id: "notification-service", name: "Notification Service", language: "typescript", dependencies: ["user-service"], team: "comms" },
  { id: "analytics-service", name: "Analytics Service", language: "python", dependencies: ["api-gateway"], team: "data" },
  { id: "search-service", name: "Search Service", language: "java", dependencies: ["user-service", "api-gateway"], team: "search" },
  { id: "deploy-controller", name: "Deploy Controller", language: "go", dependencies: [], team: "platform" },
];

const SCENARIOS = [
  { id: "npm_typosquat", affected: ["api-gateway", "notification-service"], transitive: ["auth-service"], pkg: "lodash-utils", ver: "4.17.22", safe: "4.17.21" },
  { id: "pypi_backdoor", affected: ["user-service", "payment-service"], transitive: ["api-gateway"], pkg: "cryptography", ver: "41.0.8", safe: "41.0.7" },
  { id: "github_action_inject", affected: ["deploy-controller", "search-service"], transitive: ["api-gateway", "user-service"], pkg: "actions/checkout", ver: "v4.2.0-rc1", safe: "v4.1.7" },
  { id: "maven_repo_poison", affected: ["search-service"], transitive: ["api-gateway", "analytics-service"], pkg: "jackson-databind", ver: "2.16.1-patch1", safe: "2.16.0" },
];

const r = rng(SEED);
const scenarioIdx = Math.floor(r() * SCENARIOS.length);
const scenario = SCENARIOS[scenarioIdx];
const fullBlast = [...scenario.affected, ...scenario.transitive];

// ── State: track remediation actions ──────────────────────────────────
const remediationLog = [];
const remediatedServices = new Set();

// ── Routes ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/pipeline/status", (_req, res) => {
  const statuses = MICROSERVICES.map((svc) => {
    const isAffected = scenario.affected.includes(svc.id);
    const isTransitive = scenario.transitive.includes(svc.id);
    const isRemediated = remediatedServices.has(svc.id);
    return {
      service_id: svc.id,
      name: svc.name,
      language: svc.language,
      team: svc.team,
      pipeline_status: isRemediated ? "healthy" : isAffected ? "compromised" : isTransitive ? "at_risk" : "healthy",
      last_build_status: isAffected ? "warnings" : "success",
      security_findings: isAffected ? randInt(3, 8, rng(SEED + svc.id.length)) : isTransitive ? 1 : 0,
      dependencies_changed_recently: isAffected,
    };
  });
  res.json({ ok: true, data: statuses });
});

app.get("/pipeline/service/:id", (req, res) => {
  const svc = MICROSERVICES.find((s) => s.id === req.params.id);
  if (!svc) return res.status(404).json({ ok: false, error: "Unknown service" });

  const isAffected = scenario.affected.includes(svc.id);
  const isTransitive = scenario.transitive.includes(svc.id);
  const localRng = rng(SEED + svc.id.charCodeAt(0));

  res.json({
    ok: true,
    data: {
      ...svc,
      pipeline_status: remediatedServices.has(svc.id) ? "healthy" : isAffected ? "compromised" : isTransitive ? "at_risk" : "healthy",
      recent_builds: Array.from({ length: 3 }, (_, i) => ({
        build_id: `build-${svc.id}-${randHex(6, localRng)}`,
        status: i === 0 && isAffected ? "warnings" : "success",
        duration_secs: i === 0 && isAffected ? randInt(200, 500, localRng) : randInt(60, 150, localRng),
        security_scan: i === 0 && isAffected ? "critical" : "clean",
        started_at: new Date(Date.now() - (i + 1) * 3600 * 1000 * randInt(1, 24, localRng)).toISOString(),
      })),
      compromised_package: isAffected ? { name: scenario.pkg, version: scenario.ver, safe_version: scenario.safe } : null,
      secrets_status: isAffected || isTransitive ? "potentially_compromised" : "secure",
    },
  });
});

app.get("/pipeline/topology", (_req, res) => {
  const edges = [];
  for (const svc of MICROSERVICES) {
    for (const dep of svc.dependencies) {
      edges.push({ from: svc.id, to: dep, type: "depends_on" });
    }
  }
  res.json({
    ok: true,
    data: {
      services: MICROSERVICES.map((s) => ({ id: s.id, name: s.name, language: s.language, team: s.team })),
      edges,
    },
  });
});

app.get("/pipeline/builds", (req, res) => {
  const serviceId = req.query.service;
  const svc = MICROSERVICES.find((s) => s.id === serviceId);
  if (!svc) return res.status(400).json({ ok: false, error: "Provide ?service=<id>" });

  const localRng = rng(SEED + svc.id.charCodeAt(0) * 7);
  const isAffected = scenario.affected.includes(svc.id);
  const builds = Array.from({ length: 5 }, (_, i) => ({
    build_id: `build-${svc.id}-${randHex(6, localRng)}`,
    commit_sha: randHex(40, localRng),
    branch: "main",
    triggered_by: pick(["push", "schedule", "manual"], localRng),
    status: i === 0 && isAffected ? "warnings" : "success",
    duration_secs: i === 0 && isAffected ? randInt(200, 500, localRng) : randInt(60, 150, localRng),
    security_scan: i === 0 && isAffected ? "critical" : "clean",
    started_at: new Date(Date.now() - (i + 1) * 3600 * 1000 * randInt(1, 24, localRng)).toISOString(),
  }));
  res.json({ ok: true, data: builds });
});

app.get("/pipeline/events", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
  const localRng = rng(SEED + 999);
  const events = [];

  // Attack-related events
  for (const svc of scenario.affected) {
    events.push({
      ts: new Date(Date.now() - randInt(1, 72, localRng) * 3600 * 1000).toISOString(),
      severity: "CRITICAL",
      service: svc,
      type: "supply_chain_anomaly",
      message: `Anomalous dependency activity detected in ${svc} build pipeline`,
      details: { package: scenario.pkg, version: scenario.ver },
    });
  }

  // Normal events
  for (let i = 0; i < Math.min(limit - events.length, 15); i++) {
    events.push({
      ts: new Date(Date.now() - randInt(1, 96, localRng) * 3600 * 1000).toISOString(),
      severity: pick(["INFO", "WARN"], localRng),
      service: pick(MICROSERVICES, localRng).id,
      type: pick(["build_completed", "dependency_updated", "security_scan", "deploy_triggered"], localRng),
      message: `Routine pipeline event`,
    });
  }

  events.sort((a, b) => b.ts.localeCompare(a.ts));
  res.json({ ok: true, data: events.slice(0, limit) });
});

app.post("/pipeline/remediate", (req, res) => {
  const { service, action, params } = req.body || {};
  if (!service || !action) {
    return res.status(400).json({ ok: false, error: "Provide service and action" });
  }

  const svc = MICROSERVICES.find((s) => s.id === service);
  if (!svc) return res.status(404).json({ ok: false, error: "Unknown service" });

  const entry = {
    ts: new Date().toISOString(),
    service,
    action,
    params: params || {},
    result: "success",
    message: `Remediation action '${action}' executed on ${service}`,
  };

  remediationLog.push(entry);
  remediatedServices.add(service);

  res.json({ ok: true, data: entry });
});

app.get("/metrics", (_req, res) => {
  const expectedActions = scenario.affected.length * 2 + scenario.transitive.length + 1;
  const completionRate = Math.min(1, remediationLog.length / expectedActions);
  const blastResolved = fullBlast.every((s) => remediatedServices.has(s));

  res.json({
    ok: true,
    data: {
      remediation_completeness: completionRate,
      secrets_rotated: remediationLog.filter((a) => a.action.includes("rotate") || a.action.includes("revoke")).length,
      services_rebuilt: remediationLog.filter((a) => a.action.includes("rebuild")).length,
      out_of_order_penalty: 1.0,
      scoring_summary: {
        action_completion_rate: completionRate,
        blast_radius_resolved: blastResolved,
        fully_remediated: blastResolved && completionRate >= 0.8,
      },
    },
  });
});

// ── Documentation routes (served via docs proxy) ──────────────────────

const DOCS = {
  "/docs/runbooks/": `# Security Runbook Index

## Supply Chain Attack Response Runbooks

- [/docs/runbooks/dependency-confusion](/docs/runbooks/dependency-confusion) — Typosquat / dependency confusion attacks
- [/docs/runbooks/compromised-maintainer](/docs/runbooks/compromised-maintainer) — Compromised package maintainer account
- [/docs/runbooks/ci-workflow-injection](/docs/runbooks/ci-workflow-injection) — CI/CD workflow injection via actions
- [/docs/runbooks/cache-poisoning](/docs/runbooks/cache-poisoning) — Repository cache poisoning (Maven, npm, PyPI)
- [/docs/runbooks/secret-rotation](/docs/runbooks/secret-rotation) — Emergency secret rotation procedures

All runbooks follow: Detection → Containment → Eradication → Recovery → Lessons Learned.
`,

  "/docs/runbooks/dependency-confusion": `# Runbook: Dependency Confusion / Typosquat Attack

**Attack pattern:** Attacker publishes a package with a name similar to a legitimate internal or popular package. The build system resolves the malicious package instead.

## Detection Signals
- New package appears in lockfile with no corresponding PR or dependency review
- Package name is a near-match for a known package (e.g., \`lodash-utils\` vs \`lodash\`)
- postinstall script makes outbound network calls
- Build time anomaly during dependency installation phase
- Registry checksum drift between builds

## Containment
1. **Immediately** pin the legitimate package version in all affected lockfiles
2. Revoke all CI environment variables that may have been exfiltrated
3. Block the malicious package domain at the network level

## Eradication
1. Remove the typosquat package from all dependency manifests
2. Replace with the legitimate package at a pinned, audited version
3. Rebuild all affected services from the last known-good commit
4. Rotate all secrets that were present in CI environment during compromise window

## Recovery
1. Verify clean builds produce identical artifacts to pre-compromise baselines
2. Re-enable CI pipelines with enhanced dependency review policies
3. Add the typosquat package name to a permanent block list

## Prevention
- Enforce dependency review on all PRs that modify lockfiles
- Use scoped packages or private registries for internal dependencies
- Enable checksum verification in package managers
- Monitor for new packages with names similar to your dependencies
`,

  "/docs/runbooks/compromised-maintainer": `# Runbook: Compromised Package Maintainer

**Attack pattern:** Attacker gains access to a legitimate maintainer's account (credential theft, social engineering, or key compromise). Publishes a backdoored version of a trusted package.

## Detection Signals
- Maintainer signing key rotated unexpectedly
- Package compiled from source when wheels/binaries were previously available
- Wheel/JAR hash mismatch against official registry index
- Unknown CA certificates appearing in TLS chain during tests
- Build time spike during dependency installation (compilation vs download)

## Containment
1. Pin the last known-good version across all affected services
2. Revoke any certificates issued during the compromise window
3. Rotate PCI/encryption keys on services handling sensitive data

## Eradication
1. Downgrade the compromised dependency to the last audited version
2. Verify the downgraded version hash matches the official registry
3. Audit all transitive consumers of the compromised package
4. Rebuild affected services from clean state

## Recovery
1. Verify SSL/TLS certificate chains are clean post-rebuild
2. Run integration tests with strict certificate validation
3. Confirm no residual monkeypatching or CA injection

## Prevention
- Monitor maintainer key rotation events on critical dependencies
- Require wheel/binary verification (never compile from source in CI)
- Pin dependency hashes in lockfiles
`,

  "/docs/runbooks/ci-workflow-injection": `# Runbook: CI/CD Workflow Injection

**Attack pattern:** Attacker modifies a GitHub Action (or similar CI component) to exfiltrate secrets during the checkout/build phase. Often targets actions pinned to mutable tags instead of immutable SHAs.

## Detection Signals
- Checkout step duration anomaly (10x+ normal)
- Action hash mismatch between marketplace and actual execution
- Secrets visible in step output logs
- Unauthorized outbound HTTPS POST during checkout phase
- Actions pinned to mutable tags (e.g., \`v4.2.0-rc1\`) instead of SHA

## Containment
1. Pin all GitHub Actions to immutable commit SHAs immediately
2. Rotate all deployment keys and CI secrets
3. Audit step outputs for any exposed credentials

## Eradication
1. Replace mutable tag references with verified SHA pins in all workflow files
2. Rotate GITHUB_TOKEN, DEPLOY_KEY, and any service-specific secrets
3. Rebuild from the last known-good commit

## Recovery
1. Verify all workflow files use SHA-pinned actions
2. Enable GitHub's required workflows and branch protection
3. Confirm no unauthorized deployments occurred during compromise window

## Prevention
- Enforce SHA-pinned actions via policy (no mutable tags)
- Enable GitHub's Dependabot for action version updates
- Use OIDC tokens instead of long-lived secrets where possible
- Audit workflow permissions (least privilege)
`,

  "/docs/runbooks/cache-poisoning": `# Runbook: Repository Cache Poisoning

**Attack pattern:** Attacker injects a malicious artifact into a package manager's local or proxy cache. The build system resolves the poisoned artifact instead of the legitimate one from the official registry.

## Detection Signals
- Artifact checksum not found in official registry index
- Dependency resolution redirected to unofficial mirror
- JNDI lookup or deserialization gadget chain detected during tests
- Version string contains non-standard suffix (e.g., \`2.16.1-patch1\`)
- Build time anomaly during dependency resolution

## Containment
1. Pin to the official release version from the canonical registry
2. Purge local and proxy Maven/npm/PyPI caches
3. Enforce GPG signature or checksum verification

## Eradication
1. Remove the poisoned artifact from all local caches
2. Configure package managers to reject unsigned or unverified artifacts
3. Rebuild from clean state with verified dependencies

## Recovery
1. Verify all dependency checksums match official registry
2. Run security scans on rebuilt artifacts
3. Confirm no JNDI/deserialization payloads in classpath

## Prevention
- Enforce artifact signature verification (Maven GPG, npm provenance)
- Use a vetted proxy registry (Artifactory, Nexus) with signature policies
- Never resolve dependencies from unofficial mirrors
- Pin all dependency versions with checksums in lockfiles
`,

  "/docs/runbooks/secret-rotation": `# Runbook: Emergency Secret Rotation

**Applies to:** Any supply chain compromise where CI secrets may have been exfiltrated.

## Rotation Priority Order
1. **Deployment keys** (can deploy code to production)
2. **API keys with write access** (can modify data/config)
3. **Package registry tokens** (can publish malicious packages)
4. **Database credentials** (can access/modify data)
5. **Service-to-service credentials** (lateral movement risk)
6. **Read-only tokens** (information disclosure risk)

## Per-Service Rotation
For each affected service:
1. Generate new credentials
2. Update secret store (Vault, AWS Secrets Manager, GitHub Secrets)
3. Restart service to pick up new credentials
4. Verify service health with new credentials
5. Revoke old credentials (do NOT skip this step)

## Verification
- All services pass health checks with new credentials
- Old credentials return 401/403 on all endpoints
- No residual references to old credentials in CI logs or artifacts
`,

  "/docs/architecture/services": `# Platform Architecture: Services

## Service Inventory

| Service | Language | Port | Team | Description |
|---------|----------|------|------|-------------|
| api-gateway | TypeScript | 3000 | platform | Public REST API, routes to backends |
| auth-service | TypeScript | 3001 | security | JWT auth, RBAC, session management |
| user-service | Python | 3002 | identity | User profiles, PII handling |
| payment-service | Python | 3003 | payments | PCI-DSS compliant payment processing |
| notification-service | TypeScript | 3004 | comms | Email, SMS, push dispatch |
| analytics-service | Python | 3005 | data | Event tracking, metrics aggregation |
| search-service | Java | 3006 | search | Full-text search via Elasticsearch |
| deploy-controller | Go | 3007 | platform | K8s deployment orchestration |

## Build Infrastructure
- CI/CD: GitHub Actions (per-service workflows)
- Artifact Registry: GitHub Container Registry (ghcr.io)
- Package Managers: npm, pip, Maven, go-mod
- Security Scanning: automated on every build
`,

  "/docs/architecture/dependencies": `# Platform Architecture: Service Dependencies

## Dependency Graph

\`\`\`
api-gateway → auth-service, user-service
user-service → auth-service
payment-service → auth-service, user-service
notification-service → user-service
analytics-service → api-gateway
search-service → user-service, api-gateway
deploy-controller → (standalone)
\`\`\`

## Transitive Exposure
When a dependency is compromised, all downstream consumers are potentially affected:
- If auth-service is compromised → api-gateway, user-service, payment-service affected
- If user-service is compromised → payment-service, notification-service, search-service affected
- If api-gateway is compromised → analytics-service, search-service affected

## Dependency Management Policies
- All direct dependencies must be in the approved-packages list
- Lockfiles must be committed and reviewed on every change
- Transitive dependency updates trigger automated security scans
`,

  "/docs/security/supply-chain-policy": `# Security Policy: Supply Chain

## Dependency Governance
1. All new dependencies require security team approval
2. Dependencies must be from approved registries only
3. Version pinning with checksum verification is mandatory
4. No pre-release or release candidate versions in production

## CI/CD Security
1. GitHub Actions must be pinned to immutable commit SHAs
2. CI secrets scoped to minimum required permissions
3. Network policy: builds should only access approved registries
4. Build artifacts must pass security scan before deployment

## Incident Response
1. P0 supply chain incidents escalate to security team immediately
2. Affected services must be contained within 1 hour
3. Secret rotation begins within 2 hours of confirmed compromise
4. Post-incident review within 48 hours
`,

  "/docs/security/incident-response": `# Security: Incident Response Procedure

## Supply Chain Attack Response Flow

### Phase 1: Detection & Triage (0-30 min)
1. Confirm the alert is not a false positive
2. Identify the attack vector (typosquat, compromised maintainer, CI injection, cache poisoning)
3. Determine initially affected services

### Phase 2: Containment (30-60 min)
1. Pin affected dependencies to last known-good versions
2. Disable affected CI pipelines if active
3. Block attacker infrastructure at network level

### Phase 3: Blast Radius Analysis (60-120 min)
1. Trace all direct consumers of the compromised package
2. Trace transitive consumers through the dependency graph
3. Check CI secret inventory for each affected service
4. Determine which secrets may have been exfiltrated

### Phase 4: Eradication & Recovery (120-240 min)
1. Rotate all potentially compromised secrets (priority order)
2. Rebuild affected services from clean commits
3. Verify rebuilt artifacts match expected checksums
4. Re-enable CI pipelines with enhanced security controls

### Phase 5: Post-Incident (24-48 hours)
1. Write security advisory for affected stakeholders
2. Update supply chain security policies
3. Implement prevention measures identified during investigation
`,
};

app.get("/docs/*", (req, res) => {
  let path = req.path;
  if (path !== "/" && !path.endsWith("/") && !DOCS[path]) {
    path = path + "/";
  }
  const content = DOCS[path] ?? DOCS[req.path];
  if (!content) {
    return res.status(404).json({
      error: `Documentation not found: ${req.path}`,
      available: Object.keys(DOCS),
    });
  }
  res.set("content-type", "text/markdown; charset=utf-8");
  res.send(content);
});

app.listen(PORT, () => {
  console.log(`Pipeline API running on port ${PORT} with SEED=${SEED}`);
});
