#!/usr/bin/env tsx
/**
 * Encrypt/decrypt challenge scoring files (scorer.ts, data.ts).
 *
 * Usage:
 *   SCORING_KEY=<64-char-hex> tsx scoring-crypto.ts encrypt
 *   SCORING_KEY=<64-char-hex> tsx scoring-crypto.ts decrypt
 *   SCORING_KEY=<64-char-hex> tsx scoring-crypto.ts status
 *   SCORING_KEY=<64-char-hex> tsx scoring-crypto.ts stubs
 *
 * Format: [16-byte IV][16-byte auth tag][ciphertext]  (AES-256-GCM)
 */

import { execSync } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;
const SCORING_FILES = ["scorer.ts", "data.ts"];
const SKIP_DIRS = new Set(["_template", "community", "primitives"]);

const challengesDir = resolve(import.meta.dirname ?? __dirname, "../src/challenges");

function getKey(required: boolean = true): Buffer | null {
  const hex = process.env.SCORING_KEY;
  if (!hex || hex.length !== 64) {
    if (!required) return null;
    console.error("ERROR: SCORING_KEY env var must be a 64-character hex string (32 bytes).");
    process.exit(1);
  }
  return Buffer.from(hex, "hex");
}

function encrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(blob: Buffer, key: Buffer): Buffer {
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

const STUB_EXTS = [".d.ts", ".js"] as const;

/** Generate a JS stub from a .d.ts file. Only exports functions and consts — types are erased. */
function generateJsStub(dtsContent: string, baseName: string, sourceHash: string): string {
  const lines: string[] = [
    `// @source-hash ${sourceHash}`,
    "// Auto-generated stub \u2014 contains NO secrets.",
    "// Real implementation lives in encrypted .ts files.",
    "// Regenerate with: pnpm scoring:stubs",
    "",
  ];

  for (const line of dtsContent.split("\n")) {
    // export declare function NAME(…): RetType;
    const funcMatch = line.match(/^export declare function (\w+)\(/);
    if (funcMatch) {
      const name = funcMatch[1];
      let returnVal: string;
      if (baseName === "scorer") {
        returnVal = "{ breakdown: { total: 0 } }";
      } else if (/generate.*data/i.test(name) || name === "generateData") {
        returnVal = '{ objective: "", groundTruth: {} }';
      } else {
        returnVal = "null";
      }
      lines.push(`export function ${name}() { return ${returnVal}; }`);
      continue;
    }

    // export declare const NAME: Type;
    const constMatch = line.match(/^export declare const (\w+)/);
    if (constMatch) {
      lines.push(`export const ${constMatch[1]} = [];`);
      continue;
    }
  }

  lines.push("");
  return lines.join("\n");
}

/** List challenge directories that should have encrypted scoring files. */
function listChallengeDirs(): string[] {
  return readdirSync(challengesDir)
    .filter((name) => {
      if (SKIP_DIRS.has(name)) return false;
      const full = join(challengesDir, name);
      return statSync(full).isDirectory();
    })
    .sort();
}

type FileStatus = "encrypted" | "decrypted" | "both-synced" | "both-out-of-sync" | "missing";

function getFileStatus(dir: string, file: string, key: Buffer): FileStatus {
  const plainPath = join(challengesDir, dir, file);
  const encPath = `${plainPath}.enc`;
  const hasPlain = existsSync(plainPath);
  const hasEnc = existsSync(encPath);

  if (!hasPlain && !hasEnc) return "missing";
  if (hasPlain && !hasEnc) return "decrypted";
  if (!hasPlain && hasEnc) return "encrypted";

  // Both exist — check if they match
  const plainContent = readFileSync(plainPath);
  const encContent = readFileSync(encPath);
  try {
    const decrypted = decrypt(encContent, key);
    return sha256(decrypted) === sha256(plainContent) ? "both-synced" : "both-out-of-sync";
  } catch {
    return "both-out-of-sync";
  }
}

function doEncrypt() {
  const key = getKey();
  const dirs = listChallengeDirs();
  let count = 0;

  for (const dir of dirs) {
    for (const file of SCORING_FILES) {
      const plainPath = join(challengesDir, dir, file);
      if (!existsSync(plainPath)) continue;

      const encPath = `${plainPath}.enc`;
      const plainContent = readFileSync(plainPath);

      // Skip if .enc exists and matches
      if (existsSync(encPath)) {
        try {
          const existing = decrypt(readFileSync(encPath), key);
          if (sha256(existing) === sha256(plainContent)) {
            continue; // already in sync
          }
        } catch {
          // re-encrypt
        }
      }

      const blob = encrypt(plainContent, key);
      writeFileSync(encPath, blob);
      count++;
      console.log(`  encrypted: ${dir}/${file}`);
    }
  }

  console.log(`\nEncrypted ${count} file(s).`);

  // Regenerate stubs to stay in sync with plaintext
  console.log("\nRegenerating stubs...");
  doGenerateStubs();
}

function doDecrypt() {
  const key = getKey(false);
  if (!key) {
    console.log("SKIP: SCORING_KEY not set, skipping decryption.");
    return;
  }
  const dirs = listChallengeDirs();
  let count = 0;

  for (const dir of dirs) {
    for (const file of SCORING_FILES) {
      const encPath = join(challengesDir, dir, `${file}.enc`);
      if (!existsSync(encPath)) continue;

      const plainPath = join(challengesDir, dir, file);
      const encContent = readFileSync(encPath);

      let decrypted: Buffer;
      try {
        decrypted = decrypt(encContent, key);
      } catch (err) {
        console.error(`  FAILED: ${dir}/${file}.enc — bad key or corrupted file`);
        continue;
      }

      // Skip if plaintext already matches
      if (existsSync(plainPath)) {
        const existing = readFileSync(plainPath);
        if (sha256(existing) === sha256(decrypted)) {
          continue;
        }
      }

      writeFileSync(plainPath, decrypted);
      count++;
      console.log(`  decrypted: ${dir}/${file}`);
    }
  }

  // Remove .js stubs that would shadow the real .ts files at runtime.
  // When importing "./data.js", tsx resolves to the literal data.js if it
  // exists — the .ts file is only used as fallback when .js is absent.
  // (.d.ts stubs are harmless: tsc always prefers .ts over .d.ts)
  let removed = 0;
  for (const dir of dirs) {
    for (const file of SCORING_FILES) {
      const plainPath = join(challengesDir, dir, file);
      if (!existsSync(plainPath)) continue; // no .ts → keep the .js stub

      const baseName = file.replace(".ts", "");
      const jsStubPath = join(challengesDir, dir, `${baseName}.js`);
      if (existsSync(jsStubPath)) {
        rmSync(jsStubPath);
        removed++;
      }
    }
  }
  if (removed > 0) console.log(`Removed ${removed} .js stub(s) (real .ts files present).`);

  console.log(`\nDecrypted ${count} file(s).`);
}

function doGenerateStubs() {
  const key = getKey();
  if (!key) return; // getKey() already exits on missing key

  // Ensure plaintext files are up to date (idempotent)
  doDecrypt();

  const dirs = listChallengeDirs();
  const apiRoot = resolve(challengesDir, "../..");
  const tmpDir = mkdtempSync(join(tmpdir(), "clawdiators-stubs-"));

  try {
    console.log("Running tsc --emitDeclarationOnly...");
    execSync(
      `npx tsc --project tsconfig.json --emitDeclarationOnly --outDir "${tmpDir}"`,
      { cwd: apiRoot, stdio: "pipe" },
    );
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() || "";
    rmSync(tmpDir, { recursive: true, force: true });
    console.error(`ERROR: tsc --emitDeclarationOnly failed:\n${stderr}`);
    process.exit(1);
  }

  let count = 0;
  for (const dir of dirs) {
    for (const file of SCORING_FILES) {
      const baseName = file.replace(".ts", "");
      const dtsSource = join(tmpDir, "challenges", dir, `${baseName}.d.ts`);
      if (!existsSync(dtsSource)) continue;

      const plainPath = join(challengesDir, dir, file);
      if (!existsSync(plainPath)) continue;

      const sourceHash = sha256(readFileSync(plainPath));

      // Read generated .d.ts, strip sourceMappingURL, prepend source hash
      let dtsContent = readFileSync(dtsSource, "utf-8");
      dtsContent = dtsContent.replace(/\/\/# sourceMappingURL=.*\n?/g, "").trimEnd();
      dtsContent = `// @source-hash ${sourceHash}\n${dtsContent}\n`;

      const dtsTarget = join(challengesDir, dir, `${baseName}.d.ts`);
      writeFileSync(dtsTarget, dtsContent);

      // Generate .js stub from .d.ts exports
      const jsContent = generateJsStub(dtsContent, baseName, sourceHash);
      const jsTarget = join(challengesDir, dir, `${baseName}.js`);
      writeFileSync(jsTarget, jsContent);

      count++;
      console.log(`  stub: ${dir}/${baseName}.d.ts + .js`);
    }
  }

  rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\nGenerated ${count * 2} stub file(s) across ${count} modules.`);
}

function doStatus() {
  const key = getKey(false);
  if (!key) {
    console.log("SKIP: SCORING_KEY not set, cannot check scoring file status.");
    return;
  }
  const dirs = listChallengeDirs();

  const symbols: Record<FileStatus, string> = {
    "both-synced": "OK",
    encrypted: "ENC-ONLY",
    decrypted: "PLAIN-ONLY",
    "both-out-of-sync": "OUT-OF-SYNC",
    missing: "MISSING",
  };

  let issues = 0;

  for (const dir of dirs) {
    for (const file of SCORING_FILES) {
      const status = getFileStatus(dir, file, key);
      const label = symbols[status];
      const prefix = status === "both-synced" ? "  " : "! ";
      if (status !== "both-synced") issues++;
      console.log(`${prefix}[${label.padEnd(12)}] ${dir}/${file}`);
    }
  }

  // Check stub freshness
  console.log("\nStub status:");
  for (const dir of dirs) {
    for (const file of SCORING_FILES) {
      const baseName = file.replace(".ts", "");
      const plainPath = join(challengesDir, dir, file);
      if (!existsSync(plainPath)) continue;

      const sourceHash = sha256(readFileSync(plainPath));

      for (const ext of STUB_EXTS) {
        // .js stubs are intentionally removed when real .ts files exist
        // (tsx resolves literal .js before .ts, so stubs would shadow real code)
        if (ext === ".js" && existsSync(plainPath)) continue;

        const stubPath = join(challengesDir, dir, `${baseName}${ext}`);
        if (!existsSync(stubPath)) {
          console.log(`! [STUBS-MISSING] ${dir}/${baseName}${ext}`);
          issues++;
          continue;
        }

        const stubContent = readFileSync(stubPath, "utf-8");
        const hashMatch = stubContent.match(/^\/\/ @source-hash (\S+)/);
        if (!hashMatch || hashMatch[1] !== sourceHash) {
          console.log(`! [STUBS-STALE  ] ${dir}/${baseName}${ext}`);
          issues++;
        }
      }
    }
  }

  const summary = issues === 0
    ? "All files and stubs in sync."
    : `${issues} file(s) need attention.`;
  console.log(`\n${summary}`);
  process.exit(issues > 0 ? 1 : 0);
}

const command = process.argv[2];

switch (command) {
  case "encrypt":
    doEncrypt();
    break;
  case "decrypt":
    doDecrypt();
    break;
  case "status":
    doStatus();
    break;
  case "stubs":
    doGenerateStubs();
    break;
  default:
    console.error("Usage: scoring-crypto.ts <encrypt|decrypt|status|stubs>");
    console.error("  Requires SCORING_KEY env var (64-char hex, 32 bytes).");
    process.exit(1);
}
