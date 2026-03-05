/**
 * The Phantom Registry — Scorer
 *
 * Scores agent submissions across 5 dimensions:
 *   correctness (25%) — Phantom identity + attack vector
 *   completeness (30%) — All compromised packages found
 *   analysis (20%)     — Attack timeline reconstruction
 *   methodology (15%)  — Investigation approach quality
 *   speed (10%)        — Time efficiency
 */

import type { ScoringInput, ScoreResult } from "../types.js";

export function scorePhantomRegistry(input: ScoringInput): ScoreResult {
  const sub = (input.submission || {}) as Record<string, unknown>;
  const gt = input.groundTruth as Record<string, unknown>;

  const correctness = scoreIdentification(sub, gt);
  const completeness = scoreCompleteness(sub, gt);
  const analysis = scoreTimeline(sub, gt);
  const methodology = scoreMethodology(sub);
  const speed = scoreSpeed(input.startedAt, input.submittedAt, 3600);

  // Gate speed and methodology on having some substance
  const hasSubstance = correctness > 0 || completeness > 0;
  const finalSpeed = hasSubstance ? speed : 0;
  const finalMethodology = hasSubstance ? methodology : 0;

  const total = Math.min(1000,
    Math.round(correctness * 250) +
    Math.round(completeness * 300) +
    Math.round(analysis * 200) +
    Math.round(finalMethodology * 150) +
    Math.round(finalSpeed * 100)
  );

  return {
    breakdown: {
      correctness: Math.round(correctness * 250),
      completeness: Math.round(completeness * 300),
      analysis: Math.round(analysis * 200),
      methodology: Math.round(finalMethodology * 150),
      speed: Math.round(finalSpeed * 100),
      total,
    },
  };
}

// ── Dimension scorers ────────────────────────────────────────────────

function scoreIdentification(sub: Record<string, unknown>, gt: Record<string, unknown>): number {
  let score = 0;

  // Phantom handle identification (50% of correctness)
  const subPhantom = String(sub.phantom_handle || "").toLowerCase().trim();
  const gtPhantom = String(gt.phantomHandle || "").toLowerCase().trim();
  if (subPhantom === gtPhantom) score += 0.5;

  // Attack vector identification (30% of correctness)
  const subVector = String(sub.attack_vector || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  const gtVector = String(gt.attackVector || "").toLowerCase().trim();
  if (subVector === gtVector) score += 0.3;

  // Compromised maintainer identification (20% of correctness)
  const subCompMaint = String(sub.compromised_maintainer || "").toLowerCase().trim();
  const gtCompMaint = String(gt.compromisedMaintainer || "").toLowerCase().trim();
  if (subCompMaint === gtCompMaint) score += 0.2;

  // Red herring penalty: if phantom_handle matches the red herring, lose 50%
  const redHerring = gt.redHerring as { handle: string } | undefined;
  if (redHerring && subPhantom === redHerring.handle.toLowerCase()) {
    score *= 0.5;
  }

  return Math.min(1, score);
}

function scoreCompleteness(sub: Record<string, unknown>, gt: Record<string, unknown>): number {
  const subPkgs = Array.isArray(sub.compromised_packages) ? sub.compromised_packages : [];
  const gtPkgs = (gt.compromisedPackages as Array<{ name: string; compromisedVersion: string }>) || [];

  if (subPkgs.length === 0 || gtPkgs.length === 0) return 0;

  let totalScore = 0;
  const maxPerPkg = 1 / gtPkgs.length;

  for (const gtPkg of gtPkgs) {
    const match = subPkgs.find((sp: unknown) => {
      if (typeof sp === "string") return sp.toLowerCase() === gtPkg.name.toLowerCase();
      if (typeof sp === "object" && sp !== null) {
        const obj = sp as Record<string, unknown>;
        return String(obj.name || obj.package || "").toLowerCase() === gtPkg.name.toLowerCase();
      }
      return false;
    });

    if (!match) continue;

    // Found the package: base credit (60%)
    totalScore += maxPerPkg * 0.6;

    // Version match bonus (40%)
    if (typeof match === "object" && match !== null) {
      const obj = match as Record<string, unknown>;
      const subVer = String(obj.compromised_version || obj.version || "");
      if (subVer === gtPkg.compromisedVersion) {
        totalScore += maxPerPkg * 0.4;
      }
    }
  }

  // Precision penalty: if agent reports more packages than exist, penalize
  const falsePositives = Math.max(0, subPkgs.length - gtPkgs.length);
  const precisionPenalty = falsePositives > 0 ? Math.min(0.3, falsePositives * 0.1) : 0;

  return Math.max(0, Math.min(1, totalScore - precisionPenalty));
}

function scoreTimeline(sub: Record<string, unknown>, gt: Record<string, unknown>): number {
  const subTimeline = Array.isArray(sub.attack_timeline) ? sub.attack_timeline : [];
  const gtTimeline = (gt.attackTimeline as Array<{ event: string; timestamp: string }>) || [];

  if (subTimeline.length === 0 || gtTimeline.length === 0) return 0;

  // Score based on event coverage and ordering
  let eventsMatched = 0;
  let orderCorrect = 0;
  let lastMatchedIdx = -1;

  for (const gtEvent of gtTimeline) {
    const gtEventLower = gtEvent.event.toLowerCase();
    const matchIdx = subTimeline.findIndex((se: unknown) => {
      if (typeof se === "string") return se.toLowerCase().includes(gtEventLower.slice(0, 30));
      if (typeof se === "object" && se !== null) {
        const obj = se as Record<string, unknown>;
        const desc = String(obj.event || obj.description || obj.action || "").toLowerCase();
        // Fuzzy match: check if key terms overlap
        const gtTerms = gtEventLower.split(/\s+/).filter(t => t.length > 3);
        const matchedTerms = gtTerms.filter(t => desc.includes(t));
        return matchedTerms.length >= Math.ceil(gtTerms.length * 0.4);
      }
      return false;
    });

    if (matchIdx >= 0) {
      eventsMatched++;
      if (matchIdx > lastMatchedIdx) {
        orderCorrect++;
      }
      lastMatchedIdx = matchIdx;
    }
  }

  const coverage = eventsMatched / gtTimeline.length;
  const orderBonus = eventsMatched > 1 ? orderCorrect / eventsMatched : (eventsMatched > 0 ? 1 : 0);

  return coverage * 0.7 + orderBonus * 0.3;
}

function scoreMethodology(sub: Record<string, unknown>): number {
  const methodology = String(sub.methodology || "");
  if (methodology.length < 50) return 0;

  let score = 0;

  // Length-based baseline
  if (methodology.length > 100) score += 0.2;
  if (methodology.length > 300) score += 0.2;
  if (methodology.length > 600) score += 0.1;

  // Evidence of systematic investigation
  const lowerMethod = methodology.toLowerCase();
  const investigationSignals = [
    "audit log", "postinstall", "maintainer", "ip address", "download",
    "version", "timeline", "token", "credential", "suspicious",
  ];
  const signalHits = investigationSignals.filter(s => lowerMethod.includes(s)).length;
  score += Math.min(0.3, signalHits * 0.05);

  // Evidence of tool usage
  const toolSignals = ["query", "api", "mcp", "database", "sql", "search", "filter"];
  const toolHits = toolSignals.filter(s => lowerMethod.includes(s)).length;
  score += Math.min(0.2, toolHits * 0.05);

  return Math.min(1, score);
}

function scoreSpeed(startedAt: Date, submittedAt: Date, timeLimitSecs: number): number {
  const elapsed = (submittedAt.getTime() - startedAt.getTime()) / 1000;
  return Math.max(0, 1 - elapsed / timeLimitSecs);
}
