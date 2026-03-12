/**
 * Standalone data generator for scaling-law-extrapolation challenge.
 * Replicates the server-side data generation exactly.
 * Usage: node generate_data.mjs [seed]
 */

// mulberry32 PRNG - exact copy from whimsy.ts
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function boxMullerNormal(rng) {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function scalingLoss(N, D, A, alpha, B, beta, E) {
  return A * Math.pow(N, -alpha) + B * Math.pow(D, -beta) + E;
}

function generateScalingLawExtrapolationData(seed) {
  const rng = mulberry32(seed);

  const A = 5.0 + rng() * 10.0;
  const alpha = 0.30 + rng() * 0.10;
  const B = 3.0 + rng() * 7.0;
  const beta = 0.25 + rng() * 0.10;
  const E = 1.50 + rng() * 0.40;

  const baseNoise = 0.01 + rng() * 0.02;

  const brokenChance = rng();
  const hasBroken = brokenChance < 0.30;

  const observedScales = [
    { name: "10M", params: 10 },
    { name: "30M", params: 30 },
    { name: "100M", params: 100 },
    { name: "300M", params: 300 },
    { name: "1B", params: 1000 },
  ];

  const brokenIdx = hasBroken ? Math.floor(rng() * observedScales.length) : -1;
  const brokenDeviation = 0.05 + rng() * 0.10;
  const brokenScales = [];
  if (hasBroken) {
    brokenScales.push(observedScales[brokenIdx].name);
  }

  const tokenMultipliers = [20, 22, 20, 18, 15];
  const trainingCurves = [];

  for (let si = 0; si < observedScales.length; si++) {
    const scale = observedScales[si];
    const N = scale.params * 1e6;
    const totalTokensBillions = (scale.params * tokenMultipliers[si]) / 1000;
    const totalD = totalTokensBillions * 1e9;
    const nCheckpoints = 20 + Math.floor(rng() * 31);
    const checkpoints = [];
    const isBroken = si === brokenIdx;

    for (let ci = 0; ci < nCheckpoints; ci++) {
      const step = ci + 1;
      const fraction = (ci + 1) / nCheckpoints;
      const tokensAtStep = totalD * fraction;
      const tokensBAtStep = Math.round((tokensAtStep / 1e9) * 1000) / 1000;

      let trueLoss = scalingLoss(N, tokensAtStep, A, alpha, B, beta, E);
      if (isBroken) {
        trueLoss *= (1 + brokenDeviation);
      }

      let warmupFactor = 1.0;
      if (fraction < 0.10) {
        const warmupProgress = fraction / 0.10;
        warmupFactor = 1.0 + (0.3 + rng() * 0.2) * Math.exp(-3 * warmupProgress);
      }

      const valNoise = 1 + boxMullerNormal(rng) * baseNoise;
      const trainNoise = 1 + boxMullerNormal(rng) * baseNoise * 0.8;

      const valLoss = Math.round(trueLoss * warmupFactor * valNoise * 10000) / 10000;
      const trainLoss = Math.round(trueLoss * 0.97 * warmupFactor * trainNoise * 10000) / 10000;

      checkpoints.push({
        step,
        tokens_billions: tokensBAtStep,
        train_loss: Math.max(0.1, trainLoss),
        val_loss: Math.max(0.1, valLoss),
      });
    }

    trainingCurves.push({
      scale_name: scale.name,
      params_millions: scale.params,
      checkpoints,
    });
  }

  const heldOutScales = [
    { name: "3B", params: 3000 },
    { name: "10B", params: 10000 },
  ];

  const heldOutTokensBillions = [
    40 + Math.round(rng() * 20),
    120 + Math.round(rng() * 60),
  ];

  const predictions = {};
  const predictionTargets = [];

  for (let i = 0; i < heldOutScales.length; i++) {
    const scale = heldOutScales[i];
    const N = scale.params * 1e6;
    const D = heldOutTokensBillions[i] * 1e9;
    const trueLoss = scalingLoss(N, D, A, alpha, B, beta, E);
    predictions[scale.name] = Math.round(trueLoss * 10000) / 10000;

    predictionTargets.push({
      scale_name: scale.name,
      params_millions: scale.params,
      tokens_billions: heldOutTokensBillions[i],
    });
  }

  const computeBudgetFlops = 5e21 + rng() * 5e22;

  let bestLoss = Infinity;
  let bestN = 1e9;
  for (let logN = 18; logN <= 24; logN += 0.02) {
    const N = Math.exp(logN);
    const D = computeBudgetFlops / (6 * N);
    if (D < 1e6) continue;
    const loss = scalingLoss(N, D, A, alpha, B, beta, E);
    if (loss < bestLoss) {
      bestLoss = loss;
      bestN = N;
    }
  }
  const bestD = computeBudgetFlops / (6 * bestN);
  const computeOptimalRatio = Math.round((bestD / bestN) * 100) / 100;

  return {
    groundTruth: {
      alpha: Math.round(alpha * 10000) / 10000,
      beta: Math.round(beta * 10000) / 10000,
      E: Math.round(E * 10000) / 10000,
      A: Math.round(A * 1000) / 1000,
      B: Math.round(B * 1000) / 1000,
      predictions,
      compute_optimal_ratio: computeOptimalRatio,
      broken_scales: brokenScales,
      seed,
    },
    trainingCurves,
    predictionTargets,
    computeBudget: {
      total_flops: computeBudgetFlops,
      description: `Total compute budget: ${(computeBudgetFlops / 1e21).toFixed(1)}e21 FLOPs.`,
    },
  };
}

const seed = parseInt(process.argv[2] || "42");
const data = generateScalingLawExtrapolationData(seed);

// Write workspace files
import { writeFileSync, mkdirSync } from 'fs';
const dir = `/Users/shalinmehta/Projects/clawdiators/battle-test-findings/scaling-law-extrapolation/workspace`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/training_curves.json`, JSON.stringify(data.trainingCurves, null, 2));
writeFileSync(`${dir}/prediction_targets.json`, JSON.stringify(data.predictionTargets, null, 2));
writeFileSync(`${dir}/compute_budget.json`, JSON.stringify(data.computeBudget, null, 2));
writeFileSync(`${dir}/ground_truth.json`, JSON.stringify(data.groundTruth, null, 2));

console.log("=== Ground Truth ===");
console.log(JSON.stringify(data.groundTruth, null, 2));
console.log("\n=== Prediction Targets ===");
console.log(JSON.stringify(data.predictionTargets, null, 2));
console.log("\n=== Compute Budget ===");
console.log(JSON.stringify(data.computeBudget, null, 2));
console.log("\n=== Training Curves Summary ===");
for (const curve of data.trainingCurves) {
  const lastCP = curve.checkpoints[curve.checkpoints.length - 1];
  const firstCP = curve.checkpoints[0];
  console.log(`${curve.scale_name} (${curve.params_millions}M params): ${curve.checkpoints.length} checkpoints, final val_loss=${lastCP.val_loss}, first val_loss=${firstCP.val_loss}`);
}
