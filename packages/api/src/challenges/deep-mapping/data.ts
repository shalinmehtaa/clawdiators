import { mulberry32 } from "../../services/whimsy.js";

/**
 * Deep Mapping Expedition: Explore a procedural graph (ocean floor).
 * Agent discovers nodes via GET /map/explore/:nodeId.
 * Must map territory, find resources, and report findings.
 * Workspace-based: 1 hour, agent explores locally.
 */

export interface MapNode {
  id: string;
  name: string;
  type: "cave" | "reef" | "trench" | "plateau" | "vent" | "ruin";
  depth: number; // meters
  resource: string | null; // "crystal", "fossil", "mineral", "artifact", null
  resourceValue: number; // 0 if no resource
  connections: string[]; // IDs of connected nodes
  discoverable: boolean; // some nodes are hidden until neighbors are explored
}

export interface MappingGroundTruth {
  totalNodes: number;
  totalResources: number;
  totalResourceValue: number;
  deepestNode: { id: string; depth: number };
  mostConnectedNode: { id: string; connections: number };
  resourcesByType: Record<string, { count: number; totalValue: number }>;
  optimalPath: string[]; // path from start that maximizes resource value
  optimalPathValue: number;
}

export interface MappingData {
  nodes: MapNode[];
  startNodeId: string;
  groundTruth: MappingGroundTruth;
  objective: string;
}

const NODE_NAMES = [
  "The Abyss Gate", "Coral Throne", "Phantom Ridge", "Biolume Cavern",
  "Pressure Point", "The Silent Deep", "Kelp Cathedral", "Iron Trench",
  "Crystal Spire", "The Maw", "Starfall Basin", "Obsidian Shelf",
  "Thermal Vent Alpha", "The Graveyard", "Sapphire Grotto", "Riftwall",
  "Echo Chamber", "Tide Pool", "Barnacle Heights", "The Narrows",
  "Leviathan's Rest", "Glass Floor", "Sulfur Springs", "Anchor Point",
  "The Crucible", "Midnight Garden", "Storm Drain", "Pearl Bed",
  "The Labyrinth", "Driftwood Hollow", "Mariana's Edge", "Sunken Citadel",
  "Coral Bridge", "Brine Lake", "The Cascade", "Chimney Field",
  "Twilight Zone", "Abyssopelagic Flat", "Hydrothermal Rise", "Fossil Terrace",
];

const NODE_TYPES: MapNode["type"][] = ["cave", "reef", "trench", "plateau", "vent", "ruin"];
const RESOURCES = ["crystal", "fossil", "mineral", "artifact"];

export function generateMappingData(seed: number): MappingData {
  const rng = mulberry32(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const randInt = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;

  // Generate 30-40 nodes
  const nodeCount = randInt(30, 40);
  const nodes: MapNode[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const hasResource = rng() > 0.4; // 60% chance of resource
    const resource = hasResource ? pick(RESOURCES) : null;
    const resourceValue = resource ? randInt(10, 100) * (resource === "artifact" ? 3 : resource === "crystal" ? 2 : 1) : 0;

    nodes.push({
      id: `NODE-${String(i + 1).padStart(3, "0")}`,
      name: i < NODE_NAMES.length ? NODE_NAMES[i] : `Unnamed Sector ${i + 1}`,
      type: pick(NODE_TYPES),
      depth: randInt(100, 10000),
      resource,
      resourceValue,
      connections: [], // filled below
      discoverable: i > 5 ? rng() > 0.3 : true, // first 6 always visible
    });
  }

  // Create connections (graph edges) — ensure connectivity
  // First, create a spanning tree
  for (let i = 1; i < nodeCount; i++) {
    const parent = randInt(0, i - 1);
    nodes[i].connections.push(nodes[parent].id);
    nodes[parent].connections.push(nodes[i].id);
  }

  // Add extra edges for richness
  const extraEdges = randInt(nodeCount, nodeCount * 2);
  for (let e = 0; e < extraEdges; e++) {
    const a = randInt(0, nodeCount - 1);
    const b = randInt(0, nodeCount - 1);
    if (a !== b && !nodes[a].connections.includes(nodes[b].id)) {
      nodes[a].connections.push(nodes[b].id);
      nodes[b].connections.push(nodes[a].id);
    }
  }

  // Compute ground truth
  let deepestNode = nodes[0];
  let mostConnected = nodes[0];
  const resourcesByType: Record<string, { count: number; totalValue: number }> = {};
  let totalResources = 0;
  let totalResourceValue = 0;

  for (const node of nodes) {
    if (node.depth > deepestNode.depth) deepestNode = node;
    if (node.connections.length > mostConnected.connections.length) mostConnected = node;
    if (node.resource) {
      totalResources++;
      totalResourceValue += node.resourceValue;
      if (!resourcesByType[node.resource]) {
        resourcesByType[node.resource] = { count: 0, totalValue: 0 };
      }
      resourcesByType[node.resource].count++;
      resourcesByType[node.resource].totalValue += node.resourceValue;
    }
  }

  // Compute optimal path (greedy: from start, always go to highest-value unvisited neighbor)
  // This is a reasonable approximation — not necessarily globally optimal, but deterministic
  const startNode = nodes[0];
  const visited = new Set<string>();
  const optimalPath: string[] = [startNode.id];
  let optimalPathValue = startNode.resourceValue;
  visited.add(startNode.id);

  let current = startNode;
  for (let step = 0; step < 20; step++) { // max 20 steps in optimal path
    const neighbors = current.connections
      .map((id) => nodes.find((n) => n.id === id)!)
      .filter((n) => !visited.has(n.id));

    if (neighbors.length === 0) break;

    // Pick neighbor with highest resource value (greedy)
    neighbors.sort((a, b) => b.resourceValue - a.resourceValue);
    current = neighbors[0];
    visited.add(current.id);
    optimalPath.push(current.id);
    optimalPathValue += current.resourceValue;
  }

  const objective = `Explore an underwater cave system starting from "${startNode.name}" (${startNode.id}). Read node files to discover connections, map the territory, and find resources. You have 1 hour. Report: total nodes discovered, resources found by type, deepest node, most connected node, and your best path for resource collection.`;

  return {
    nodes,
    startNodeId: startNode.id,
    groundTruth: {
      totalNodes: nodeCount,
      totalResources,
      totalResourceValue,
      deepestNode: { id: deepestNode.id, depth: deepestNode.depth },
      mostConnectedNode: { id: mostConnected.id, connections: mostConnected.connections.length },
      resourcesByType,
      optimalPath,
      optimalPathValue,
    },
    objective,
  };
}
