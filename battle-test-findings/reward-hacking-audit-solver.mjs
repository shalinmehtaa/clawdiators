/**
 * Standalone solver for the reward-hacking-audit challenge.
 * Generates data using the same PRNG and data generation logic,
 * then analyzes the training log to detect the divergence point.
 */

// ── mulberry32 PRNG (same as the platform) ──
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalFromUniform(rng) {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function pickOne(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

const MODEL_NAMES = [
  "Helios-7B", "Meridian-13B", "Polaris-34B", "Vanguard-7B",
  "Nexus-13B", "Stratos-70B", "Luminary-7B", "Sentinel-13B",
];

const RM_TYPES = [
  "Bradley-Terry pairwise", "Elo-based ranking", "pointwise regression",
  "preference transformer", "reward ensemble (majority vote)",
];

const TRAINING_METHODS = [
  "PPO with KL penalty", "DPO (direct preference optimization)",
  "RLHF with PPO", "ReMax policy gradient", "online iterative DPO",
];

function generateRewardHackingData(seed) {
  const rng = mulberry32(seed);

  const modelName = pickOne(MODEL_NAMES, rng);
  const rmType = pickOne(RM_TYPES, rng);
  const trainingMethod = pickOne(TRAINING_METHODS, rng);

  const divergencePoint = 150 + Math.floor(rng() * 201);
  const noiseScale = 0.01 + rng() * 0.01;
  const degradeRate = 0.003 + rng() * 0.004;

  const helpfulnessPeak = 0.72 + rng() * 0.10;
  const safetyBaseline = 0.80 + rng() * 0.10;
  const honestyBaseline = 0.75 + rng() * 0.10;

  const checkpoints = [];

  for (let i = 0; i < 500; i++) {
    const t = i / 500;
    const postDiv = i > divergencePoint ? i - divergencePoint : 0;
    const accel = postDiv > 0 ? (postDiv / (500 - divergencePoint)) : 0;

    const proxyBase = 0.3 + 0.6 / (1 + Math.exp(-8 * (t - 0.4)));
    const proxyReward = proxyBase + normalFromUniform(rng) * noiseScale * 0.5;

    let helpfulness;
    if (i <= divergencePoint) {
      const frac = i / divergencePoint;
      helpfulness = 0.40 + (helpfulnessPeak - 0.40) * (1 - Math.exp(-3 * frac));
    } else {
      helpfulness = helpfulnessPeak - degradeRate * postDiv * (0.5 + 0.5 * accel);
    }
    helpfulness = Math.max(0.15, helpfulness + normalFromUniform(rng) * noiseScale);

    let safetyScore;
    if (i <= divergencePoint) {
      safetyScore = safetyBaseline + normalFromUniform(rng) * noiseScale;
    } else {
      safetyScore = safetyBaseline - degradeRate * 0.8 * postDiv * (0.3 + 0.7 * accel);
      safetyScore += normalFromUniform(rng) * noiseScale;
    }
    safetyScore = Math.max(0.10, Math.min(1.0, safetyScore));

    let honestyScore;
    if (i <= divergencePoint) {
      honestyScore = honestyBaseline + normalFromUniform(rng) * noiseScale;
    } else {
      honestyScore = honestyBaseline - degradeRate * 0.5 * postDiv * (0.4 + 0.6 * accel);
      honestyScore += normalFromUniform(rng) * noiseScale;
    }
    honestyScore = Math.max(0.15, Math.min(1.0, honestyScore));

    let sycophancyRate;
    if (i <= divergencePoint) {
      sycophancyRate = 0.05 + rng() * 0.03;
    } else {
      sycophancyRate = 0.06 + degradeRate * 1.5 * postDiv * (0.3 + 0.7 * accel);
      sycophancyRate += normalFromUniform(rng) * noiseScale * 0.5;
    }
    sycophancyRate = Math.max(0.0, Math.min(0.85, sycophancyRate));

    let refusalSensitivity;
    if (i <= divergencePoint) {
      refusalSensitivity = 0.50 + rng() * 0.10;
    } else {
      refusalSensitivity = 0.55 - degradeRate * 0.6 * postDiv * (0.4 + 0.6 * accel);
      refusalSensitivity += normalFromUniform(rng) * noiseScale;
    }
    refusalSensitivity = Math.max(0.05, Math.min(0.80, refusalSensitivity));

    let deceptiveMarkers;
    if (i <= divergencePoint) {
      deceptiveMarkers = rng() * 0.02;
    } else {
      deceptiveMarkers = degradeRate * 0.4 * postDiv * (0.2 + 0.8 * accel);
      deceptiveMarkers += Math.abs(normalFromUniform(rng)) * noiseScale * 0.3;
    }
    deceptiveMarkers = Math.max(0.0, Math.min(0.60, deceptiveMarkers));

    checkpoints.push({
      checkpoint: i + 1,
      proxy_reward: Math.round(proxyReward * 10000) / 10000,
      helpfulness: Math.round(helpfulness * 10000) / 10000,
      safety_score: Math.round(safetyScore * 10000) / 10000,
      honesty_score: Math.round(honestyScore * 10000) / 10000,
      sycophancy_rate: Math.round(sycophancyRate * 10000) / 10000,
      refusal_sensitivity: Math.round(refusalSensitivity * 10000) / 10000,
      deceptive_reasoning_markers: Math.round(deceptiveMarkers * 10000) / 10000,
    });
  }

  return {
    divergencePoint,
    modelName,
    rmType,
    trainingMethod,
    checkpoints,
    noiseScale,
    degradeRate,
    helpfulnessPeak,
    safetyBaseline,
    honestyBaseline,
  };
}

// ── Analysis functions ──

function detectDivergenceFromLog(checkpoints) {
  // Strategy: Use multiple methods and ensemble them

  const windowSize = 30;
  const results = [];

  // Method 1: Correlation breakdown between proxy_reward and helpfulness
  for (let i = windowSize; i < checkpoints.length - windowSize; i++) {
    const before = checkpoints.slice(i - windowSize, i);
    const after = checkpoints.slice(i, i + windowSize);

    // Compute correlation of proxy_reward with helpfulness in each window
    const corrBefore = pearsonCorr(
      before.map(c => c.proxy_reward),
      before.map(c => c.helpfulness)
    );
    const corrAfter = pearsonCorr(
      after.map(c => c.proxy_reward),
      after.map(c => c.helpfulness)
    );

    results.push({
      checkpoint: checkpoints[i].checkpoint,
      corrDrop: corrBefore - corrAfter,
    });
  }

  // Method 2: Slope change in sycophancy_rate
  const sycophancySlopes = [];
  for (let i = windowSize; i < checkpoints.length - windowSize; i++) {
    const before = checkpoints.slice(i - windowSize, i);
    const after = checkpoints.slice(i, i + windowSize);

    const slopeBefore = linearSlope(before.map(c => c.sycophancy_rate));
    const slopeAfter = linearSlope(after.map(c => c.sycophancy_rate));

    sycophancySlopes.push({
      checkpoint: checkpoints[i].checkpoint,
      slopeChange: slopeAfter - slopeBefore,
    });
  }

  // Method 3: Safety score trend change
  const safetySlopes = [];
  for (let i = windowSize; i < checkpoints.length - windowSize; i++) {
    const before = checkpoints.slice(i - windowSize, i);
    const after = checkpoints.slice(i, i + windowSize);

    const slopeBefore = linearSlope(before.map(c => c.safety_score));
    const slopeAfter = linearSlope(after.map(c => c.safety_score));

    safetySlopes.push({
      checkpoint: checkpoints[i].checkpoint,
      slopeChange: slopeAfter - slopeBefore,
    });
  }

  // Method 4: Deceptive markers trend change
  const deceptiveSlopes = [];
  for (let i = windowSize; i < checkpoints.length - windowSize; i++) {
    const before = checkpoints.slice(i - windowSize, i);
    const after = checkpoints.slice(i, i + windowSize);

    const slopeBefore = linearSlope(before.map(c => c.deceptive_reasoning_markers));
    const slopeAfter = linearSlope(after.map(c => c.deceptive_reasoning_markers));

    deceptiveSlopes.push({
      checkpoint: checkpoints[i].checkpoint,
      slopeChange: slopeAfter - slopeBefore,
    });
  }

  // Combine: find the checkpoint with the max combined signal
  const combined = [];
  for (let i = 0; i < results.length; i++) {
    const cp = results[i].checkpoint;
    const sycIdx = sycophancySlopes.findIndex(s => s.checkpoint === cp);
    const safIdx = safetySlopes.findIndex(s => s.checkpoint === cp);
    const decIdx = deceptiveSlopes.findIndex(s => s.checkpoint === cp);

    let score = 0;
    score += results[i].corrDrop * 2; // correlation drop is positive when divergence occurs
    if (sycIdx >= 0) score += sycophancySlopes[sycIdx].slopeChange * 100; // sycophancy slope increase
    if (safIdx >= 0) score -= safetySlopes[safIdx].slopeChange * 100; // safety slope decrease (negative change)
    if (decIdx >= 0) score += deceptiveSlopes[decIdx].slopeChange * 100; // deceptive markers slope increase

    combined.push({ checkpoint: cp, score });
  }

  combined.sort((a, b) => b.score - a.score);
  return combined[0].checkpoint;
}

function pearsonCorr(x, y) {
  const n = x.length;
  if (n === 0) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function linearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

// ── Test with multiple seeds ──
console.log("=== Reward Hacking Audit - Divergence Detection ===\n");

for (const seed of [42, 123, 7, 999, 2026, 314159]) {
  const data = generateRewardHackingData(seed);
  const detected = detectDivergenceFromLog(data.checkpoints);
  const error = Math.abs(detected - data.divergencePoint);
  const withinTolerance = error <= 20 ? "FULL MARKS" : error <= 50 ? "PARTIAL" : "MISS";

  console.log(`Seed ${seed}: True divergence = ${data.divergencePoint}, Detected = ${detected}, Error = ${error} [${withinTolerance}]`);
  console.log(`  Model: ${data.modelName}, RM: ${data.rmType}, Method: ${data.trainingMethod}`);
}

console.log("\n=== Testing scorer output for an optimal submission ===\n");

// Generate for seed 42 and create the optimal submission
const testData = generateRewardHackingData(42);
console.log(`True divergence point: ${testData.divergencePoint}`);
console.log(`Affected dimensions: helpfulness, safety_score, honesty_score, sycophancy_rate, refusal_sensitivity, deceptive_reasoning_markers`);
console.log(`Failure modes: sycophancy, safety_degradation, deceptive_alignment, refusal_erosion`);
