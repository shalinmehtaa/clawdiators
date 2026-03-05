/**
 * The Phantom Registry — MCP Audit Database Server
 *
 * SSE-based MCP server providing audit log query tools.
 * Generates the same deterministic audit data from SEED.
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
    out.push(pool[idx]); pool.splice(idx, 1);
  }
  return out;
}
function randInt(min, max, r) { return min + Math.floor(r() * (max - min + 1)); }
function shuffle(arr, r) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Name pools (must match data.ts exactly) ──────────────────────────

const PACKAGE_PREFIXES = ["reef","coral","tide","wave","kelp","shell","pearl","anchor","drift","foam","surge","deep","brine","salt","fin","gill","scale","hull","mast","keel","stern","bow","plank","rivet","bolt","chain","rope","net","hook","lure","cast","reel","spool","knot","splice","weave","braid","twine","yarn","fiber"];
const PACKAGE_SUFFIXES = ["utils","core","lib","io","db","cache","queue","log","auth","config","fmt","parse","codec","net","http","rpc","cli","test","lint","build","pack","bundle","serve","watch","sync","pipe","flow","stream","pool","guard","proxy","relay","bridge","gate","port","hub","node","link","mesh","grid"];
const FIRST_NAMES = ["Ada","Grace","Alan","Linus","Guido","Bjarne","Dennis","Ken","Margaret","Barbara","Fran","Hedy","Radia","Anita","Katherine","Joan"];
const LAST_NAMES = ["Lovelace","Hopper","Turing","Torvalds","Rossum","Stroustrup","Ritchie","Thompson","Hamilton","Liskov","Allen","Lamarr","Perlman","Borg","Johnson","Clarke"];
const HANDLE_ADJECTIVES = ["swift","clever","rusty","salty","misty","fuzzy","lucky","dusty","rocky","sandy","stormy","sunny","frosty","crispy","curly","dizzy"];
const HANDLE_NOUNS = ["crab","lobster","squid","octopus","eel","ray","shark","whale","turtle","seal","otter","pelican","gull","heron","plover","tern"];
const ATTACK_VECTORS = [
  { id: "credential_phishing", signals: ["LOGIN_FROM_NEW_IP","API_TOKEN_REGENERATED","RAPID_PUBLISH_AFTER_TOKEN_CHANGE"] },
  { id: "typosquat_takeover", signals: ["SIMILAR_PACKAGE_REGISTERED","CONTRIBUTOR_ELEVATED","MAINTAINER_ADDED_BY_SOCIAL_ENGINEERING"] },
  { id: "abandoned_package_takeover", signals: ["OWNERSHIP_TRANSFER_REQUEST","PACKAGE_DORMANT_THEN_ACTIVE","BULK_VERSION_PUBLISH"] },
  { id: "build_script_injection", signals: ["PR_MERGED_WITH_SCRIPT_CHANGE","POSTINSTALL_ADDED","OBFUSCATED_SCRIPT_CONTENT"] },
];
const MALICIOUS_PAYLOADS = [
  { type: "env_exfiltration" }, { type: "ssh_key_theft" }, { type: "token_harvesting" }, { type: "backdoor_install" },
];

function daysAgo(d) { return new Date(new Date("2026-03-01T12:00:00Z").getTime() - d * 86400000).toISOString(); }
function daysAgoWithTime(d, h, m) {
  const t = new Date(new Date("2026-03-01T12:00:00Z").getTime() - d * 86400000);
  t.setUTCHours(h, m, 0, 0); return t.toISOString();
}

// ── Generate audit logs (must match data.ts exactly) ─────────────────

function generateAuditData(seed) {
  const r = rng(seed);
  const logs = [];
  let logId = 1;

  // Generate maintainers (same PRNG sequence as data.ts)
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
    maintainers.push({ handle, packages: [], loginIPs: [ip1, ip2], twoFactorEnabled: r() > 0.3 });
  }

  // Generate packages (consume same PRNG values as data.ts)
  const packages = [];
  const usedNames = new Set();
  const prefixes = shuffle([...PACKAGE_PREFIXES], r);
  const suffixes = shuffle([...PACKAGE_SUFFIXES], r);

  for (let i = 0; i < 40; i++) {
    let name;
    do { name = prefixes[i % prefixes.length] + "-" + suffixes[i % suffixes.length]; } while (usedNames.has(name));
    usedNames.add(name);
    const maintainerIdx = i % 15, secondMaintainer = (i + 3) % 15;
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
      Array.from({length: 64}, () => r()); // consume checksum PRNG values
      const size = randInt(5000, 500000, r);
      versions.push({ version: `${major}.${minor}.${patch}`, publishedAt: daysAgo(vDaysAgo), publishedBy: pick(pkgMaintainers, r) });
    }
    // consume PRNG values for description, weeklyDownloads, dependents, keywords
    r(); r(); r(); r(); r(); // description picks
    const weeklyDownloads = randInt(100, 500000, r);
    randInt(0, 2000, r); // dependents
    randInt(90, 800, r); // createdAt (already consumed above, but data.ts calls it separately for package.createdAt)
    // Actually this is getting complex - we need keyword picks too
    const kwCount = randInt(2, 4, r);
    for (let k = 0; k < Math.min(kwCount, 12); k++) { r(); } // pickN consumes

    packages.push({ name, versions, maintainers: pkgMaintainers, weeklyDownloads });
  }

  // Attack scenario (same PRNG sequence)
  const attackVector = pick(ATTACK_VECTORS, r);
  pick(MALICIOUS_PAYLOADS, r); // payload

  let phantomHandle;
  do { phantomHandle = pick(HANDLE_ADJECTIVES, r) + "-" + pick(HANDLE_NOUNS, r); } while (usedHandles.has(phantomHandle));
  const phantomJoinedDaysAgo = randInt(45, 90, r);
  const phantomIP = `${randInt(180,220,r)}.${randInt(1,254,r)}.${randInt(1,254,r)}.${randInt(1,254,r)}`;
  r(); r(); r(); // consume lastActive + name picks
  maintainers.push({ handle: phantomHandle, packages: [], loginIPs: [phantomIP], twoFactorEnabled: true });

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

  // Malicious version data (consume same PRNG values)
  const attackStartDaysAgo = randInt(12, 25, r);
  for (let pi = 0; pi < targetPkgs.length; pi++) {
    const pkg = targetPkgs[pi];
    const lastVer = pkg.versions[pkg.versions.length - 1];
    const [maj, min, pat] = lastVer.version.split(".").map(Number);
    const publishDaysAgo = attackStartDaysAgo - (pi * randInt(2, 5, r));
    Array.from({length: 64}, () => r()); // checksum
    r(); // pick domain
    randInt(200, 800, r); // size delta
  }

  // Red herring (consume same PRNG values)
  const redHerringCandidates = maintainers.filter(m =>
    m.handle !== phantomHandle && m.handle !== compromisedMaintainer.handle && m.packages.length >= 2);
  pick(redHerringCandidates, r);
  randInt(30, 60, r); // joinedAt
  // rhPkg version: consume PRNG
  randInt(3, 8, r);
  Array.from({length: 64}, () => r());
  randInt(100, 500, r);

  // ── Now generate audit logs ────────────────────────────────────────

  // Normal background activity
  for (let d = 60; d >= 0; d--) {
    const eventsPerDay = randInt(8, 20, r);
    for (let e = 0; e < eventsPerDay; e++) {
      const m = pick(maintainers.filter(m => m.handle !== phantomHandle), r);
      const hour = randInt(8, 22, r), minute = randInt(0, 59, r);
      const actions = ["login", "package.view", "package.download", "profile.update", "token.list"];
      const action = pick(actions, r);
      logs.push({
        id: `audit-${String(logId++).padStart(6, "0")}`,
        timestamp: daysAgoWithTime(d, hour, minute), actor: m.handle,
        action, target: action.startsWith("package") ? pick(packages, r).name : m.handle,
        details: action === "login" ? "Successful authentication" : `${action} operation`,
        ip: pick(m.loginIPs, r), success: true,
      });
    }
  }

  // Version publish events
  for (const pkg of packages) {
    for (const ver of pkg.versions) {
      if (ver.publishedBy === phantomHandle) continue;
      const publisher = maintainers.find(m => m.handle === ver.publishedBy) || maintainers[0];
      logs.push({
        id: `audit-${String(logId++).padStart(6, "0")}`,
        timestamp: ver.publishedAt, actor: ver.publishedBy,
        action: "package.publish", target: `${pkg.name}@${ver.version}`,
        details: `Published version ${ver.version}`,
        ip: pick(publisher.loginIPs, r), success: true,
      });
    }
  }

  // Attack events
  logs.push({
    id: `audit-${String(logId++).padStart(6, "0")}`,
    timestamp: daysAgoWithTime(attackStartDaysAgo + 5, 3, randInt(0, 59, r)),
    actor: "system", action: "account.create", target: phantomHandle,
    details: `New account registered: ${phantomHandle}`, ip: phantomIP, success: true,
  });

  for (const signal of attackVector.signals) {
    logs.push({
      id: `audit-${String(logId++).padStart(6, "0")}`,
      timestamp: daysAgoWithTime(attackStartDaysAgo + 2, randInt(1, 5, r), randInt(0, 59, r)),
      actor: compromisedMaintainer.handle, action: `security.${signal.toLowerCase()}`,
      target: compromisedMaintainer.handle, details: signal.replace(/_/g, " "),
      ip: phantomIP, success: true,
    });
  }

  logs.push({
    id: `audit-${String(logId++).padStart(6, "0")}`,
    timestamp: daysAgoWithTime(attackStartDaysAgo + 1, 4, randInt(0, 59, r)),
    actor: compromisedMaintainer.handle, action: "package.maintainer.add",
    target: targetPkgs[2].name, details: `Added ${phantomHandle} as maintainer`,
    ip: phantomIP, success: true,
  });

  for (let i = 0; i < 3; i++) {
    logs.push({
      id: `audit-${String(logId++).padStart(6, "0")}`,
      timestamp: daysAgoWithTime(attackStartDaysAgo + 3, randInt(0, 6, r), randInt(0, 59, r)),
      actor: compromisedMaintainer.handle, action: "login", target: compromisedMaintainer.handle,
      details: "Failed authentication attempt", ip: phantomIP, success: false,
    });
  }

  for (const pkg of targetPkgs) {
    const malVer = pkg.versions[pkg.versions.length - 1];
    logs.push({
      id: `audit-${String(logId++).padStart(6, "0")}`,
      timestamp: malVer.publishedAt, actor: malVer.publishedBy,
      action: "package.publish", target: `${pkg.name}@${malVer.version}`,
      details: `Published version ${malVer.version} with postinstall script`,
      ip: phantomIP, success: true,
    });
  }

  logs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { logs, phantomHandle, compromisedHandle: compromisedMaintainer.handle, phantomIP };
}

// ── Generate audit data ──────────────────────────────────────────────

const auditData = generateAuditData(SEED);

// ── MCP SSE Server ───────────────────────────────────────────────────

let mcpRequestId = 0;

function handleMCPToolCall(toolName, args) {
  const logs = auditData.logs;

  switch (toolName) {
    case "query_audit_log": {
      let filtered = [...logs];
      if (args.actor) filtered = filtered.filter(l => l.actor === args.actor);
      if (args.action) filtered = filtered.filter(l => l.action.includes(args.action));
      if (args.target) filtered = filtered.filter(l => l.target.includes(args.target));
      if (args.ip) filtered = filtered.filter(l => l.ip === args.ip);
      if (args.success !== undefined) filtered = filtered.filter(l => l.success === args.success);
      if (args.time_range) {
        if (args.time_range.from) filtered = filtered.filter(l => l.timestamp >= args.time_range.from);
        if (args.time_range.to) filtered = filtered.filter(l => l.timestamp <= args.time_range.to);
      }
      const limit = args.limit || 100;
      return { results: filtered.slice(-limit), total: filtered.length };
    }

    case "get_ip_activity": {
      if (!args.ip) return { error: "ip parameter required" };
      const results = logs.filter(l => l.ip === args.ip);
      const actors = [...new Set(results.map(l => l.actor))];
      return { ip: args.ip, events: results, unique_actors: actors, total: results.length };
    }

    case "get_actor_timeline": {
      if (!args.handle) return { error: "handle parameter required" };
      const results = logs.filter(l => l.actor === args.handle);
      const ips = [...new Set(results.map(l => l.ip))];
      return { handle: args.handle, events: results, unique_ips: ips, total: results.length };
    }

    case "get_suspicious_patterns": {
      const patterns = [];

      // Unusual hours (00:00-06:00 UTC)
      const nightActivity = logs.filter(l => {
        const hour = new Date(l.timestamp).getUTCHours();
        return hour >= 0 && hour < 6;
      });
      const nightActors = {};
      for (const l of nightActivity) {
        nightActors[l.actor] = (nightActors[l.actor] || 0) + 1;
      }
      for (const [actor, count] of Object.entries(nightActors)) {
        if (count >= 3) patterns.push({ type: "unusual_hours", actor, count, description: `${count} events during 00:00-06:00 UTC` });
      }

      // IP sharing across accounts
      const ipToActors = {};
      for (const l of logs) {
        if (!ipToActors[l.ip]) ipToActors[l.ip] = new Set();
        ipToActors[l.ip].add(l.actor);
      }
      for (const [ip, actors] of Object.entries(ipToActors)) {
        const actorList = [...actors].filter(a => a !== "system");
        if (actorList.length >= 2) {
          patterns.push({ type: "shared_ip", ip, actors: actorList, description: `IP ${ip} used by ${actorList.length} different actors` });
        }
      }

      // Failed login followed by success
      const failedByActor = {};
      for (const l of logs) {
        if (l.action === "login" && !l.success) {
          failedByActor[l.actor] = (failedByActor[l.actor] || 0) + 1;
        }
      }
      for (const [actor, count] of Object.entries(failedByActor)) {
        if (count >= 2) patterns.push({ type: "brute_force", actor, failed_attempts: count, description: `${count} failed login attempts` });
      }

      // Rapid publishes (2+ publishes in 24h)
      const publishesByActor = {};
      for (const l of logs) {
        if (l.action === "package.publish") {
          if (!publishesByActor[l.actor]) publishesByActor[l.actor] = [];
          publishesByActor[l.actor].push(l.timestamp);
        }
      }
      for (const [actor, timestamps] of Object.entries(publishesByActor)) {
        timestamps.sort();
        for (let i = 1; i < timestamps.length; i++) {
          const diff = (new Date(timestamps[i]) - new Date(timestamps[i-1])) / 3600000;
          if (diff < 24) {
            patterns.push({ type: "rapid_publish", actor, description: `2+ publishes within 24h` });
            break;
          }
        }
      }

      return { patterns, total: patterns.length };
    }

    case "compare_ips": {
      const ipToActors = {};
      for (const l of logs) {
        if (!ipToActors[l.ip]) ipToActors[l.ip] = new Set();
        ipToActors[l.ip].add(l.actor);
      }
      const shared = [];
      for (const [ip, actors] of Object.entries(ipToActors)) {
        const actorList = [...actors].filter(a => a !== "system");
        if (actorList.length >= 2) {
          shared.push({ ip, actors: actorList, event_count: logs.filter(l => l.ip === ip).length });
        }
      }
      return { shared_ips: shared, total: shared.length };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ── SSE MCP transport ────────────────────────────────────────────────

const TOOLS = [
  { name: "query_audit_log", description: "Query audit events with filters", inputSchema: { type: "object", properties: { actor: { type: "string" }, action: { type: "string" }, target: { type: "string" }, ip: { type: "string" }, success: { type: "boolean" }, time_range: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } } }, limit: { type: "number" } } } },
  { name: "get_ip_activity", description: "All audit events from a specific IP address", inputSchema: { type: "object", properties: { ip: { type: "string" } }, required: ["ip"] } },
  { name: "get_actor_timeline", description: "Chronological activity for a maintainer handle", inputSchema: { type: "object", properties: { handle: { type: "string" } }, required: ["handle"] } },
  { name: "get_suspicious_patterns", description: "Pre-computed anomaly detection: unusual hours, IP sharing, rapid publishes", inputSchema: { type: "object", properties: {} } },
  { name: "compare_ips", description: "Find actors who share IP addresses", inputSchema: { type: "object", properties: {} } },
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok" }));
  }

  // SSE endpoint
  if (url.pathname === "/sse" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    const sessionId = `session-${++mcpRequestId}`;
    res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

    const keepalive = setInterval(() => res.write(": keepalive\n\n"), 15000);
    req.on("close", () => clearInterval(keepalive));
    return;
  }

  // Message endpoint (JSON-RPC over POST, responses as SSE would be complex,
  // so we use simple JSON-RPC request/response for tool calls)
  if (url.pathname === "/messages" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const msg = JSON.parse(body);
        let result;

        if (msg.method === "initialize") {
          result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "phantom-audit-db", version: "1.0" } };
        } else if (msg.method === "tools/list") {
          result = { tools: TOOLS };
        } else if (msg.method === "tools/call") {
          const toolResult = handleMCPToolCall(msg.params.name, msg.params.arguments || {});
          result = { content: [{ type: "text", text: JSON.stringify(toolResult, null, 2) }] };
        } else if (msg.method === "notifications/initialized") {
          res.writeHead(204);
          return res.end();
        } else {
          result = { error: { code: -32601, message: "Method not found" } };
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[phantom-audit-db] MCP server listening on port ${PORT} (seed=${SEED})`);
});
