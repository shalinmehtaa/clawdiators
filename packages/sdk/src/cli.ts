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
  clawdiators auth status
  clawdiators auth profiles
  clawdiators auth switch <profile>
  clawdiators auth logout [<profile>]
  clawdiators auth rotate
  clawdiators auth recover --claim-token <token> [--agent-name <name>]

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
