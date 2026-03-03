/**
 * LLM-as-Judge — server-side scoring via Anthropic Messages API.
 *
 * Used by Tier 2+ code-based challenges that need subjective evaluation.
 * Runs N times (default 3) and returns the median score for robustness.
 */

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_RUNS = 3;
const MAX_JUDGE_CALLS = 10;
const RETRY_DELAY_MS = 1000;

export interface LLMJudgeOpts {
  model?: string;
  runs?: number;
  maxScore?: number;
  apiKey?: string;
}

export interface LLMJudgeResult {
  score: number;
  scores: number[];
  reasoning?: string;
  error?: string;
}

/**
 * Call an LLM to judge a response against a prompt/rubric.
 * Runs `runs` times and returns the median score.
 * Rate-limited to MAX_JUDGE_CALLS per evaluation.
 */
let callCount = 0;

export function resetJudgeCallCount(): void {
  callCount = 0;
}

export async function llmJudge(
  prompt: string,
  response: string,
  rubric: string,
  opts?: LLMJudgeOpts,
): Promise<LLMJudgeResult> {
  const model = opts?.model ?? DEFAULT_MODEL;
  const runs = Math.min(opts?.runs ?? DEFAULT_RUNS, MAX_JUDGE_CALLS);
  const maxScore = opts?.maxScore ?? 100;
  const apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return { score: 0, scores: [], error: "ANTHROPIC_API_KEY not set" };
  }

  const scores: number[] = [];
  let lastReasoning: string | undefined;

  for (let i = 0; i < runs; i++) {
    if (callCount >= MAX_JUDGE_CALLS) {
      return {
        score: scores.length > 0 ? median(scores) : 0,
        scores,
        reasoning: lastReasoning,
        error: `Rate limit reached (${MAX_JUDGE_CALLS} calls per evaluation)`,
      };
    }

    const result = await callJudgeAPI(prompt, response, rubric, model, maxScore, apiKey);
    callCount++;

    if (result.error) {
      // Retry once on failure
      const retry = await callJudgeAPI(prompt, response, rubric, model, maxScore, apiKey);
      callCount++;
      if (retry.error) {
        continue; // Skip this run
      }
      scores.push(retry.score);
      lastReasoning = retry.reasoning;
    } else {
      scores.push(result.score);
      lastReasoning = result.reasoning;
    }
  }

  if (scores.length === 0) {
    return { score: 0, scores: [], error: "All judge calls failed" };
  }

  return {
    score: median(scores),
    scores,
    reasoning: lastReasoning,
  };
}

async function callJudgeAPI(
  prompt: string,
  response: string,
  rubric: string,
  model: string,
  maxScore: number,
  apiKey: string,
): Promise<{ score: number; reasoning?: string; error?: string }> {
  const systemPrompt = `You are an expert evaluator. Score the following response on a scale of 0 to ${maxScore}.

RUBRIC:
${rubric}

Respond with a JSON object: {"score": <number>, "reasoning": "<brief explanation>"}
Only output the JSON object, nothing else.`;

  const userMessage = `PROMPT:
${prompt}

RESPONSE:
${response}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 256,
        messages: [{ role: "user", content: userMessage }],
        system: systemPrompt,
      }),
    });

    if (!res.ok) {
      return { score: 0, error: `API error: ${res.status} ${res.statusText}` };
    }

    const data = await res.json() as { content: Array<{ type: string; text: string }> };
    const text = data.content?.[0]?.text ?? "";

    // Parse JSON from response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return { score: 0, error: "Failed to parse judge response as JSON" };
    }

    const parsed = JSON.parse(match[0]);
    const score = Math.max(0, Math.min(maxScore, Number(parsed.score) || 0));
    return { score, reasoning: parsed.reasoning };
  } catch (err: any) {
    return { score: 0, error: `Judge API call failed: ${err.message}` };
  }
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/**
 * Generate a self-contained JS string that defines an `llmJudge` function
 * for use inside Docker evaluator wrapper scripts.
 *
 * The generated function uses `fetch()` and reads `ANTHROPIC_API_KEY` from env.
 */
export function generateLLMJudgeInlineScript(model: string, rubric: string): string {
  // Escape backticks and backslashes for template literal safety
  const escapedRubric = rubric.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");

  return `
// --- LLM Judge (inlined) ---
var LLM_JUDGE_MODEL = ${JSON.stringify(model)};
var LLM_JUDGE_RUBRIC = \`${escapedRubric}\`;
var LLM_JUDGE_MAX_CALLS = 10;
var llmJudgeCallCount = 0;

async function llmJudge(prompt, response, maxScore) {
  maxScore = maxScore || 100;
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { score: 0, error: "ANTHROPIC_API_KEY not set" };

  var scores = [];
  for (var i = 0; i < 3; i++) {
    if (llmJudgeCallCount >= LLM_JUDGE_MAX_CALLS) break;
    var result = await callJudgeOnce(prompt, response, maxScore, apiKey);
    llmJudgeCallCount++;
    if (result.error) {
      var retry = await callJudgeOnce(prompt, response, maxScore, apiKey);
      llmJudgeCallCount++;
      if (!retry.error) scores.push(retry.score);
    } else {
      scores.push(result.score);
    }
  }
  if (scores.length === 0) return { score: 0, error: "All judge calls failed" };
  scores.sort(function(a, b) { return a - b; });
  var mid = Math.floor(scores.length / 2);
  var medianScore = scores.length % 2 === 0
    ? Math.round((scores[mid - 1] + scores[mid]) / 2)
    : scores[mid];
  return { score: medianScore, scores: scores };
}

async function callJudgeOnce(prompt, response, maxScore, apiKey) {
  var systemPrompt = "You are an expert evaluator. Score the following response on a scale of 0 to " + maxScore + ".\\n\\nRUBRIC:\\n" + LLM_JUDGE_RUBRIC + "\\n\\nRespond with a JSON object: {\\"score\\": <number>, \\"reasoning\\": \\"<brief explanation>\\"}\\nOnly output the JSON object, nothing else.";
  var userMessage = "PROMPT:\\n" + prompt + "\\n\\nRESPONSE:\\n" + response;
  try {
    var res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: LLM_JUDGE_MODEL, max_tokens: 256, messages: [{ role: "user", content: userMessage }], system: systemPrompt }),
    });
    if (!res.ok) return { score: 0, error: "API error: " + res.status };
    var data = await res.json();
    var text = data.content && data.content[0] && data.content[0].text || "";
    var match = text.match(/\\{[\\s\\S]*\\}/);
    if (!match) return { score: 0, error: "Failed to parse judge response" };
    var parsed = JSON.parse(match[0]);
    return { score: Math.max(0, Math.min(maxScore, Number(parsed.score) || 0)) };
  } catch (err) {
    return { score: 0, error: "Judge API call failed: " + err.message };
  }
}
`;
}
