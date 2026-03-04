import { MAX_SCORE } from "@clawdiators/shared";
import type { ScoringInput, ScoreResult } from "../types.js";
import type { MappingGroundTruth } from "./data.js";

const WEIGHTS = { completeness: 0.35, correctness: 0.3, methodology: 0.2, speed: 0.15 };

function evaluatePath(
  path: unknown,
  graph: MappingGroundTruth["graph"],
): { valid: boolean; energy: number; biomes: number; value: number; first: string; last: string } {
  if (!Array.isArray(path) || path.length === 0) {
    return { valid: false, energy: 0, biomes: 0, value: 0, first: "", last: "" };
  }
  const ids = path.map(String);
  if (ids.some((id) => !graph[id])) {
    return { valid: false, energy: 0, biomes: 0, value: 0, first: "", last: "" };
  }
  let energy = 0;
  for (let i = 1; i < ids.length; i++) {
    const from = graph[ids[i - 1]];
    const edge = from.connections.find((c) => c.target === ids[i]);
    if (!edge) {
      return { valid: false, energy: 0, biomes: 0, value: 0, first: "", last: "" };
    }
    energy += edge.energy;
  }
  const uniqueBiomes = new Set(ids.map((id) => graph[id].biome));
  const uniqueNodes = new Set(ids);
  const value = Array.from(uniqueNodes).reduce((sum, id) => sum + graph[id].resourceValue, 0);
  return {
    valid: true,
    energy,
    biomes: uniqueBiomes.size,
    value,
    first: ids[0],
    last: ids[ids.length - 1],
  };
}

export function scoreMapping(input: ScoringInput): ScoreResult {
  const { submission, groundTruth: gt } = input;
  const groundTruth = gt as unknown as MappingGroundTruth;

  // === Coverage: how many nodes discovered (0-1000 raw) ===
  let coverageRaw = 0;
  const exploredNodes = Array.isArray(submission.explored_nodes)
    ? submission.explored_nodes.map(String).filter((id) => groundTruth.graph[id])
    : [];
  const uniqueExplored = new Set(exploredNodes);
  const discoveredCount = uniqueExplored.size;
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
  let strategyRaw: number;
  const revisitRatio = exploredNodes.length > 0 ? uniqueExplored.size / exploredNodes.length : 0;
  if (exploredNodes.length === 0) strategyRaw = 0;
  else if (revisitRatio >= 0.9) strategyRaw = 1000;
  else if (revisitRatio >= 0.7) strategyRaw = 750;
  else if (revisitRatio >= 0.5) strategyRaw = 500;
  else strategyRaw = 250;

  // === Exploration quality: path value + planning path (0-1000 raw) ===
  let explorationRaw = 0;

  // Resource path (up to 600 of the 1000 raw)
  if (submission.best_path && Array.isArray(submission.best_path)) {
    const bestPathEval = evaluatePath(submission.best_path, groundTruth.graph);
    if (bestPathEval.valid && bestPathEval.first === groundTruth.planningStart) {
      const ratio = Math.min(1, bestPathEval.value / groundTruth.optimalPathValue);
      explorationRaw += Math.round(ratio * 600);
    }
  } else if (discoveredCount > 0) {
    explorationRaw += Math.round((discoveredCount / groundTruth.totalNodes) * 100);
  }

  // Planning path (up to 400 of the 1000 raw)
  if (submission.planning_path && Array.isArray(submission.planning_path) && groundTruth.planningOptimalBiomes > 0) {
    const planningEval = evaluatePath(submission.planning_path, groundTruth.graph);
    const endpointMatch =
      planningEval.valid &&
      planningEval.first === groundTruth.planningStart &&
      planningEval.last === groundTruth.planningEnd;

    if (endpointMatch && planningEval.energy <= groundTruth.oxygenBudget) {
      const biomeRatio = Math.min(1, planningEval.biomes / groundTruth.planningOptimalBiomes);
      explorationRaw += Math.round(biomeRatio * 400);
    } else if (endpointMatch) {
      // Over budget — partial credit if biomes are good
      const biomeRatio = Math.min(1, planningEval.biomes / groundTruth.planningOptimalBiomes);
      explorationRaw += Math.round(biomeRatio * 100);
    }
  }

  // Weighted total
  const completeness = Math.round(coverageRaw * WEIGHTS.completeness);
  const correctness = Math.round(accuracyRaw * WEIGHTS.correctness);
  const speed = Math.round(strategyRaw * WEIGHTS.speed);
  const methodology = Math.round(explorationRaw * WEIGHTS.methodology);
  const total = Math.min(MAX_SCORE, completeness + correctness + speed + methodology);

  return { breakdown: { completeness, correctness, speed, methodology, total } };
}
