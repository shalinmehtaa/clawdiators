/**
 * PIPELINE BREACH — Supply Chain Attack Forensics — Data Generator
 *
 * Generates a fully seeded CI/CD supply chain compromise scenario.
 * Each seed produces a unique but deterministic incident with a specific
 * attack vector, blast radius, and evidence trail.
 *
 * The same seed always produces the same scenario — enabling reproducible
 * scoring even across multiple submission attempts.
 *
 * Architecture modeled:
 *   8 microservices, each with its own build pipeline, dependency manifest,
 *   and artifact lineage. One dependency has been compromised at a specific
 *   version, injecting a backdoor. The compromise spreads through
 *   dependency resolution into downstream builds.
 */

// ── Seeded PRNG (mulberry32, matches arena standard) ──────────────────

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)];
}

function pickN<T>(arr: readonly T[], n: number, r: () => number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const idx = Math.floor(r() * (pool.length - i));
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

function randInt(min: number, max: number, r: () => number): number {
  return min + Math.floor(r() * (max - min + 1));
}

function randHex(length: number, r: () => number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += Math.floor(r() * 16).toString(16);
  }
  return out;
}

// ── Microservice Definitions ─────────────────────────────────────────

export const MICROSERVICES = [
  {
    id: "api-gateway",
    name: "API Gateway",
    language: "typescript",
    buildTool: "npm",
    description: "Public-facing REST API that routes requests to backend services",
    dependencies: ["auth-service", "user-service"],
    directDeps: ["express@4.18.2", "helmet@7.1.0", "cors@2.8.5", "jsonwebtoken@9.0.2", "winston@3.11.0"],
    port: 3000,
    team: "platform",
  },
  {
    id: "auth-service",
    name: "Authentication Service",
    language: "typescript",
    buildTool: "npm",
    description: "JWT-based auth with RBAC and session management",
    dependencies: [],
    directDeps: ["bcryptjs@2.4.3", "jsonwebtoken@9.0.2", "redis@4.6.10", "zod@3.22.4"],
    port: 3001,
    team: "security",
  },
  {
    id: "user-service",
    name: "User Service",
    language: "python",
    buildTool: "pip",
    description: "User profile management with PII handling",
    dependencies: ["auth-service"],
    directDeps: ["fastapi==0.104.1", "sqlalchemy==2.0.23", "pydantic==2.5.2", "cryptography==41.0.7"],
    port: 3002,
    team: "identity",
  },
  {
    id: "payment-service",
    name: "Payment Service",
    language: "python",
    buildTool: "pip",
    description: "Payment processing with PCI-DSS compliance",
    dependencies: ["auth-service", "user-service"],
    directDeps: ["stripe==7.8.0", "fastapi==0.104.1", "cryptography==41.0.7", "celery==5.3.6"],
    port: 3003,
    team: "payments",
  },
  {
    id: "notification-service",
    name: "Notification Service",
    language: "typescript",
    buildTool: "npm",
    description: "Email, SMS, and push notification dispatch",
    dependencies: ["user-service"],
    directDeps: ["nodemailer@6.9.7", "twilio@4.19.0", "firebase-admin@11.11.1", "bull@4.12.0"],
    port: 3004,
    team: "comms",
  },
  {
    id: "analytics-service",
    name: "Analytics Service",
    language: "python",
    buildTool: "pip",
    description: "Event tracking and metrics aggregation pipeline",
    dependencies: ["api-gateway"],
    directDeps: ["fastapi==0.104.1", "clickhouse-connect==0.6.23", "pandas==2.1.4", "pydantic==2.5.2"],
    port: 3005,
    team: "data",
  },
  {
    id: "search-service",
    name: "Search Service",
    language: "java",
    buildTool: "maven",
    description: "Full-text search indexer backed by Elasticsearch",
    dependencies: ["user-service", "api-gateway"],
    directDeps: ["spring-boot:3.2.0", "elasticsearch-rest-high-level-client:7.17.15", "jackson-databind:2.16.0", "slf4j-api:2.0.9"],
    port: 3006,
    team: "search",
  },
  {
    id: "deploy-controller",
    name: "Deploy Controller",
    language: "go",
    buildTool: "go-mod",
    description: "Kubernetes deployment orchestrator with canary rollout support",
    dependencies: [],
    directDeps: ["k8s.io/client-go@v0.28.4", "github.com/spf13/cobra@v1.8.0", "go.uber.org/zap@v1.26.0"],
    port: 3007,
    team: "platform",
  },
] as const;

export type MicroserviceId =
  | "api-gateway"
  | "auth-service"
  | "user-service"
  | "payment-service"
  | "notification-service"
  | "analytics-service"
  | "search-service"
  | "deploy-controller";

// ── Attack Scenarios ─────────────────────────────────────────────────

export const ATTACK_SCENARIOS = [
  {
    id: "npm_typosquat",
    name: "NPM Typosquat: lodash-utils",
    attackVector: "dependency_confusion" as const,
    compromisedPackage: "lodash-utils",
    legitimatePackage: "lodash",
    compromisedVersion: "4.17.22",
    safeVersion: "4.17.21",
    injectedPayload: "postinstall script exfiltrating env vars to attacker C2",
    affectedLanguage: "typescript",
    affectedServices: ["api-gateway", "notification-service"] as MicroserviceId[],
    transitiveVictims: ["auth-service"] as MicroserviceId[],
    unaffectedServices: ["user-service", "payment-service", "analytics-service", "search-service", "deploy-controller"] as MicroserviceId[],
    indicators: {
      networkAnomaly: "outbound DNS queries to c2.lodash-utils.io during build",
      buildTimeSpike: "postinstall hook added 14s to build time",
      checksumMismatch: "SHA-512 of lodash-utils@4.17.22 changed between registry snapshots",
      envLeakage: "CI environment variables appeared in build output artifact metadata",
    },
    logSignals: ["POSTINSTALL_NETWORK_CALL", "ENV_EXFILTRATION_DETECTED", "REGISTRY_CHECKSUM_DRIFT", "BUILD_TIME_ANOMALY", "DNS_QUERY_SUSPICIOUS"],
    dbSignals: {
      build_artifacts: "lodash-utils@4.17.22 first appeared 72h ago; no prior versions in registry",
      dependency_audit: "lodash-utils not in approved-packages list",
      network_log: "outbound to c2.lodash-utils.io:443 during build phase only",
    },
    remediation: [
      { service: "api-gateway" as MicroserviceId, action: "pin_dependency", params: { package: "lodash", version: "4.17.21" }, description: "Replace typosquat with legitimate package" },
      { service: "api-gateway" as MicroserviceId, action: "rotate_secrets", params: { scope: "ci_env" }, description: "Rotate all CI environment variables that were exposed" },
      { service: "notification-service" as MicroserviceId, action: "pin_dependency", params: { package: "lodash", version: "4.17.21" }, description: "Replace typosquat in notification service" },
      { service: "notification-service" as MicroserviceId, action: "rotate_secrets", params: { scope: "ci_env" }, description: "Rotate notification service CI secrets" },
      { service: "auth-service" as MicroserviceId, action: "rotate_secrets", params: { scope: "all" }, description: "Rotate auth service credentials (transitive exposure)" },
      { service: "api-gateway" as MicroserviceId, action: "rebuild_clean", params: { from_commit: "last_known_good" }, description: "Rebuild from clean state" },
    ],
    timelineHoursAgo: 72,
    redHerring: {
      service: "search-service" as MicroserviceId,
      symptom: "Elasticsearch build warnings about deprecated API",
      actualCause: "Planned migration to OpenSearch client — unrelated to incident",
    },
  },
  {
    id: "pypi_backdoor",
    name: "PyPI Dependency Backdoor: cryptography fork",
    attackVector: "compromised_maintainer" as const,
    compromisedPackage: "cryptography",
    legitimatePackage: "cryptography",
    compromisedVersion: "41.0.8",
    safeVersion: "41.0.7",
    injectedPayload: "monkeypatched SSL verification to accept attacker's CA certificate",
    affectedLanguage: "python",
    affectedServices: ["user-service", "payment-service"] as MicroserviceId[],
    transitiveVictims: ["api-gateway"] as MicroserviceId[],
    unaffectedServices: ["auth-service", "notification-service", "analytics-service", "search-service", "deploy-controller"] as MicroserviceId[],
    indicators: {
      networkAnomaly: "TLS certificate chain includes unknown intermediate CA during integration tests",
      buildTimeSpike: "pip install cryptography took 340s (normally 45s) — compiled from malicious source",
      checksumMismatch: "wheel hash differs from PyPI's published hash for cryptography-41.0.8",
      envLeakage: "SSL_CERT_FILE env var overwritten in process during test execution",
    },
    logSignals: ["WHEEL_HASH_MISMATCH", "SSL_CA_INJECTION", "COMPILE_FROM_SOURCE_UNEXPECTED", "BUILD_TIME_ANOMALY", "CERT_CHAIN_UNKNOWN_CA"],
    dbSignals: {
      build_artifacts: "cryptography-41.0.8 compiled from source instead of wheel on 2 services",
      dependency_audit: "cryptography maintainer key rotated 48h ago — unusual",
      network_log: "unknown-ca.attacker.io resolved during integration test phase",
    },
    remediation: [
      { service: "user-service" as MicroserviceId, action: "pin_dependency", params: { package: "cryptography", version: "41.0.7" }, description: "Downgrade to last known-good version" },
      { service: "payment-service" as MicroserviceId, action: "pin_dependency", params: { package: "cryptography", version: "41.0.7" }, description: "Downgrade payment service cryptography" },
      { service: "user-service" as MicroserviceId, action: "revoke_certificates", params: { scope: "all_issued_since_compromise" }, description: "Revoke any certificates issued during compromise window" },
      { service: "payment-service" as MicroserviceId, action: "rotate_secrets", params: { scope: "pci_keys" }, description: "Rotate PCI-DSS encryption keys" },
      { service: "api-gateway" as MicroserviceId, action: "rotate_secrets", params: { scope: "tls_certs" }, description: "Rotate TLS certificates (transitive exposure via auth)" },
      { service: "payment-service" as MicroserviceId, action: "rebuild_clean", params: { from_commit: "last_known_good" }, description: "Rebuild payment service from clean state" },
    ],
    timelineHoursAgo: 48,
    redHerring: {
      service: "analytics-service" as MicroserviceId,
      symptom: "ClickHouse query timeouts in analytics build tests",
      actualCause: "Test database migration running in parallel — scheduled maintenance",
    },
  },
  {
    id: "github_action_inject",
    name: "GitHub Actions Workflow Injection",
    attackVector: "ci_workflow_injection" as const,
    compromisedPackage: "actions/checkout",
    legitimatePackage: "actions/checkout",
    compromisedVersion: "v4.2.0-rc1",
    safeVersion: "v4.1.7",
    injectedPayload: "modified checkout action exfiltrates repo secrets to attacker-controlled endpoint",
    affectedLanguage: "yaml",
    affectedServices: ["deploy-controller", "search-service"] as MicroserviceId[],
    transitiveVictims: ["api-gateway", "user-service"] as MicroserviceId[],
    unaffectedServices: ["auth-service", "payment-service", "notification-service", "analytics-service"] as MicroserviceId[],
    indicators: {
      networkAnomaly: "HTTPS POST to exfil.actions-cache.dev during checkout step",
      buildTimeSpike: "checkout step taking 28s instead of typical 3s",
      checksumMismatch: "action.yml hash for actions/checkout@v4.2.0-rc1 does not match GitHub marketplace",
      envLeakage: "GITHUB_TOKEN and DEPLOY_KEY visible in step output logs",
    },
    logSignals: ["ACTION_HASH_MISMATCH", "SECRET_IN_STEP_OUTPUT", "CHECKOUT_DURATION_ANOMALY", "OUTBOUND_POST_UNAUTHORIZED", "WORKFLOW_PIN_MISSING"],
    dbSignals: {
      build_artifacts: "deploy-controller and search-service both reference actions/checkout@v4.2.0-rc1 (pre-release tag)",
      dependency_audit: "actions/checkout pinned to mutable tag, not SHA — violates security policy",
      network_log: "exfil.actions-cache.dev:443 POST requests during CI only",
    },
    remediation: [
      { service: "deploy-controller" as MicroserviceId, action: "pin_action_sha", params: { action: "actions/checkout", sha: "b4ffde65f46336ab88eb53be808477a3936bae11" }, description: "Pin checkout to immutable SHA" },
      { service: "search-service" as MicroserviceId, action: "pin_action_sha", params: { action: "actions/checkout", sha: "b4ffde65f46336ab88eb53be808477a3936bae11" }, description: "Pin search service checkout SHA" },
      { service: "deploy-controller" as MicroserviceId, action: "rotate_secrets", params: { scope: "deploy_keys" }, description: "Rotate all deployment keys" },
      { service: "search-service" as MicroserviceId, action: "rotate_secrets", params: { scope: "ci_env" }, description: "Rotate search service CI secrets" },
      { service: "api-gateway" as MicroserviceId, action: "rotate_secrets", params: { scope: "api_keys" }, description: "Rotate API gateway keys (transitive exposure)" },
      { service: "deploy-controller" as MicroserviceId, action: "rebuild_clean", params: { from_commit: "last_known_good" }, description: "Rebuild deploy controller from clean commit" },
    ],
    timelineHoursAgo: 24,
    redHerring: {
      service: "notification-service" as MicroserviceId,
      symptom: "Firebase Admin SDK deprecation warnings flooding build logs",
      actualCause: "SDK upgrade in progress — PR #247 open, not merged yet",
    },
  },
  {
    id: "maven_repo_poison",
    name: "Maven Repository Cache Poisoning",
    attackVector: "cache_poisoning" as const,
    compromisedPackage: "jackson-databind",
    legitimatePackage: "jackson-databind",
    compromisedVersion: "2.16.1-patch1",
    safeVersion: "2.16.0",
    injectedPayload: "JNDI lookup gadget chain reintroduced via patched deserialization path",
    affectedLanguage: "java",
    affectedServices: ["search-service"] as MicroserviceId[],
    transitiveVictims: ["api-gateway", "analytics-service"] as MicroserviceId[],
    unaffectedServices: ["auth-service", "user-service", "payment-service", "notification-service", "deploy-controller"] as MicroserviceId[],
    indicators: {
      networkAnomaly: "JNDI lookups to ldap://exploit.jackson-mirror.net during integration tests",
      buildTimeSpike: "maven dependency resolution redirected to unofficial mirror",
      checksumMismatch: "jackson-databind-2.16.1-patch1.jar SHA-256 not in Maven Central index",
      envLeakage: "JNDI context initialized with attacker-controlled naming factory",
    },
    logSignals: ["JNDI_LOOKUP_DETECTED", "MAVEN_MIRROR_REDIRECT", "JAR_CHECKSUM_UNKNOWN", "BUILD_TIME_ANOMALY", "DESERIALIZATION_GADGET_CHAIN"],
    dbSignals: {
      build_artifacts: "jackson-databind-2.16.1-patch1 not present in Maven Central — served from poisoned cache",
      dependency_audit: "jackson-databind version 2.16.1-patch1 does not exist in official releases",
      network_log: "ldap://exploit.jackson-mirror.net:1389 connection attempts from search-service test runner",
    },
    remediation: [
      { service: "search-service" as MicroserviceId, action: "pin_dependency", params: { package: "jackson-databind", version: "2.16.0" }, description: "Revert to official Maven Central version" },
      { service: "search-service" as MicroserviceId, action: "purge_local_cache", params: { scope: "maven_cache" }, description: "Delete poisoned local Maven cache" },
      { service: "search-service" as MicroserviceId, action: "enforce_checksum_verification", params: { policy: "require_central_signature" }, description: "Enforce GPG signature verification on all Maven artifacts" },
      { service: "api-gateway" as MicroserviceId, action: "rotate_secrets", params: { scope: "api_keys" }, description: "Rotate gateway keys (transitive via search)" },
      { service: "analytics-service" as MicroserviceId, action: "rotate_secrets", params: { scope: "data_keys" }, description: "Rotate analytics data encryption keys (transitive)" },
      { service: "search-service" as MicroserviceId, action: "rebuild_clean", params: { from_commit: "last_known_good" }, description: "Full rebuild from clean state" },
    ],
    timelineHoursAgo: 36,
    redHerring: {
      service: "deploy-controller" as MicroserviceId,
      symptom: "Go module proxy returning 429 rate-limit errors intermittently",
      actualCause: "Go proxy.golang.org rate limiting due to heavy CI activity — normal during release week",
    },
  },
] as const;

export type AttackVectorId = "npm_typosquat" | "pypi_backdoor" | "github_action_inject" | "maven_repo_poison";
export type AttackVectorType = "dependency_confusion" | "compromised_maintainer" | "ci_workflow_injection" | "cache_poisoning";

// ── Build Log Generator ──────────────────────────────────────────────

interface BuildLogEntry {
  ts: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";
  service: MicroserviceId;
  pipeline: string;
  step: string;
  code: string;
  message: string;
  metadata: Record<string, unknown>;
}

const BASE_TIME = new Date("2026-03-04T00:00:00Z").getTime();

function generateBuildLogs(scenario: typeof ATTACK_SCENARIOS[number], r: () => number): BuildLogEntry[] {
  const logs: BuildLogEntry[] = [];

  function addLog(
    offsetMin: number,
    level: BuildLogEntry["level"],
    service: MicroserviceId,
    pipeline: string,
    step: string,
    code: string,
    message: string,
    metadata: Record<string, unknown> = {},
  ) {
    const jitter = Math.floor(r() * 60) - 30;
    const ts = new Date(BASE_TIME + (offsetMin * 60 + jitter) * 1000).toISOString();
    logs.push({ ts, level, service, pipeline, step, code, message, metadata });
  }

  const onsetMin = -(scenario.timelineHoursAgo * 60);

  // ── Normal build activity (background noise) ───────────────────────
  for (const svc of MICROSERVICES) {
    for (let buildIdx = 0; buildIdx < 4; buildIdx++) {
      const offsetBase = onsetMin - randInt(100, 400, r);
      const buildId = `build-${svc.id}-${randHex(6, r)}`;
      addLog(offsetBase, "INFO", svc.id, buildId, "checkout", "CHECKOUT_OK", `Checked out ${svc.id}@main`, { commit: randHex(8, r), branch: "main" });
      addLog(offsetBase + 1, "INFO", svc.id, buildId, "deps", "DEPS_RESOLVED", `Dependencies resolved (${svc.directDeps.length} direct, ${randInt(30, 120, r)} transitive)`, { lockfile_hash: randHex(12, r) });
      addLog(offsetBase + 3, "INFO", svc.id, buildId, "build", "BUILD_SUCCESS", `Build succeeded in ${randInt(30, 120, r)}s`, { artifact_size_mb: randInt(5, 50, r) });
      addLog(offsetBase + 4, "INFO", svc.id, buildId, "test", "TESTS_PASSED", `${randInt(80, 300, r)} tests passed`, { coverage_pct: 70 + r() * 25 });
      addLog(offsetBase + 5, "INFO", svc.id, buildId, "publish", "ARTIFACT_PUBLISHED", `Published ${svc.id}:${randHex(8, r)}`, { registry: "ghcr.io" });
    }
  }

  // ── Attack onset ───────────────────────────────────────────────────
  for (const svc of scenario.affectedServices) {
    const buildId = `build-${svc}-${randHex(6, r)}`;

    if (scenario.id === "npm_typosquat") {
      addLog(onsetMin, "INFO", svc, buildId, "checkout", "CHECKOUT_OK", `Checked out ${svc}@main`, { commit: randHex(8, r) });
      addLog(onsetMin + 1, "WARN", svc, buildId, "deps", "NEW_DEPENDENCY_DETECTED", `New package in lockfile: lodash-utils@4.17.22`, { source: "npm", first_seen: true });
      addLog(onsetMin + 2, "INFO", svc, buildId, "deps", "DEPS_RESOLVED", `Dependencies resolved`, { lockfile_hash: randHex(12, r) });
      addLog(onsetMin + 3, "WARN", svc, buildId, "deps", "POSTINSTALL_NETWORK_CALL", `postinstall script made outbound network call`, { package: "lodash-utils", host: "c2.lodash-utils.io", port: 443 });
      addLog(onsetMin + 4, "ERROR", svc, buildId, "security", "ENV_EXFILTRATION_DETECTED", `CI environment variables sent to external host`, { host: "c2.lodash-utils.io", vars_leaked: ["NPM_TOKEN", "GITHUB_TOKEN", "AWS_ACCESS_KEY_ID"] });
      addLog(onsetMin + 5, "WARN", svc, buildId, "deps", "REGISTRY_CHECKSUM_DRIFT", `Package checksum changed since last build`, { package: "lodash-utils@4.17.22", previous_sha512: randHex(32, r), current_sha512: randHex(32, r) });
      addLog(onsetMin + 8, "WARN", svc, buildId, "security", "DNS_QUERY_SUSPICIOUS", `DNS query to c2.lodash-utils.io during build`, { resolver: "8.8.8.8", query_type: "A" });
      addLog(onsetMin + 10, "WARN", svc, buildId, "deps", "BUILD_TIME_ANOMALY", `Build step took 14s longer than baseline`, { step: "postinstall", expected_ms: 2000, actual_ms: 16200 });
      addLog(onsetMin + 12, "INFO", svc, buildId, "build", "BUILD_SUCCESS", `Build succeeded`, { artifact_size_mb: randInt(5, 50, r) });

    } else if (scenario.id === "pypi_backdoor") {
      addLog(onsetMin, "INFO", svc, buildId, "checkout", "CHECKOUT_OK", `Checked out ${svc}@main`, { commit: randHex(8, r) });
      addLog(onsetMin + 1, "WARN", svc, buildId, "deps", "COMPILE_FROM_SOURCE_UNEXPECTED", `cryptography 41.0.8 compiled from source (no wheel available)`, { package: "cryptography", expected: "wheel", actual: "sdist", compile_time_secs: 340 });
      addLog(onsetMin + 2, "ERROR", svc, buildId, "deps", "WHEEL_HASH_MISMATCH", `Published wheel hash does not match downloaded artifact`, { package: "cryptography@41.0.8", expected_sha256: randHex(32, r), actual_sha256: randHex(32, r) });
      addLog(onsetMin + 5, "WARN", svc, buildId, "deps", "BUILD_TIME_ANOMALY", `pip install took 340s (baseline 45s)`, { step: "install", expected_secs: 45, actual_secs: 340 });
      addLog(onsetMin + 8, "ERROR", svc, buildId, "test", "SSL_CA_INJECTION", `Unknown intermediate CA in TLS certificate chain during test`, { issuer: "unknown-ca.attacker.io", subject: "*.internal.test" });
      addLog(onsetMin + 10, "ERROR", svc, buildId, "test", "CERT_CHAIN_UNKNOWN_CA", `Certificate chain validation includes untrusted CA`, { ca_fingerprint: randHex(20, r) });
      addLog(onsetMin + 12, "INFO", svc, buildId, "build", "BUILD_SUCCESS", `Build succeeded with warnings`, { warnings: 3 });

    } else if (scenario.id === "github_action_inject") {
      addLog(onsetMin, "WARN", svc, buildId, "checkout", "CHECKOUT_DURATION_ANOMALY", `Checkout step took 28s (baseline 3s)`, { action: "actions/checkout@v4.2.0-rc1", expected_secs: 3, actual_secs: 28 });
      addLog(onsetMin + 1, "ERROR", svc, buildId, "checkout", "ACTION_HASH_MISMATCH", `Action action.yml hash does not match marketplace`, { action: "actions/checkout@v4.2.0-rc1", marketplace_hash: randHex(16, r), actual_hash: randHex(16, r) });
      addLog(onsetMin + 2, "CRITICAL", svc, buildId, "checkout", "SECRET_IN_STEP_OUTPUT", `Secrets detected in step output logs`, { secrets_exposed: ["GITHUB_TOKEN", "DEPLOY_KEY"], step: "checkout" });
      addLog(onsetMin + 3, "ERROR", svc, buildId, "checkout", "OUTBOUND_POST_UNAUTHORIZED", `Unauthorized HTTPS POST during checkout`, { destination: "exfil.actions-cache.dev", payload_size_bytes: 4096 });
      addLog(onsetMin + 4, "WARN", svc, buildId, "security", "WORKFLOW_PIN_MISSING", `Action pinned to mutable tag, not SHA`, { action: "actions/checkout", tag: "v4.2.0-rc1", policy_violation: true });
      addLog(onsetMin + 8, "INFO", svc, buildId, "build", "BUILD_SUCCESS", `Build succeeded`, { artifact_size_mb: randInt(5, 50, r) });

    } else if (scenario.id === "maven_repo_poison") {
      addLog(onsetMin, "INFO", svc, buildId, "checkout", "CHECKOUT_OK", `Checked out ${svc}@main`, { commit: randHex(8, r) });
      addLog(onsetMin + 1, "WARN", svc, buildId, "deps", "MAVEN_MIRROR_REDIRECT", `Maven dependency resolution redirected to unofficial mirror`, { package: "jackson-databind", mirror: "jackson-mirror.net", expected_source: "repo1.maven.org" });
      addLog(onsetMin + 2, "ERROR", svc, buildId, "deps", "JAR_CHECKSUM_UNKNOWN", `JAR checksum not found in Maven Central index`, { package: "jackson-databind-2.16.1-patch1", sha256: randHex(32, r) });
      addLog(onsetMin + 4, "WARN", svc, buildId, "deps", "BUILD_TIME_ANOMALY", `Maven resolve took 120s longer than baseline`, { step: "dependency-resolve", expected_secs: 15, actual_secs: 135 });
      addLog(onsetMin + 8, "CRITICAL", svc, buildId, "test", "JNDI_LOOKUP_DETECTED", `JNDI lookup attempted during integration test`, { target: "ldap://exploit.jackson-mirror.net:1389", class: "javax.naming.InitialContext" });
      addLog(onsetMin + 9, "ERROR", svc, buildId, "test", "DESERIALIZATION_GADGET_CHAIN", `Deserialization gadget chain detected in test execution`, { chain: "TemplatesImpl -> InvokerTransformer", severity: "critical" });
      addLog(onsetMin + 12, "INFO", svc, buildId, "build", "BUILD_SUCCESS", `Build succeeded with security warnings`, { warnings: 4 });
    }
  }

  // ── Transitive victim signals (subtle downstream evidence) ──────────
  for (const svc of scenario.transitiveVictims) {
    const buildId = `build-${svc}-${randHex(6, r)}`;
    addLog(onsetMin + 30, "WARN", svc, buildId, "deps", "TRANSITIVE_DEP_UPDATED", `Transitive dependency updated without explicit change`, { package: scenario.compromisedPackage, version: scenario.compromisedVersion, via: scenario.affectedServices[0] });
    addLog(onsetMin + 35, "INFO", svc, buildId, "build", "BUILD_SUCCESS", `Build succeeded`, {});
  }

  // ── Red herring ─────────────────────────────────────────────────────
  const rhBuildId = `build-${scenario.redHerring.service}-${randHex(6, r)}`;
  if (scenario.redHerring.service === "search-service") {
    addLog(onsetMin + 20, "WARN", scenario.redHerring.service, rhBuildId, "build", "DEPRECATION_WARNING", `Elasticsearch client API deprecated — migration to OpenSearch planned`, { affected_apis: 14, migration_pr: "#312" });
  } else if (scenario.redHerring.service === "analytics-service") {
    addLog(onsetMin + 15, "WARN", scenario.redHerring.service, rhBuildId, "test", "TEST_TIMEOUT", `ClickHouse query timeout in integration tests`, { timeout_ms: 30000, query: "SELECT count(*) FROM events", cause: "parallel_migration" });
  } else if (scenario.redHerring.service === "notification-service") {
    addLog(onsetMin + 10, "WARN", scenario.redHerring.service, rhBuildId, "deps", "DEPRECATION_FLOOD", `Firebase Admin SDK v11 deprecation warnings (47 warnings)`, { warnings_count: 47, pr: "#247", status: "open" });
  } else if (scenario.redHerring.service === "deploy-controller") {
    addLog(onsetMin + 25, "WARN", scenario.redHerring.service, rhBuildId, "deps", "RATE_LIMIT_429", `Go module proxy rate limiting`, { proxy: "proxy.golang.org", status: 429, retry_after_secs: 60 });
  }

  // ── Recent alerting (last 2 hours) ──────────────────────────────────
  addLog(-120, "ERROR", scenario.affectedServices[0], `alert-${randHex(4, r)}`, "security-scan", "SUPPLY_CHAIN_ALERT", `Supply chain security scan flagged anomalous build artifacts`, { severity: "P1", auto_escalated: true });
  addLog(-60, "WARN", scenario.affectedServices[0], `alert-${randHex(4, r)}`, "security-scan", "ARTIFACT_INTEGRITY_FAILED", `Artifact integrity check failed for recent builds`, { builds_affected: scenario.affectedServices.length + scenario.transitiveVictims.length });

  logs.sort((a, b) => a.ts.localeCompare(b.ts));
  return logs;
}

// ── Artifact and Dependency Database Tables ──────────────────────────

interface ArtifactDbTables {
  build_history: Array<Record<string, unknown>>;
  dependency_manifest: Array<Record<string, unknown>>;
  dependency_audit: Array<Record<string, unknown>>;
  artifact_registry: Array<Record<string, unknown>>;
  network_log: Array<Record<string, unknown>>;
  ci_secrets_inventory: Array<Record<string, unknown>>;
  pipeline_config: Array<Record<string, unknown>>;
}

function generateArtifactDb(scenario: typeof ATTACK_SCENARIOS[number], r: () => number): ArtifactDbTables {
  const onsetTs = new Date(BASE_TIME - scenario.timelineHoursAgo * 3600 * 1000).toISOString();

  // build_history: recent builds per service
  const build_history: Array<Record<string, unknown>> = [];
  for (const svc of MICROSERVICES) {
    for (let i = 0; i < 5; i++) {
      const hoursAgo = randInt(1, 96, r);
      const isCompromised = scenario.affectedServices.includes(svc.id as MicroserviceId) && hoursAgo <= scenario.timelineHoursAgo;
      build_history.push({
        build_id: `build-${svc.id}-${randHex(6, r)}`,
        service_id: svc.id,
        commit_sha: randHex(40, r),
        branch: "main",
        triggered_by: pick(["push", "schedule", "manual"] as const, r),
        started_at: new Date(BASE_TIME - hoursAgo * 3600 * 1000).toISOString(),
        duration_secs: isCompromised ? randInt(180, 600, r) : randInt(60, 180, r),
        status: "success",
        artifact_tag: `${svc.id}:${randHex(8, r)}`,
        artifact_sha256: randHex(64, r),
        deps_changed: isCompromised,
        security_scan_result: isCompromised ? "warnings" : "clean",
      });
    }
  }

  // dependency_manifest: current deps per service
  const dependency_manifest: Array<Record<string, unknown>> = [];
  for (const svc of MICROSERVICES) {
    for (const dep of svc.directDeps) {
      const parts = dep.includes("==") ? dep.split("==") : dep.includes("@") ? dep.split("@") : dep.split(":");
      dependency_manifest.push({
        service_id: svc.id,
        package_name: parts[0],
        declared_version: parts[1] || "latest",
        resolved_version: parts[1] || "latest",
        language: svc.language,
        lockfile_pinned: r() > 0.3,
        last_updated: new Date(BASE_TIME - randInt(1, 90, r) * 24 * 3600 * 1000).toISOString().split("T")[0],
      });
    }
    // Add the compromised package to affected services
    if (scenario.affectedServices.includes(svc.id as MicroserviceId)) {
      dependency_manifest.push({
        service_id: svc.id,
        package_name: scenario.compromisedPackage,
        declared_version: scenario.compromisedVersion,
        resolved_version: scenario.compromisedVersion,
        language: scenario.affectedLanguage,
        lockfile_pinned: false,
        last_updated: new Date(BASE_TIME - scenario.timelineHoursAgo * 3600 * 1000).toISOString().split("T")[0],
        note: scenario.id === "npm_typosquat" ? "first_seen_in_registry" : undefined,
      });
    }
  }

  // dependency_audit: approved package list
  const dependency_audit: Array<Record<string, unknown>> = [];
  const allApproved = new Set<string>();
  for (const svc of MICROSERVICES) {
    for (const dep of svc.directDeps) {
      const name = dep.includes("==") ? dep.split("==")[0] : dep.includes("@") ? dep.split("@")[0] : dep.split(":")[0];
      if (!allApproved.has(name)) {
        allApproved.add(name);
        dependency_audit.push({
          package_name: name,
          approved: true,
          last_audit_date: new Date(BASE_TIME - randInt(7, 60, r) * 24 * 3600 * 1000).toISOString().split("T")[0],
          auditor: pick(["security-bot", "team-lead", "external-audit"], r),
          risk_level: pick(["low", "medium"], r),
        });
      }
    }
  }
  // The compromised package: different audit status per scenario
  if (scenario.id === "npm_typosquat") {
    dependency_audit.push({
      package_name: "lodash-utils",
      approved: false,
      last_audit_date: null,
      auditor: null,
      risk_level: "unknown",
      note: "Package not found in approved list — added to lockfile without security review",
    });
  } else if (scenario.id === "pypi_backdoor") {
    dependency_audit.push({
      package_name: "cryptography",
      approved: true,
      last_audit_date: new Date(BASE_TIME - 90 * 24 * 3600 * 1000).toISOString().split("T")[0],
      auditor: "security-bot",
      risk_level: "low",
      note: "maintainer_key_rotated_48h_ago",
    });
  }

  // artifact_registry
  const artifact_registry: Array<Record<string, unknown>> = [];
  for (const svc of MICROSERVICES) {
    for (let i = 0; i < 3; i++) {
      const hoursAgo = randInt(1, 120, r);
      artifact_registry.push({
        image_tag: `ghcr.io/org/${svc.id}:${randHex(8, r)}`,
        service_id: svc.id,
        pushed_at: new Date(BASE_TIME - hoursAgo * 3600 * 1000).toISOString(),
        size_mb: randInt(50, 500, r),
        sha256: randHex(64, r),
        layers: randInt(5, 15, r),
        base_image: svc.language === "typescript" ? "node:20-alpine" : svc.language === "python" ? "python:3.12-slim" : svc.language === "java" ? "eclipse-temurin:21-jre" : "golang:1.21-alpine",
        vulnerability_scan: scenario.affectedServices.includes(svc.id as MicroserviceId) && hoursAgo <= scenario.timelineHoursAgo ? "critical" : pick(["clean", "clean", "clean", "low"], r),
      });
    }
  }

  // network_log: outbound connections during builds
  const network_log: Array<Record<string, unknown>> = [];
  // Normal traffic
  for (let i = 0; i < 20; i++) {
    network_log.push({
      ts: new Date(BASE_TIME - randInt(1, 96, r) * 3600 * 1000).toISOString(),
      source_service: pick(MICROSERVICES, r).id,
      destination: pick(["registry.npmjs.org", "pypi.org", "repo1.maven.org", "proxy.golang.org", "ghcr.io", "api.github.com"], r),
      port: 443,
      protocol: "HTTPS",
      direction: "outbound",
      bytes_sent: randInt(100, 50000, r),
      build_phase: true,
      flagged: false,
    });
  }
  // Attack traffic
  for (const svc of scenario.affectedServices) {
    const attackDest = scenario.id === "npm_typosquat" ? "c2.lodash-utils.io"
      : scenario.id === "pypi_backdoor" ? "unknown-ca.attacker.io"
      : scenario.id === "github_action_inject" ? "exfil.actions-cache.dev"
      : "exploit.jackson-mirror.net";
    network_log.push({
      ts: new Date(BASE_TIME - scenario.timelineHoursAgo * 3600 * 1000 + randInt(0, 3600, r) * 1000).toISOString(),
      source_service: svc,
      destination: attackDest,
      port: scenario.id === "maven_repo_poison" ? 1389 : 443,
      protocol: scenario.id === "maven_repo_poison" ? "LDAP" : "HTTPS",
      direction: "outbound",
      bytes_sent: randInt(1000, 10000, r),
      build_phase: true,
      flagged: true,
    });
  }

  // ci_secrets_inventory
  const ci_secrets_inventory = MICROSERVICES.map((svc) => ({
    service_id: svc.id,
    secrets: svc.language === "typescript"
      ? ["NPM_TOKEN", "GITHUB_TOKEN", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]
      : svc.language === "python"
      ? ["PYPI_TOKEN", "GITHUB_TOKEN", "DATABASE_URL", "ENCRYPTION_KEY"]
      : svc.language === "java"
      ? ["MAVEN_TOKEN", "GITHUB_TOKEN", "ELASTICSEARCH_PASSWORD", "SIGNING_KEY"]
      : ["GITHUB_TOKEN", "DEPLOY_KEY", "KUBECONFIG_B64"],
    last_rotated: new Date(BASE_TIME - randInt(7, 180, r) * 24 * 3600 * 1000).toISOString().split("T")[0],
    rotation_policy_days: 90,
    exposure_status: scenario.affectedServices.includes(svc.id as MicroserviceId) ? "potentially_compromised" : "secure",
  }));

  // pipeline_config
  const pipeline_config = MICROSERVICES.map((svc) => ({
    service_id: svc.id,
    ci_platform: "github-actions",
    workflow_file: `.github/workflows/${svc.id}.yml`,
    action_pins: svc.id === "deploy-controller" || svc.id === "search-service"
      ? (scenario.id === "github_action_inject" ? "mutable_tag" : "sha_pinned")
      : pick(["sha_pinned", "sha_pinned", "mutable_tag"], r),
    security_scan_enabled: true,
    sbom_generation: r() > 0.5,
    dependency_review: r() > 0.3,
    network_policy: pick(["allow_registry_only", "allow_all", "allow_registry_only"], r),
  }));

  return {
    build_history,
    dependency_manifest,
    dependency_audit,
    artifact_registry,
    network_log,
    ci_secrets_inventory,
    pipeline_config,
  };
}

// ── Initial Triage Context ───────────────────────────────────────────

function generateTriageContext(scenario: typeof ATTACK_SCENARIOS[number], seed: number): Record<string, unknown> {
  return {
    alert_id: `SEC-${seed.toString().slice(0, 6)}`,
    detected_at: new Date(BASE_TIME - 120 * 60 * 1000).toISOString(),
    severity: "P0",
    escalated_at: new Date(BASE_TIME - 90 * 60 * 1000).toISOString(),
    alert_source: "automated supply chain security scanner",
    initial_findings: {
      anomalous_builds: scenario.affectedServices.map((svc) => ({
        service: svc,
        finding: "build artifacts contain unexpected dependency changes and network activity",
        confidence: "high",
      })),
      network_anomalies: [
        {
          type: "outbound_traffic_during_build",
          destination: scenario.id === "npm_typosquat" ? "c2.lodash-utils.io"
            : scenario.id === "pypi_backdoor" ? "unknown-ca.attacker.io"
            : scenario.id === "github_action_inject" ? "exfil.actions-cache.dev"
            : "exploit.jackson-mirror.net",
          services_affected: scenario.affectedServices.length,
        },
      ],
    },
    triage_note: "Automated scanner detected supply chain anomalies. Build logs and artifact registry show suspicious activity. Root cause and blast radius are unknown. Do not assume the initially flagged services are the only affected ones.",
    response_protocol: "INCIDENT_SUPPLY_CHAIN_L1",
  };
}

// ── Main Export ───────────────────────────────────────────────────────

export interface PipelineBreachGroundTruth {
  attackVectorId: AttackVectorId;
  attackVectorType: AttackVectorType;
  attackVectorName: string;
  compromisedPackage: string;
  compromisedVersion: string;
  safeVersion: string;
  affectedServices: MicroserviceId[];
  transitiveVictims: MicroserviceId[];
  fullBlastRadius: MicroserviceId[];
  remediationSequence: Array<{ service: MicroserviceId; action: string; params: Record<string, unknown> }>;
  redHerring: { service: MicroserviceId; symptom: string; actualCause: string };
  logSignals: readonly string[];
  dbSignals: Record<string, string>;
  indicators: Record<string, string>;
  seed: number;
}

export interface PipelineBreachGeneratedData {
  objective: string;
  groundTruth: PipelineBreachGroundTruth;
  scenario: typeof ATTACK_SCENARIOS[number];
  buildLogs: BuildLogEntry[];
  artifactDb: ArtifactDbTables;
  triageContext: Record<string, unknown>;
}

export function generatePipelineBreachData(seed: number): PipelineBreachGeneratedData {
  const r = rng(seed);

  const scenarioIdx = Math.floor(r() * ATTACK_SCENARIOS.length);
  const scenario = ATTACK_SCENARIOS[scenarioIdx];

  const buildLogs = generateBuildLogs(scenario, r);
  const artifactDb = generateArtifactDb(scenario, r);
  const triageContext = generateTriageContext(scenario, seed);

  const fullBlastRadius = [...scenario.affectedServices, ...scenario.transitiveVictims];

  const objective =
    `P0 SECURITY INCIDENT — Supply chain attack detected in CI/CD pipeline. ` +
    `Automated scanners flagged anomalous build artifacts in ${scenario.affectedServices.slice(0, 2).join(" and ")} services. ` +
    `You have access to: live pipeline API, MCP build log server, MCP artifact database, and security documentation proxy. ` +
    `Identify the attack vector, trace the full blast radius, execute remediation, and submit a security advisory. ` +
    `Valid attack_vector values: npm_typosquat, pypi_backdoor, github_action_inject, maven_repo_poison. ` +
    `Submit: { attack_vector, attack_evidence, compromised_package, blast_radius, remediation_actions_taken, remediation_script, security_advisory, methodology }`;

  const groundTruth: PipelineBreachGroundTruth = {
    attackVectorId: scenario.id as AttackVectorId,
    attackVectorType: scenario.attackVector,
    attackVectorName: scenario.name,
    compromisedPackage: scenario.compromisedPackage,
    compromisedVersion: scenario.compromisedVersion,
    safeVersion: scenario.safeVersion,
    affectedServices: [...scenario.affectedServices],
    transitiveVictims: [...scenario.transitiveVictims],
    fullBlastRadius: fullBlastRadius as MicroserviceId[],
    remediationSequence: scenario.remediation.map((r) => ({ ...r, params: { ...r.params } })),
    redHerring: { ...scenario.redHerring },
    logSignals: scenario.logSignals,
    dbSignals: scenario.dbSignals,
    indicators: { ...scenario.indicators },
    seed,
  };

  return { objective, groundTruth, scenario, buildLogs, artifactDb, triageContext };
}
