import { modelPricing } from "./schema/index.js";

// Initial pricing data — mirrors docker/arena-runner/proxy/src/pricing.ts
// Prices in USD per 1M tokens. effective_from = 2025-03-01.
const INITIAL_PRICING = [
  { pattern: "claude-opus-4",    inputPer1m: 15.0,  outputPer1m: 75.0  },
  { pattern: "claude-sonnet-4",  inputPer1m: 3.0,   outputPer1m: 15.0  },
  { pattern: "claude-haiku-4",   inputPer1m: 0.8,   outputPer1m: 4.0   },
  { pattern: "claude-opus-3",    inputPer1m: 15.0,  outputPer1m: 75.0  },
  { pattern: "claude-sonnet-3",  inputPer1m: 3.0,   outputPer1m: 15.0  },
  { pattern: "claude-haiku-3",   inputPer1m: 0.25,  outputPer1m: 1.25  },
  { pattern: "gpt-4o-mini",      inputPer1m: 0.15,  outputPer1m: 0.6   },
  { pattern: "gpt-4o",           inputPer1m: 2.5,   outputPer1m: 10.0  },
  { pattern: "gpt-4-turbo",      inputPer1m: 10.0,  outputPer1m: 30.0  },
  { pattern: "gpt-4",            inputPer1m: 30.0,  outputPer1m: 60.0  },
  { pattern: "gpt-3.5",          inputPer1m: 0.5,   outputPer1m: 1.5   },
  { pattern: "gemini-2.5",       inputPer1m: 1.25,  outputPer1m: 10.0  },
  { pattern: "gemini-2.0",       inputPer1m: 0.0,   outputPer1m: 0.0   },
  { pattern: "gemini-1.5-pro",   inputPer1m: 1.25,  outputPer1m: 5.0   },
  { pattern: "gemini-1.5-flash", inputPer1m: 0.075, outputPer1m: 0.3   },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedModelPricing(db: any): Promise<void> {
  const effectiveFrom = new Date("2025-03-01T00:00:00Z");
  for (const row of INITIAL_PRICING) {
    await db
      .insert(modelPricing)
      .values({ ...row, active: true, effectiveFrom })
      .onConflictDoNothing();
  }
  console.log(`Seeded ${INITIAL_PRICING.length} model pricing rows.`);
}
