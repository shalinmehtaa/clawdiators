import { describe, it, expect } from "vitest";
import { computeChainHash, validateHashChain } from "../src/services/verification.js";
import type { LLMCallRecord } from "@clawdiators/shared";

// The harness fingerprint system uses SHA-256 hashes (64-char lowercase hex).
// computeChainHash is the core hash function used to produce both the chain hash
// and conceptually equivalent to the system_prompt_hash / tool_definitions_hash
// stored on matches and looked up in the harness registry.

const HASH_RE = /^[0-9a-f]{64}$/;

function makeCall(seq: number): LLMCallRecord {
  return {
    seq,
    ts: new Date().toISOString(),
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    input_tokens: 100,
    output_tokens: 50,
    duration_ms: 400,
    status_code: 200,
    request_hash: `req-${seq}`,
    response_hash: `res-${seq}`,
    token_extraction: "exact",
  };
}

describe("computeChainHash()", () => {
  it("produces a 64-character lowercase hex string", () => {
    const hash = computeChainHash("init-nonce", 1, makeCall(1));
    expect(hash).toMatch(HASH_RE);
  });

  it("is deterministic — same inputs produce the same hash", () => {
    const call = makeCall(1);
    expect(computeChainHash("nonce", 1, call)).toBe(computeChainHash("nonce", 1, call));
  });

  it("changes when the nonce changes", () => {
    const call = makeCall(1);
    expect(computeChainHash("nonce-A", 1, call)).not.toBe(computeChainHash("nonce-B", 1, call));
  });

  it("changes when the seq number changes", () => {
    const call = makeCall(1);
    expect(computeChainHash("nonce", 1, call)).not.toBe(computeChainHash("nonce", 2, call));
  });

  it("changes when the call record changes", () => {
    expect(computeChainHash("nonce", 1, makeCall(1))).not.toBe(
      computeChainHash("nonce", 1, makeCall(2)),
    );
  });
});

describe("validateHashChain()", () => {
  it("validates a single-call chain", () => {
    const calls = [makeCall(1)];
    const { valid } = validateHashChain("nonce", calls);
    expect(valid).toBe(true);
  });

  it("validates a multi-call chain", () => {
    const calls = [makeCall(1), makeCall(2), makeCall(3)];
    const { valid } = validateHashChain("nonce", calls);
    expect(valid).toBe(true);
  });

  it("returns a 64-char hex computedHead", () => {
    const { computedHead } = validateHashChain("nonce", [makeCall(1)]);
    expect(computedHead).toMatch(HASH_RE);
  });

  it("produces a different computedHead when a call record is tampered", () => {
    // validateHashChain checks seq monotonicity (valid=true) but also returns a
    // computedHead that changes if any call field is altered. verifyAttestation then
    // compares that computedHead against the stored chain_head_hash to detect tampering.
    const calls = [makeCall(1), makeCall(2)];
    const { computedHead: original } = validateHashChain("nonce", calls);

    const tampered = [...calls];
    tampered[1] = { ...tampered[1], request_hash: "tampered" };
    const { computedHead: alteredHead } = validateHashChain("nonce", tampered);

    expect(alteredHead).not.toBe(original);
  });

  it("empty call list returns valid=true with the nonce itself as seed", () => {
    const { valid } = validateHashChain("nonce", []);
    expect(valid).toBe(true);
  });
});
