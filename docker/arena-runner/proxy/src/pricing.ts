/**
 * Model pricing table (USD per 1M tokens).
 * Matched by substring of the reported model name (case-insensitive), first match wins.
 *
 * Source of truth: GET /api/v1/pricing/current on the Clawdiators API.
 * The table below is the fallback used when the API is unreachable at startup.
 */

interface ModelPricing {
  input_per_1m: number;
  output_per_1m: number;
}

const FALLBACK_PRICING_TABLE: Array<{ pattern: string; pricing: ModelPricing }> = [
  { pattern: "claude-opus-4",    pricing: { input_per_1m: 15.0,  output_per_1m: 75.0  } },
  { pattern: "claude-sonnet-4",  pricing: { input_per_1m: 3.0,   output_per_1m: 15.0  } },
  { pattern: "claude-haiku-4",   pricing: { input_per_1m: 0.8,   output_per_1m: 4.0   } },
  { pattern: "claude-opus-3",    pricing: { input_per_1m: 15.0,  output_per_1m: 75.0  } },
  { pattern: "claude-sonnet-3",  pricing: { input_per_1m: 3.0,   output_per_1m: 15.0  } },
  { pattern: "claude-haiku-3",   pricing: { input_per_1m: 0.25,  output_per_1m: 1.25  } },
  { pattern: "gpt-4o-mini",      pricing: { input_per_1m: 0.15,  output_per_1m: 0.6   } },
  { pattern: "gpt-4o",           pricing: { input_per_1m: 2.5,   output_per_1m: 10.0  } },
  { pattern: "gpt-4-turbo",      pricing: { input_per_1m: 10.0,  output_per_1m: 30.0  } },
  { pattern: "gpt-4",            pricing: { input_per_1m: 30.0,  output_per_1m: 60.0  } },
  { pattern: "gpt-3.5",          pricing: { input_per_1m: 0.5,   output_per_1m: 1.5   } },
  { pattern: "gemini-2.5",       pricing: { input_per_1m: 1.25,  output_per_1m: 10.0  } },
  { pattern: "gemini-2.0",       pricing: { input_per_1m: 0.0,   output_per_1m: 0.0   } },
  { pattern: "gemini-1.5-pro",   pricing: { input_per_1m: 1.25,  output_per_1m: 5.0   } },
  { pattern: "gemini-1.5-flash", pricing: { input_per_1m: 0.075, output_per_1m: 0.3   } },
];

const FALLBACK_PRICING_VERSION = "2025-03";

// Live state — overwritten by loadPricingFromAPI if successful
let activePricingTable = FALLBACK_PRICING_TABLE;
let activePricingVersion = FALLBACK_PRICING_VERSION;

/**
 * Fetch the live pricing table from the Clawdiators API.
 * Falls back to the hardcoded table if the request fails or times out.
 */
export async function loadPricingFromAPI(apiBase: string): Promise<void> {
  const url = `${apiBase}/api/v1/pricing/current`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { ok: boolean; data: { version: string; pricing: Array<{ pattern: string; input_per_1m: number; output_per_1m: number }> } };
    if (!json.ok || !Array.isArray(json.data?.pricing)) throw new Error("Unexpected response shape");
    activePricingTable = json.data.pricing.map((row) => ({
      pattern: row.pattern,
      pricing: { input_per_1m: row.input_per_1m, output_per_1m: row.output_per_1m },
    }));
    activePricingVersion = json.data.version;
    console.log(`[pricing] Loaded ${activePricingTable.length} rows from API (version ${activePricingVersion})`);
  } catch (err) {
    console.warn(`[pricing] Failed to load from ${url}: ${err}. Using fallback table.`);
  }
}

function lookupPricing(model: string): ModelPricing | null {
  const lower = model.toLowerCase();
  for (const entry of activePricingTable) {
    if (lower.includes(entry.pattern)) return entry.pricing;
  }
  return null;
}

export function computeCost(calls: Array<{ model: string; input_tokens: number; output_tokens: number }>): {
  total_usd: number;
  by_model: Record<string, number>;
  pricing_version: string;
} {
  const by_model: Record<string, number> = {};
  let total_usd = 0;

  for (const call of calls) {
    const pricing = lookupPricing(call.model);
    if (!pricing) continue;
    const cost = (call.input_tokens * pricing.input_per_1m + call.output_tokens * pricing.output_per_1m) / 1_000_000;
    by_model[call.model] = (by_model[call.model] ?? 0) + cost;
    total_usd += cost;
  }

  for (const key of Object.keys(by_model)) {
    by_model[key] = Math.round(by_model[key] * 1_000_000) / 1_000_000;
  }

  return {
    total_usd: Math.round(total_usd * 1_000_000) / 1_000_000,
    by_model,
    pricing_version: activePricingVersion,
  };
}
