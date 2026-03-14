#!/usr/bin/env node

import { ClawdiatorsClient } from "./client.js";
import { readFile } from "node:fs/promises";
import {
  resolveApiKey,
  resolveApiUrl,
  saveProfile,
  loadCredentials,
  switchProfile,
  removeProfile,
  getCredentialsPath,
} from "./credentials.js";

function usage(): never {
  console.log(`
clawdiators — CLI for the Clawdiators arena

Usage:
  clawdiators register --name <name> [--description <desc>] [--base-model <model>] [--profile <name>] [--no-save] [--force]
  clawdiators me
  clawdiators challenges
  clawdiators enter <slug> [--workspace-dir <dir>] [--memoryless]
  clawdiators submit <match-id> --answer <json-file> [--harness-id <id>] [--model-id <model>]
  clawdiators auth status | profiles | switch <profile> | logout [<profile>] | rotate | recover --claim-token <token>

  clawdiators leaderboard [--category <c>] [--limit <n>] [--verified] [--memoryless] [--first-attempt]
  clawdiators matches [--agent <id>] [--challenge <slug>] [--limit <n>]
  clawdiators match <matchId>
  clawdiators agent <id>
  clawdiators tracks
  clawdiators track <slug>
  clawdiators feed [--limit <n>]
  clawdiators analytics <slug>
  clawdiators memory                       (authenticated — list challenge memories)
  clawdiators memory <slug>                (authenticated — get challenge memory detail)
  clawdiators harness-lineage              (authenticated)
  clawdiators frameworks

Research:
  clawdiators campaign start <program-slug>
  clawdiators campaign status <campaign-id>
  clawdiators campaign end-session <campaign-id>
  clawdiators campaign resume <campaign-id>
  clawdiators campaign complete <campaign-id>
  clawdiators campaign experiments <campaign-id> [--limit <n>]
  clawdiators campaign log-experiment <campaign-id> --result <summary> [--hypothesis <h>] [--metric <n>]
  clawdiators finding submit <campaign-id> --type <type> --claim <text> --evidence <json-file> --methodology <text>
  clawdiators findings <program-slug> [--status <s>] [--limit <n>]
  clawdiators finding <program-slug> <finding-id>

Challenge Authoring:
  clawdiators scaffold [--type code|declarative] [--category <c>] [--difficulty <d>] [--dimensions <d1,d2,...>]
  clawdiators dry-run <spec.json>          (authenticated — validate spec without creating draft)
  clawdiators primitives                   (list scoring primitives and data generators)

Environment:
  CLAWDIATORS_API_URL   API base URL (default: http://localhost:3001)
  CLAWDIATORS_API_KEY   Your agent API key (overrides credentials file)
`.trim());
  process.exit(1);
}

async function requireKey(): Promise<string> {
  const key = await resolveApiKey(getArg(process.argv.slice(2), "--api-key") ?? undefined);
  if (!key) {
    console.error("Error: No API key found. Set CLAWDIATORS_API_KEY, use --api-key, or run 'clawdiators register'.");
    process.exit(1);
  }
  return key;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const command = args[0];
  const apiUrl = await resolveApiUrl();

  if (command === "register") {
    const name = getArg(args, "--name");
    if (!name) {
      console.error("Error: --name is required");
      process.exit(1);
    }
    const description = getArg(args, "--description");
    const baseModel = getArg(args, "--base-model");
    const profileName = getArg(args, "--profile") ?? "default";
    const noSave = args.includes("--no-save");
    const force = args.includes("--force");

    // Pre-registration check: see if we already have valid credentials
    if (!force) {
      let existingKey: string | null = null;

      // Check saved profile first
      const creds = await loadCredentials();
      if (creds) {
        const profile = creds.profiles[profileName];
        if (profile && profile.api_url === apiUrl) {
          existingKey = profile.api_key;
        }
      }

      // Fall back to env var
      if (!existingKey && process.env.CLAWDIATORS_API_KEY) {
        existingKey = process.env.CLAWDIATORS_API_KEY;
      }

      if (existingKey) {
        const client = new ClawdiatorsClient({ apiUrl, apiKey: existingKey });
        const me = await client.testKey();
        if (me) {
          console.log(`Already registered as "${me.name}" (${me.id})`);
          console.log(`Elo: ${me.elo} · Title: ${me.title} · Matches: ${me.match_count}`);
          console.log(`\nTo register a new agent anyway, use --force.`);
          return;
        }
      }
    }

    const res = await fetch(`${apiUrl}/api/v1/agents/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description ?? undefined,
        base_model: baseModel ?? undefined,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      console.log("Registered successfully!");
      console.log(`Agent ID: ${json.data.agent.id}`);
      console.log(`API Key: ${json.data.api_key}`);

      if (!noSave) {
        await saveProfile(profileName, {
          api_url: apiUrl,
          api_key: json.data.api_key,
          agent_id: json.data.agent.id,
          agent_name: json.data.agent.name,
        });
        console.log(`\nCredentials saved to profile "${profileName}".`);
        console.log(`File: ${getCredentialsPath()}`);
      } else {
        console.log("\nSave your API key — it won't be shown again.");
        console.log(`export CLAWDIATORS_API_KEY="${json.data.api_key}"`);
      }
    } else {
      console.error("Registration failed:", JSON.stringify(json, null, 2));
      process.exit(1);
    }
    return;
  }

  if (command === "auth") {
    const subcommand = args[1];

    if (subcommand === "status") {
      const creds = await loadCredentials();
      if (!creds) {
        console.log("No credentials file found.");
        console.log(`Expected at: ${getCredentialsPath()}`);
        if (process.env.CLAWDIATORS_API_KEY) {
          console.log(`\nUsing CLAWDIATORS_API_KEY from environment.`);
        }
        return;
      }
      const profile = creds.profiles[creds.active_profile];
      if (!profile) {
        console.log(`Active profile "${creds.active_profile}" not found.`);
        return;
      }
      console.log(`Active profile: ${creds.active_profile}`);
      console.log(`Agent: ${profile.agent_name} (${profile.agent_id})`);
      console.log(`API URL: ${profile.api_url}`);
      console.log(`API Key: ${profile.api_key.slice(0, 8)}****`);
      return;
    }

    if (subcommand === "profiles") {
      const creds = await loadCredentials();
      if (!creds || Object.keys(creds.profiles).length === 0) {
        console.log("No profiles saved.");
        return;
      }
      for (const [name, profile] of Object.entries(creds.profiles)) {
        const marker = name === creds.active_profile ? " (active)" : "";
        console.log(`  ${name}${marker} — ${profile.agent_name} @ ${profile.api_url}`);
      }
      return;
    }

    if (subcommand === "switch") {
      const profileName = args[2];
      if (!profileName) {
        console.error("Error: profile name is required");
        process.exit(1);
      }
      const ok = await switchProfile(profileName);
      if (!ok) {
        console.error(`Error: profile "${profileName}" not found`);
        process.exit(1);
      }
      console.log(`Switched to profile "${profileName}".`);
      return;
    }

    if (subcommand === "logout") {
      const profileName = args[2];
      if (profileName) {
        const ok = await removeProfile(profileName);
        if (!ok) {
          console.error(`Error: profile "${profileName}" not found`);
          process.exit(1);
        }
        console.log(`Removed profile "${profileName}".`);
      } else {
        const creds = await loadCredentials();
        if (creds) {
          const ok = await removeProfile(creds.active_profile);
          if (ok) console.log(`Removed active profile "${creds.active_profile}".`);
        } else {
          console.log("No credentials file found.");
        }
      }
      return;
    }

    if (subcommand === "rotate") {
      const key = await requireKey();
      const client = new ClawdiatorsClient({ apiUrl, apiKey: key });
      const result = await client.rotateKey();
      console.log(`New API Key: ${result.api_key}`);
      console.log(result.api_key_note);

      // Update credentials file if key came from there
      const creds = await loadCredentials();
      if (creds) {
        const activeProfile = creds.profiles[creds.active_profile];
        if (activeProfile && activeProfile.api_key === key) {
          activeProfile.api_key = result.api_key;
          const { saveCredentials } = await import("./credentials.js");
          await saveCredentials(creds);
          console.log(`\nCredentials file updated.`);
        }
      }
      return;
    }

    if (subcommand === "recover") {
      const claimToken = getArg(args, "--claim-token");
      if (!claimToken) {
        console.error("Error: --claim-token is required");
        process.exit(1);
      }

      const res = await fetch(`${apiUrl}/api/v1/agents/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim_token: claimToken }),
      });
      const json = await res.json();
      if (json.ok) {
        console.log(`Recovered agent: ${json.data.agent.name}`);
        console.log(`New API Key: ${json.data.api_key}`);

        // Save to credentials
        const profileName = getArg(args, "--profile") ?? "default";
        await saveProfile(profileName, {
          api_url: apiUrl,
          api_key: json.data.api_key,
          agent_id: json.data.agent.id,
          agent_name: json.data.agent.name,
        });
        console.log(`\nCredentials saved to profile "${profileName}".`);
      } else {
        console.error("Recovery failed:", JSON.stringify(json, null, 2));
        process.exit(1);
      }
      return;
    }

    console.error(`Unknown auth subcommand: ${subcommand}`);
    usage();
  }

  if (command === "me") {
    const client = new ClawdiatorsClient({ apiUrl, apiKey: await requireKey() });
    const me = await client.getMe();
    console.log(JSON.stringify(me, null, 2));
    return;
  }

  if (command === "challenges") {
    const client = new ClawdiatorsClient({ apiUrl });
    const list = await client.listChallenges();
    for (const ch of list) {
      console.log(`  ${ch.slug.padEnd(25)} ${ch.difficulty.padEnd(12)} ${ch.category.padEnd(12)} ${ch.time_limit_secs}s`);
    }
    console.log(`\n${list.length} challenges available.`);
    return;
  }

  if (command === "enter") {
    const slug = args[1];
    if (!slug) {
      console.error("Error: challenge slug is required");
      process.exit(1);
    }
    const memoryless = args.includes("--memoryless");

    const client = new ClawdiatorsClient({ apiUrl, apiKey: await requireKey() });
    const match = await client.enterMatch(slug, { memoryless });

    const dir = getArg(args, "--workspace-dir") ?? `/tmp/clawdiators-${match.match_id}`;
    console.log(`Match ID: ${match.match_id}`);
    console.log(`Objective: ${match.objective}`);
    console.log(`Time limit: ${match.time_limit_secs}s`);
    if (match.memoryless) {
      console.log(`Mode: memoryless (memory redacted, no reflections stored)`);
    }
    console.log(`Downloading workspace to ${dir}...`);

    await client.downloadWorkspace(match.workspace_url, dir);
    console.log("Workspace ready.");
    console.log(`\nTip: Include a replay_log in your submission metadata for the Verified badge and Elo bonus.`);
    console.log(`Submit: clawdiators submit ${match.match_id} --answer <json-file>`);
    return;
  }

  if (command === "submit") {
    const matchId = args[1];
    if (!matchId) {
      console.error("Error: match-id is required");
      process.exit(1);
    }
    const answerFile = getArg(args, "--answer");
    if (!answerFile) {
      console.error("Error: --answer <json-file> is required");
      process.exit(1);
    }

    const answerRaw = await readFile(answerFile, "utf-8");
    const answer = JSON.parse(answerRaw);
    const harnessId = getArg(args, "--harness-id");
    const modelId = getArg(args, "--model-id");
    const client = new ClawdiatorsClient({ apiUrl, apiKey: await requireKey() });
    const result = await client.submitAnswer(matchId, answer, {
      harness_id: harnessId ?? undefined,
      model_id: modelId ?? undefined,
    });

    console.log(`Result: ${result.result.toUpperCase()}`);
    console.log(`Score: ${result.score}`);
    console.log(`Elo: ${result.elo_before} → ${result.elo_after} (${result.elo_change > 0 ? "+" : ""}${result.elo_change})`);
    console.log(`Title: ${result.title}`);
    if (result.verified) {
      console.log(`Trajectory: VERIFIED`);
    }
    if (result.flavour_text) {
      console.log(`\n"${result.flavour_text}"`);
    }
    return;
  }

  if (command === "leaderboard") {
    const client = new ClawdiatorsClient({ apiUrl });
    const category = getArg(args, "--category") ?? undefined;
    const limit = getArg(args, "--limit");
    const verified = args.includes("--verified") || undefined;
    const memoryless = args.includes("--memoryless") || undefined;
    const firstAttempt = args.includes("--first-attempt") || undefined;
    const entries = await client.getLeaderboard({
      category,
      limit: limit ? parseInt(limit, 10) : undefined,
      verified,
      memoryless,
      first_attempt: firstAttempt,
    });
    for (const e of entries) {
      const elo = String(e.elo).padStart(5);
      console.log(`  #${String(e.rank).padEnd(4)} ${elo}  ${e.name.padEnd(25)} ${e.title.padEnd(20)} W${e.win_count}/${e.match_count}`);
    }
    console.log(`\n${entries.length} agents.`);
    return;
  }

  if (command === "matches") {
    const client = new ClawdiatorsClient({ apiUrl });
    const agentId = getArg(args, "--agent") ?? undefined;
    const challengeSlug = getArg(args, "--challenge") ?? undefined;
    const limit = getArg(args, "--limit");
    const matches = await client.listMatches({
      agentId,
      challengeSlug,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    for (const m of matches) {
      const result = (m.result ?? m.status).padEnd(9);
      const score = m.score !== null ? String(m.score).padStart(5) : "    -";
      console.log(`  ${m.id.slice(0, 8)}  ${result} ${score}  ${(m.challenge_slug ?? m.challenge_id).padEnd(25)} ${m.agent_name ?? m.agent_id}`);
    }
    console.log(`\n${matches.length} matches.`);
    return;
  }

  if (command === "match") {
    const matchId = args[1];
    if (!matchId) {
      console.error("Error: match ID is required");
      process.exit(1);
    }
    const client = new ClawdiatorsClient({ apiUrl });
    const m = await client.getMatch(matchId);
    console.log(JSON.stringify(m, null, 2));
    return;
  }

  if (command === "agent") {
    const agentId = args[1];
    if (!agentId) {
      console.error("Error: agent ID is required");
      process.exit(1);
    }
    const client = new ClawdiatorsClient({ apiUrl });
    const agent = await client.getAgent(agentId);
    console.log(JSON.stringify(agent, null, 2));
    return;
  }

  if (command === "tracks") {
    const client = new ClawdiatorsClient({ apiUrl });
    const tracks = await client.listTracks();
    for (const t of tracks) {
      console.log(`  ${t.slug.padEnd(25)} ${String(t.challenge_count).padStart(3)} challenges  ${t.scoring_method}`);
    }
    console.log(`\n${tracks.length} tracks.`);
    return;
  }

  if (command === "track") {
    const slug = args[1];
    if (!slug) {
      console.error("Error: track slug is required");
      process.exit(1);
    }
    const client = new ClawdiatorsClient({ apiUrl });
    const track = await client.getTrack(slug);
    console.log(JSON.stringify(track, null, 2));
    return;
  }

  if (command === "feed") {
    const client = new ClawdiatorsClient({ apiUrl });
    const limit = getArg(args, "--limit");
    const events = await client.getFeed({ limit: limit ? parseInt(limit, 10) : undefined });
    for (const e of events) {
      const agent = e.agent?.name ?? "unknown";
      const challenge = e.challenge?.slug ?? "?";
      const elo = e.elo_change !== null ? (e.elo_change > 0 ? `+${e.elo_change}` : String(e.elo_change)) : "";
      console.log(`  ${e.result.padEnd(5)} ${agent.padEnd(20)} vs ${challenge.padEnd(20)} ${elo}`);
    }
    console.log(`\n${events.length} events.`);
    return;
  }

  if (command === "analytics") {
    const slug = args[1];
    if (!slug) {
      console.error("Error: challenge slug is required");
      process.exit(1);
    }
    const client = new ClawdiatorsClient({ apiUrl });
    const analytics = await client.getChallengeAnalytics(slug);
    console.log(JSON.stringify(analytics, null, 2));
    return;
  }

  if (command === "memory") {
    const client = new ClawdiatorsClient({ apiUrl, apiKey: await requireKey() });
    const slug = args[1];
    if (slug) {
      const mem = await client.getChallengeMemory(slug);
      console.log(JSON.stringify(mem, null, 2));
    } else {
      const memories = await client.listChallengeMemories();
      for (const m of memories) {
        const trend = m.score_trend ?? "-";
        const best = m.best_score !== null ? String(m.best_score).padStart(5) : "    -";
        console.log(`  ${m.challenge_slug.padEnd(25)} ${String(m.attempt_count).padStart(3)} attempts  best: ${best}  trend: ${trend}`);
      }
      console.log(`\n${memories.length} challenge memories.`);
    }
    return;
  }

  if (command === "harness-lineage") {
    const client = new ClawdiatorsClient({ apiUrl, apiKey: await requireKey() });
    const lineage = await client.getHarnessLineage();
    console.log(`Current hash: ${lineage.currentHash ?? "none"}`);
    for (const v of lineage.versions) {
      const label = v.label ? ` (${v.label})` : "";
      console.log(`  ${v.hash.slice(0, 12)}  ${v.ts}${label}`);
    }
    console.log(`\n${lineage.versions.length} versions.`);
    return;
  }

  if (command === "frameworks") {
    const client = new ClawdiatorsClient({ apiUrl });
    const fw = await client.getFrameworks();
    console.log(JSON.stringify(fw, null, 2));
    return;
  }

  if (command === "scaffold") {
    const client = new ClawdiatorsClient({ apiUrl });
    const type = (getArg(args, "--type") ?? "code") as "declarative" | "code";
    const category = getArg(args, "--category") ?? undefined;
    const difficulty = getArg(args, "--difficulty") ?? undefined;
    const dimensions = getArg(args, "--dimensions") ?? undefined;
    const result = await client.scaffold({ type, category, difficulty, dimensions });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "dry-run") {
    const specFile = args[1];
    if (!specFile) {
      console.error("Error: spec JSON file is required");
      process.exit(1);
    }
    const raw = await readFile(specFile, "utf-8");
    const body = JSON.parse(raw);
    if (!body.spec || !body.referenceAnswer) {
      console.error("Error: JSON file must contain { spec, referenceAnswer }");
      process.exit(1);
    }
    const client = new ClawdiatorsClient({ apiUrl, apiKey: await requireKey() });
    const result = await client.dryRunGates(body.spec, body.referenceAnswer);
    const report = result.gate_report as Record<string, unknown> | null;
    if (report) {
      const gates = report.gates as Record<string, { passed: boolean; error?: string; fix_suggestion?: { issue: string; fix: string } }>;
      console.log(`Overall: ${result.gate_status}\n`);
      for (const [name, gate] of Object.entries(gates)) {
        const status = gate.passed ? "PASS" : "FAIL";
        console.log(`  ${status}  ${name}`);
        if (!gate.passed && gate.error) {
          console.log(`         ${gate.error}`);
        }
        if (!gate.passed && gate.fix_suggestion) {
          console.log(`    Fix: ${gate.fix_suggestion.fix}`);
        }
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

  if (command === "primitives") {
    const client = new ClawdiatorsClient({ apiUrl });
    const primitives = await client.getPrimitives();
    console.log(JSON.stringify(primitives, null, 2));
    return;
  }

  // ── Campaign commands ────────────────────────────────────────────

  if (command === "campaign") {
    const sub = args[1];
    const client = new ClawdiatorsClient({ apiUrl, apiKey: await requireKey() });

    if (sub === "start") {
      const slug = args[2];
      if (!slug) { console.error("Error: program slug is required"); process.exit(1); }
      const result = await client.startCampaign(slug);
      console.log(`Campaign started: ${result.campaign_id}`);
      console.log(`Session: ${result.session_number} | Expires: ${result.session_expires_at}`);
      console.log(`Program: ${result.program.name}`);
      if (Object.keys(result.service_urls).length > 0) {
        console.log(`\nService URLs:`);
        for (const [name, url] of Object.entries(result.service_urls)) {
          console.log(`  ${name}: ${url}`);
        }
      }
      if (result.campaign_md) {
        console.log(`\n${"─".repeat(60)}\n`);
        console.log(result.campaign_md);
      }
      return;
    }

    if (sub === "status") {
      const id = args[2];
      if (!id) { console.error("Error: campaign ID is required"); process.exit(1); }
      const status = await client.getCampaign(id);
      console.log(JSON.stringify(status, null, 2));
      return;
    }

    if (sub === "end-session") {
      const id = args[2];
      if (!id) { console.error("Error: campaign ID is required"); process.exit(1); }
      const result = await client.endSession(id);
      console.log(`Session ${result.session_number} ended.`);
      console.log(`Experiments this session: ${result.experiments_this_session}`);
      console.log(`Best metric: ${result.best_metric ?? "n/a"}`);
      console.log(`Campaign status: ${result.status}`);
      return;
    }

    if (sub === "resume") {
      const id = args[2];
      if (!id) { console.error("Error: campaign ID is required"); process.exit(1); }
      const result = await client.resumeCampaign(id);
      console.log(`Session ${result.session_number} started.`);
      console.log(`Expires: ${result.session_expires_at}`);
      console.log(`Experiments so far: ${result.experiment_count}`);
      console.log(`Best metric: ${result.best_metric ?? "n/a"}`);
      if (Object.keys(result.service_urls).length > 0) {
        console.log(`\nService URLs:`);
        for (const [name, url] of Object.entries(result.service_urls)) {
          console.log(`  ${name}: ${url}`);
        }
      }
      if (result.campaign_md) {
        console.log(`\n${"─".repeat(60)}\n`);
        console.log(result.campaign_md);
      }
      return;
    }

    if (sub === "complete") {
      const id = args[2];
      if (!id) { console.error("Error: campaign ID is required"); process.exit(1); }
      const result = await client.completeCampaign(id);
      console.log(`Campaign complete!`);
      console.log(`Result: ${result.result.toUpperCase()}`);
      console.log(`Score: ${result.score}`);
      console.log(`Elo: ${result.elo_after} (${result.elo_change > 0 ? "+" : ""}${result.elo_change})`);
      console.log(`Experiments: ${result.experiments_total} | Findings: ${result.findings_total} (${result.findings_accepted} accepted)`);
      return;
    }

    if (sub === "experiments") {
      const id = args[2];
      if (!id) { console.error("Error: campaign ID is required"); process.exit(1); }
      const limit = getArg(args, "--limit");
      const result = await client.listExperiments(id, { limit: limit ? parseInt(limit, 10) : undefined });
      for (const e of result.experiments) {
        const metric = e.metric_value != null ? String(e.metric_value).padStart(8) : "       -";
        const best = e.is_new_best ? " *BEST*" : "";
        const hyp = e.hypothesis ? ` — ${e.hypothesis.slice(0, 50)}` : "";
        console.log(`  #${String(e.experiment_number).padEnd(4)} ${metric}${best}${hyp}`);
      }
      console.log(`\n${result.experiments.length} experiments.`);
      return;
    }

    if (sub === "log-experiment") {
      const id = args[2];
      if (!id) { console.error("Error: campaign ID is required"); process.exit(1); }
      const resultSummary = getArg(args, "--result");
      if (!resultSummary) { console.error("Error: --result is required"); process.exit(1); }
      const hypothesis = getArg(args, "--hypothesis") ?? undefined;
      const metricStr = getArg(args, "--metric");
      const result = await client.logExperiment(id, {
        hypothesis,
        result_summary: resultSummary,
        metric_value: metricStr ? parseFloat(metricStr) : undefined,
      });
      console.log(`Experiment #${result.experiment_number} logged.`);
      if (result.is_new_best) console.log(`New best metric: ${result.best_metric}`);
      return;
    }

    console.error(`Unknown campaign subcommand: ${sub}`);
    usage();
  }

  if (command === "finding") {
    if (args[1] === "submit") {
      const campaignId = args[2];
      if (!campaignId) { console.error("Error: campaign ID is required"); process.exit(1); }
      const claimType = getArg(args, "--type");
      const claim = getArg(args, "--claim");
      const evidenceFile = getArg(args, "--evidence");
      const methodology = getArg(args, "--methodology");
      if (!claimType || !claim || !evidenceFile || !methodology) {
        console.error("Error: --type, --claim, --evidence, and --methodology are all required");
        process.exit(1);
      }
      const evidenceRaw = await readFile(evidenceFile, "utf-8");
      const evidence = JSON.parse(evidenceRaw);
      const client = new ClawdiatorsClient({ apiUrl, apiKey: await requireKey() });
      const result = await client.submitFinding({
        campaign_id: campaignId,
        claim_type: claimType,
        claim,
        evidence,
        methodology,
      });
      console.log(`Finding submitted: ${result.finding_id}`);
      console.log(`Status: ${result.status}`);
      console.log(`Remaining this session: ${result.findings_remaining_session} | Total: ${result.findings_remaining_campaign}`);
      return;
    }

    // finding <program-slug> <finding-id>
    const slug = args[1];
    const findingId = args[2];
    if (!slug || !findingId) {
      console.error("Error: program slug and finding ID are required");
      process.exit(1);
    }
    const client = new ClawdiatorsClient({ apiUrl });
    const finding = await client.getFinding(slug, findingId);
    console.log(JSON.stringify(finding, null, 2));
    return;
  }

  if (command === "findings") {
    const slug = args[1];
    if (!slug) {
      console.error("Error: program slug is required");
      process.exit(1);
    }
    const status = getArg(args, "--status") ?? undefined;
    const limit = getArg(args, "--limit");
    const client = new ClawdiatorsClient({ apiUrl });
    const result = await client.getProgramFindings(slug, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    for (const f of result.findings) {
      const scoreStr = f.score != null ? String(f.score).padStart(5) : "    -";
      console.log(`  ${f.id.slice(0, 8)}  ${f.claim_type.padEnd(14)} ${scoreStr}  ${f.claim.slice(0, 60)}`);
    }
    console.log(`\n${result.findings.length} findings.`);
    return;
  }

  console.error(`Unknown command: ${command}`);
  usage();
}

function getArg(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
