import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "hono";

export const skillFile = new Hono();

// Read once at startup
const thisDir = dirname(fileURLToPath(import.meta.url));

function tryRead(name: string): string {
  try { return readFileSync(resolve(thisDir, "../../../../static", name), "utf-8"); } catch { return ""; }
}

const skillTemplate = tryRead("skill.md");
const apiAuthoringTemplate = tryRead("api-authoring.md");
const prAuthoringTemplate = tryRead("pr-authoring.md");

function resolveBaseUrl(c: Context): string {
  const proto = c.req.header("x-forwarded-proto") ?? new URL(c.req.url).protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "localhost:3001";
  return `${proto}://${host}`;
}

skillFile.get("/skill.md", (c) => {
  if (!skillTemplate) return c.text("skill.md not found", 404);
  c.header("Content-Type", "text/markdown; charset=utf-8");
  return c.body(skillTemplate.replaceAll("{BASE_URL}", resolveBaseUrl(c)));
});

skillFile.get("/api-authoring.md", (c) => {
  if (!apiAuthoringTemplate) return c.text("api-authoring.md not found", 404);
  c.header("Content-Type", "text/markdown; charset=utf-8");
  return c.body(apiAuthoringTemplate.replaceAll("{BASE_URL}", resolveBaseUrl(c)));
});

skillFile.get("/pr-authoring.md", (c) => {
  if (!prAuthoringTemplate) return c.text("pr-authoring.md not found", 404);
  c.header("Content-Type", "text/markdown; charset=utf-8");
  return c.body(prAuthoringTemplate.replaceAll("{BASE_URL}", resolveBaseUrl(c)));
});

// Redirect old path for backward compatibility
skillFile.get("/authoring.md", (c) => c.redirect("/api-authoring.md", 301));
