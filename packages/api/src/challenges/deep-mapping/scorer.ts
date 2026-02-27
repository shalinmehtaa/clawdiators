import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { MappingGroundTruth } from "./data.js";

const WEIGHTS = { coverage: 0.35, accuracy: 0.3, exploration: 0.2, strategy: 0.15 };
const TIME_LIMIT = 3600; // 1 hour

export function scoreMapping(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt, startedAt, submittedAt } = input;
  const groundTruth = gt as unknown as MappingGroundTruth;

  // === Coverage: how many nodes discovered (0-1000 raw) ===
  let coverageRaw = 0;
  const discoveredCount = Number(submission.nodes_discovered ?? submission.total_nodes ?? 0);
  if (discoveredCount > 0) {
    const ratio = Math.min(1, discoveredCount / groundTruth.totalNodes);
    coverageRaw = Math.round(ratio * 1000);
  }

  // === Accuracy: correct answers about the map (0-1000 raw) ===
  let accuracyRaw = 0;

  // Deepest node (250)
  if (submission.deepest_node !== undefined) {
    const deepest = typeof submission.deepest_node === "object"
      ? (submission.deepest_node as any).id || (submission.deepest_node as any).node_id
      : String(submission.deepest_node);
    if (deepest === groundTruth.deepestNode.id) accuracyRaw += 250;
  }

  // Most connected node (250)
  if (submission.most_connected_node !== undefined) {
    const mc = typeof submission.most_connected_node === "object"
      ? (submission.most_connected_node as any).id || (submission.most_connected_node as any).node_id
      : String(submission.most_connected_node);
    if (mc === groundTruth.mostConnectedNode.id) accuracyRaw += 250;
  }

  // Resources by type (300)
  if (submission.resources_by_type && typeof submission.resources_by_type === "object") {
    const submitted = submission.resources_by_type as Record<string, any>;
    const truth = groundTruth.resourcesByType;
    const types = Object.keys(truth);
    let correctTypes = 0;
    for (const type of types) {
      const sub = submitted[type];
      if (sub) {
        const subCount = Number(sub.count ?? sub);
        if (subCount === truth[type].count) correctTypes++;
      }
    }
    accuracyRaw += Math.round((correctTypes / Math.max(types.length, 1)) * 300);
  }

  // Total resource value (200)
  if (submission.total_resource_value !== undefined) {
    const val = Number(submission.total_resource_value);
    if (!Number.isNaN(val)) {
      const diff = Math.abs(val - groundTruth.totalResourceValue);
      if (diff === 0) accuracyRaw += 200;
      else if (diff <= groundTruth.totalResourceValue * 0.1) accuracyRaw += 100;
      else if (diff <= groundTruth.totalResourceValue * 0.25) accuracyRaw += 50;
    }
  }

  // === Strategy (0-1000 raw) ===
  // Reward efficient exploration — fewer revisits, more unique discoveries
  let strategyRaw: number;
  const exploredNodes = Array.isArray(submission.explored_nodes) ? submission.explored_nodes : [];
  const uniqueNodes = new Set(exploredNodes.map(String));
  const revisitRatio = uniqueNodes.size > 0 ? uniqueNodes.size / exploredNodes.length : 0;
  if (revisitRatio >= 0.9) strategyRaw = 1000;
  else if (revisitRatio >= 0.7) strategyRaw = 750;
  else if (revisitRatio >= 0.5) strategyRaw = 500;
  else strategyRaw = 300;

  // === Exploration quality: path value ===
  let explorationRaw = 0;
  if (submission.best_path && Array.isArray(submission.best_path)) {
    const pathValue = Number(submission.path_value ?? 0);
    if (pathValue > 0) {
      const ratio = Math.min(1, pathValue / groundTruth.optimalPathValue);
      explorationRaw = Math.round(ratio * 1000);
    }
  } else {
    // Partial credit for submitting any resource information
    if (discoveredCount > 0) {
      explorationRaw = Math.round((discoveredCount / groundTruth.totalNodes) * 500);
    }
  }

  // Weighted total
  const coverage = Math.round(coverageRaw * WEIGHTS.coverage);
  const accuracy = Math.round(accuracyRaw * WEIGHTS.accuracy);
  const strategy = Math.round(strategyRaw * WEIGHTS.strategy);
  const exploration = Math.round(explorationRaw * WEIGHTS.exploration);
  const total = Math.min(MAX_SCORE, coverage + accuracy + strategy + exploration);

  return { breakdown: { coverage, accuracy, strategy, exploration, total } };
}
