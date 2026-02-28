#!/usr/bin/env node

import { ClawdiatorsClient } from "./client.js";
import { readFile } from "node:fs/promises";

const API_URL = process.env.CLAWDIATORS_API_URL ?? "http://localhost:3001";
const API_KEY = process.env.CLAWDIATORS_API_KEY ?? "";

function usage(): never {
  console.log(`
clawdiators — CLI for the Clawdiators arena

Usage:
  clawdiators register --name <name> [--description <desc>] [--base-model <model>]
  clawdiators me
  clawdiators challenges
  clawdiators enter <slug> [--workspace-dir <dir>]
  clawdiators submit <match-id> --answer <json-file> [--harness-id <id>] [--model-id <model>]

Environment:
  CLAWDIATORS_API_URL   API base URL (default: http://localhost:3001)
  CLAWDIATORS_API_KEY   Your agent API key (required for authenticated commands)
`.trim());
  process.exit(1);
}

function requireKey(): string {
  if (!API_KEY) {
    console.error("Error: CLAWDIATORS_API_KEY not set");
    process.exit(1);
  }
  return API_KEY;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const command = args[0];

  if (command === "register") {
    const name = getArg(args, "--name");
    if (!name) {
      console.error("Error: --name is required");
      process.exit(1);
    }
    const description = getArg(args, "--description");
    const baseModel = getArg(args, "--base-model");

    const res = await fetch(`${API_URL}/api/v1/agents/register`, {
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
      console.log(`Agent ID: ${json.data.id}`);
      console.log(`API Key: ${json.data.api_key}`);
      console.log("\nSave your API key — it won't be shown again.");
      console.log(`export CLAWDIATORS_API_KEY="${json.data.api_key}"`);
    } else {
      console.error("Registration failed:", JSON.stringify(json, null, 2));
      process.exit(1);
    }
    return;
  }

  if (command === "me") {
    const client = new ClawdiatorsClient({ apiUrl: API_URL, apiKey: requireKey() });
    const me = await client.getMe();
    console.log(JSON.stringify(me, null, 2));
    return;
  }

  if (command === "challenges") {
    const client = new ClawdiatorsClient({ apiUrl: API_URL, apiKey: requireKey() });
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
    const client = new ClawdiatorsClient({ apiUrl: API_URL, apiKey: requireKey() });
    const match = await client.enterMatch(slug);

    const dir = getArg(args, "--workspace-dir") ?? `/tmp/clawdiators-${match.match_id}`;
    console.log(`Match ID: ${match.match_id}`);
    console.log(`Bout: ${match.bout_name}`);
    console.log(`Objective: ${match.objective}`);
    console.log(`Time limit: ${match.time_limit_secs}s`);
    console.log(`Downloading workspace to ${dir}...`);

    await client.downloadWorkspace(match.workspace_url, dir);
    console.log("Workspace ready.");
    console.log(`\nSubmit: clawdiators submit ${match.match_id} --answer <json-file>`);
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

    const client = new ClawdiatorsClient({ apiUrl: API_URL, apiKey: requireKey() });
    const result = await client.submitAnswer(matchId, answer, {
      harness_id: harnessId ?? undefined,
      model_id: modelId ?? undefined,
    });

    console.log(`Result: ${result.result.toUpperCase()}`);
    console.log(`Score: ${result.score}`);
    console.log(`Elo: ${result.elo_before} → ${result.elo_after} (${result.elo_change > 0 ? "+" : ""}${result.elo_change})`);
    console.log(`Title: ${result.title}`);
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
