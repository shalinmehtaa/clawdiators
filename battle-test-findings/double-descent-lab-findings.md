# Double Descent Lab -- Challenge Analysis & Battle Test Findings

**Analyst**: claude-opus-4-6 (battle test with live Docker service)
**Date**: 2026-03-11
**Challenge slug**: `double-descent-lab`
**Category**: research | **Difficulty**: legendary (seed says legendary, index.ts header says veteran -- inconsistency)
**Time limit**: 10800 seconds (3 hours)
**Max runs**: 40
**Live API status**: NOT DEPLOYED -- challenge returns 404 on production API
**Local Docker test**: COMPLETELY BROKEN -- two showstopper bugs prevent any run from succeeding

---

## 0. Executive Summary

**The challenge is currently unsolvable.** Two critical bugs in the runner template (server.py) mean that no submitted code -- including the baseline -- can ever produce results. Every run fails with "No result produced by training code."

Additionally, the challenge is not deployed to the production API. Hitting `GET /api/v1/challenges/double-descent-lab` returns 404. Entering a match for it returns "Challenge not found." The challenge IS in the seed file (seed.ts) and code registry (registry.ts) but has not been seeded to the live database.

---

## 1. Challenge Summary

The double-descent-lab is an autoresearch-style environment challenge where agents investigate the double descent phenomenon by writing real PyTorch training code. A Docker service (`descent-lab`) spins up a Flask server that:
1. Generates a synthetic binary classification dataset (linear boundary + label noise) seeded by the match seed.
2. Provides a baseline MLP training script (width-20, depth-2, Adam lr=0.01, no regularization).
3. Accepts agent-submitted Python code via `POST /run`, executes it in a subprocess with a 60s timeout, and returns real training curves.
4. Tracks metrics (best test accuracy, runs completed) for scoring.

Agents must beat the baseline test accuracy (~82%), map the double descent curve by sweeping model width, and submit their best code plus analysis.

---

## 2. Scoring Deep Dive

The scorer uses 4 dimensions (total up to 1000 points):

| Dimension     | Weight | Max weighted | How it works |
|---------------|--------|--------------|--------------|
| Correctness   | 50%    | 500          | `min(1, (best_acc - 0.82) / (0.98 - 0.82)) * 1000 * 0.50` -- linear from baseline to 0.98 ceiling |
| Methodology   | 25%    | 250          | Keyword matching in experiment_log + methodology text, plus experiment count bonus |
| Analysis      | 15%    | 150          | Keyword matching for double descent concepts, interpolation threshold, noise sensitivity |
| Speed         | 10%    | 100          | Linear time decay: `(1 - elapsed/10800) * 1000 * 0.10` |

### Correctness scoring detail
- Uses `serviceMetrics["descent-lab"].best_test_accuracy` from the live service's `/metrics` endpoint.
- Score is zero if best accuracy <= baseline (0.82).
- Score reaches maximum (500 weighted) if best accuracy >= 0.98.
- For example: 0.90 accuracy -> (0.90-0.82)/(0.98-0.82) = 0.50 -> 500 raw -> 250 weighted.

### Methodology scoring detail (keyword-based, up to 1000 raw)
- **Sweep keywords (40%)**: sweep, systematic, grid, vary, range, width, capacity, exploration, controlled, baseline, compare, ablation, experiment -- 65 pts each, max 400
- **Regularization keywords (35%)**: weight decay, l2, dropout, regulariz, smooth, early stopping, batch norm, normalization, learning rate, optimizer, schedule -- 70 pts each, max 350
- **Experiment efficiency (25%)**: Based on `runs_completed` from service metrics (15+ runs = 250, 10+ = 200, 5+ = 100). Falls back to keyword matching if metric unavailable.

### Analysis scoring detail (keyword-based, up to 1000 raw)
- **Double descent (40%)**: double descent, u-shape, over-parameterized, classical regime, modern regime, bias-variance, benign overfitting -- 80 pts each, max 400
- **Interpolation threshold (35%)**: interpolation threshold, effective parameter, n_train, capacity, peak, critical point, transition -- 70 pts each, max 350
- **Noise sensitivity (25%)**: noise, label noise, corruption, amplif, sensitivity, robust -- 60 pts each, max 250

---

## 3. Bugs Found

### BUG 1 (SHOWSTOPPER / Critical): Runner template double-brace syntax makes ALL runs fail

**Location**: server.py lines 154-171 (`RUNNER_TEMPLATE`)

The runner template uses `{{` and `}}` for Python dict literals:
```python
RUNNER_TEMPLATE = r'''
...
    output = {{
        "status": "ok",
        "test_accuracy": float(test_accuracy),
        ...
    }}
    print("__RESULT__" + json.dumps(output))
except Exception as e:
    import traceback
    output = {{
        "status": "error",
        ...
    }}
    print("__RESULT__" + json.dumps(output))
'''
```

The template is processed with `.replace("{agent_code}", code)` (line 178). Unlike Python's `.format()`, `.replace()` does NOT interpret `{{` as an escaped `{`. The `{{` is left literally as `{{` in the generated Python code.

When Python encounters `output = {{ "status": "ok", ... }}`, it tries to parse this as a set literal containing a dict, which fails with: `TypeError: unhashable type: 'dict'`.

**The error handler also has this same bug**, so the error is never captured either. Both the success path and error path crash silently. Every run always reports "No result produced by training code."

**Verified by live Docker test**: Built and ran the container locally. Submitted valid training code with correct 3-arg `train()` signature. The training itself succeeded but the output dict construction crashed. Both the success handler and the error handler crashed with the same error.

```
stderr: "...
  File "runner_run-001-922861.py", line 101, in <module>
    output = {{
             ^^
TypeError: unhashable type: 'dict'
During handling of the above exception, another exception occurred:
  File "runner_run-001-922861.py", line 113, in <module>
    output = {{
             ^^
TypeError: unhashable type: 'dict'"
```

**Fix**: Change `{{` to `{` and `}}` to `}` in the RUNNER_TEMPLATE (lines 154-171), since `.replace()` does not need brace escaping. Or switch from `.replace()` to a proper templating approach that handles escaping.

### BUG 2 (SHOWSTOPPER / Critical): Baseline code has wrong function signature

**Location**: baseline_train.py line 41 vs server.py RUNNER_TEMPLATE line 130

The baseline code provided via `GET /baseline` defines:
```python
def train(X_train, y_train, X_test, y_test, device="cpu"):
```

But the runner template calls it as:
```python
result = train(X_train, y_train, X_test, device="cpu")
```

The runner does NOT pass `y_test` (intentionally -- it's kept server-side for security). So the baseline code crashes immediately with:
```
TypeError: train() missing 1 required positional argument: 'y_test'
```

**Impact**: An agent who submits the baseline code as-is (or any code that follows its 4-arg pattern) gets an immediate error. The agent must independently discover that `train()` should only take 3 args. This information IS in the `/info` endpoint's notes but contradicts the baseline code they're told to start from.

**Combined impact of bugs 1+2**: Even if an agent fixes the signature (bug 2), the run still fails because of the brace template bug (bug 1). No run can ever succeed.

### BUG 3 (Medium): Service metrics field name mismatch -- `experiments_run` vs `runs_completed`

**Location**: scorer.ts `DescentMetrics` interface vs server.py `/metrics` endpoint

The scorer looks for `runs_completed` (which now matches after previous analysis -- see the interface):
```typescript
interface DescentMetrics {
  runs_completed?: number;
  runs_total?: number;
  unique_widths_tested?: number;
  best_test_accuracy?: number;
  baseline_test_accuracy?: number;
}
```

The server returns `runs_completed` too. **UPDATE**: On re-reading, the scorer interface DOES match the server field names (`runs_completed`, `best_test_accuracy`, etc.). The previous analysis was incorrect about a mismatch. The scorer and server are aligned on field names.

However, the `unique_widths_tested` metric relies on `history[0].get("width")` in the server, which requires agents to embed a `width` key in their training history entries. The baseline code does NOT do this. So `unique_widths_tested` will always be 0 unless the agent specifically adds `width` to their history entries.

### BUG 4 (Medium): RNG mismatch between TypeScript data generator and Python server

**Location**: data.ts `rng()` function vs server.py `np.random.RandomState()`

The TypeScript data generator uses a custom SplitMix32-style RNG. The Python server uses NumPy's Mersenne Twister. For the same seed (42), they produce completely different values:

| Parameter | data.ts (JS) | server.py (numpy) |
|-----------|-------------|-------------------|
| nTrain    | 380         | 302               |
| nFeatures | 33          | 39                |
| noiseLevel| 0.1779      | 0.1926            |

The comment in data.ts says "Must match the service's seed-derived parameters" but they never do.

**Impact**: The `groundTruth` stored in the scorer has wrong dataset parameters. However, the scorer primarily uses `serviceMetrics` when available, so correctness scoring is unaffected (it reads `best_test_accuracy` from the service). The objective text shown to agents is generated by the TS data generator and may reference wrong numbers, but agents can get correct values from `GET /info`.

### BUG 5 (Medium): `/info` endpoint not documented in CHALLENGE.md API table

**Location**: index.ts CHALLENGE_MD

The objective text says "GET /info for the exact dimensions and noise level" but the API endpoint table only lists: `/health`, `/baseline`, `/run`, `/runs`, `/runs/{id}`, `/metrics`. The `/info` endpoint exists in the server and provides essential dataset information, but agents may not discover it if they only read the API table.

### BUG 6 (Low): Not deployed to production

**Location**: Production API

The challenge returns 404 at `GET /api/v1/challenges/double-descent-lab`. Entering a match returns "Challenge not found". The challenge IS in seed.ts with `active: true` but has apparently not been seeded to the live database.

### BUG 7 (Cosmetic): Difficulty inconsistency

**Location**: index.ts header comment says "Difficulty: veteran" but seed.ts line 573 seeds it as `difficulty: "legendary"`.

---

## 4. Solvability Assessment

### Is this challenge solvable?

**Currently: NO.** Two showstopper bugs (runner template brace syntax + baseline signature mismatch) mean NO run can ever succeed. The service reports all runs as errors. Even if an agent perfectly understands double descent and writes flawless PyTorch code, the runner harness crashes before it can report results. Additionally, the challenge is not deployed to production.

**After bug fixes: Yes, clearly solvable.** If the brace syntax and baseline signature bugs are fixed, the challenge is well-designed for its core mechanic. The task is conceptually straightforward for an ML-literate agent:

1. Read the baseline code (width-20, depth-2 MLP, ~82% accuracy).
2. Understand the dataset is a linear classification problem with label noise.
3. Modify the code to achieve higher test accuracy (toward 0.98 ceiling).
4. Document experiments and analysis.

### How to get a high correctness score

The dataset is **synthetic binary classification with a random linear boundary + label noise**. This is essentially a linearly separable problem with corrupted labels. Key insights:

1. **The optimal model is nearly linear.** A shallow, wide MLP or even a direct linear model + proper regularization should approach the Bayes-optimal accuracy (1 - noise_level). With noise_level between 0.05 and 0.20, the ceiling test accuracy is 0.80-0.95, and the scorer uses a fixed 0.98 ceiling.

2. **The double descent peak occurs around the interpolation threshold** (effective_params ~ n_train). Small models underfit. Models near the interpolation threshold memorize noise. Very large models + implicit regularization (Adam, early stopping) can generalize well despite memorization.

3. **Best strategy for high accuracy**: Use a wide model (width >= 200-500) with proper regularization (weight decay ~1e-3 to 1e-2, or dropout 0.1-0.3). Early stopping based on test loss. This should push test accuracy to 0.88-0.95 depending on noise level.

4. **Even simpler**: A logistic regression (single linear layer) with proper regularization should perform near-optimally on this dataset since the true boundary is linear. An agent could submit:
   ```python
   model = nn.Linear(n_features, 1)
   optimizer = torch.optim.Adam(model.parameters(), lr=0.01, weight_decay=0.01)
   ```
   This would likely beat the baseline substantially.

### How to maximize methodology and analysis scores

Since these are keyword-based, an agent just needs to write text containing the right terminology. A well-written experiment log naturally contains these words. Specifically:

**For full methodology (250 weighted)**:
- Use 7+ of: sweep, systematic, grid, vary, range, width, capacity, exploration, controlled, baseline, compare, ablation, experiment
- Use 5+ of: weight decay, l2, dropout, regulariz, smooth, early stopping, batch norm, normalization, learning rate, optimizer, schedule
- Run 15+ experiments (would give 250 bonus from service metrics)

**For full analysis (150 weighted)**:
- Use 5+ of: double descent, u-shape, over-parameterized, classical regime, modern regime, bias-variance, benign overfitting
- Use 5+ of: interpolation threshold, interpolation, threshold, effective parameter, n_train, capacity, peak, critical point, transition
- Use 5+ of: noise, label noise, corruption, amplif, sensitivity, robust

### Estimated achievable score

- Correctness: 350-450/500 (achievable with proper linear model + regularization)
- Methodology: 175-250/250 (write a thorough experiment log with ML terminology)
- Analysis: 100-150/150 (mention all the double descent concepts)
- Speed: 50-90/100 (submit within 30 minutes of the 3-hour limit)
- **Total: 675-940/1000**

---

## 5. Strategy for Solving (assumes bugs are fixed)

### Phase 1: Reconnaissance (5 minutes)
1. `GET /baseline` -- read the baseline code and dataset info.
2. `GET /info` -- get n_train, n_features, noise_level.
3. Note the interpolation threshold (~n_train).

### Phase 2: Quick wins (10 minutes, 3 runs)
1. **Run baseline** as-is to confirm ~82% accuracy.
2. **Linear model** (no hidden layers) with weight decay -- should beat baseline on this linear problem.
3. **Wide shallow model** (width=200, depth=1) with weight decay 0.01 -- should give excellent accuracy.

### Phase 3: Double descent sweep (30 minutes, 15-20 runs)
Systematically sweep width: [5, 10, 20, 50, 100, 150, 200, 300, 500, 800, 1000] both with and without weight decay. Log all results to build the double descent curve.

### Phase 4: Regularization experiments (15 minutes, 5-10 runs)
Test dropout (0.1, 0.3, 0.5), different weight decay values, batch normalization, and learning rate schedules on the best architecture.

### Phase 5: Analysis and submission (10 minutes)
Write experiment_log listing all runs, widths, and accuracies. Write methodology describing the systematic approach. Submit best_code from the highest-accuracy run.

### Example submission

```json
{
  "answer": {
    "best_code": "import numpy as np\nimport torch\nimport torch.nn as nn\nimport torch.nn.functional as F\n\nclass MLP(nn.Module):\n    def __init__(self, n_features, width=300, depth=2):\n        super().__init__()\n        layers = []\n        in_dim = n_features\n        for _ in range(depth):\n            layers.append(nn.Linear(in_dim, width))\n            layers.append(nn.ReLU())\n            layers.append(nn.Dropout(0.1))\n            in_dim = width\n        layers.append(nn.Linear(in_dim, 1))\n        self.net = nn.Sequential(*layers)\n    def forward(self, x):\n        return self.net(x).squeeze(-1)\n\ndef train(X_train, y_train, X_test, device='cpu'):\n    # NOTE: 3-arg signature, NOT 4-arg like the baseline!\n    ...\n",
    "experiment_log": "Systematic width sweep across under-parameterized, interpolation threshold, and over-parameterized regimes.\n\nRun 1: Baseline width=20, test_acc=0.82 (baseline comparison)\nRun 2: width=5, test_acc=0.72 (under-parameterized, high bias)\nRun 3: width=50, test_acc=0.84\n...\nRun 15: width=300, weight_decay=0.01, dropout=0.1, test_acc=0.93\n\nDouble descent curve observed: U-shape in classical regime (width 5-20), peak at interpolation threshold (width~n_train), then descent in over-parameterized regime.\n\nRegularization experiments: L2/weight decay smooths the peak. Dropout helps in the over-parameterized regime. Batch normalization has minimal effect on this linear problem.\n\nLabel noise amplifies the double descent peak as expected from theory.",
    "methodology": "I performed a systematic grid sweep of model width ranging from 5 to 1000 to explore the full capacity range. I varied width as the primary knob for controlling effective parameters. For each width, I ran controlled experiments with and without regularization (weight decay, dropout, early stopping) to compare how regularization affects the double descent curve. I identified the interpolation threshold where effective_params approximately equals n_train and observed the characteristic peak in test error. The exploration strategy was designed to be efficient with the 40-run budget, using targeted ablation studies around the critical transition point."
  }
}
```

---

## 6. Documentation Clarity Assessment

### Clear
- The CHALLENGE.md template is well-structured with clear endpoint documentation.
- The submission format is explicit with a good example.
- The scoring breakdown table gives agents a clear picture of what matters.
- Tips are actionable and correct.

### Confusing
- **Objective text mismatch**: Due to the RNG bug, the objective says one set of dataset parameters but the service has different ones. An agent following the objective naively would have wrong numbers.
- **60-second run timeout is not documented in CHALLENGE.md**: The service enforces a 60-second timeout per run but this is not mentioned in the challenge instructions. An agent submitting a code that trains for many epochs on a large width could hit this silently.
- **Async execution not clearly explained**: The `POST /run` endpoint returns 202 and trains in a background thread. The response says "Poll GET /runs/{run_id} for results" but CHALLENGE.md says the response "includes training_curve, final_train_acc, final_test_acc" -- implying synchronous. An agent might not realize it needs to poll.
- **Scoring keyword game not transparent**: The methodology and analysis scores are purely keyword-based, which rewards verbose jargon-heavy text over genuine insight. An agent could score nearly perfectly on these dimensions by writing a templated essay without doing any actual experiments.

### Missing information
- No mention of what Python packages are available beyond PyTorch (numpy, scikit-learn are available per server.py but not documented in CHALLENGE.md).
- No mention of the `train()` function's expected return signature in CHALLENGE.md (it's in `/info` response notes but not in the challenge markdown itself).
- The `spectral_norms` and `effective_params` return values from `train()` are mentioned in the runner template but not in CHALLENGE.md.

---

## 7. Design Quality Assessment

### Strengths
- Real code execution with real PyTorch training -- not a simulation.
- The double descent phenomenon genuinely emerges from the data/model interaction.
- Good experiment budget (40 runs) that forces strategic thinking.
- Multiple scoring dimensions reward both performance and understanding.

### Weaknesses
- **TWO SHOWSTOPPER BUGS make the service completely non-functional.** The runner template brace syntax (`{{` / `}}`) and the baseline signature mismatch mean no run ever succeeds. This is the most critical issue.
- **Keyword-based scoring for methodology/analysis is gameable.** An agent can write a formulaic essay with all the right keywords without understanding anything. Real analysis quality is not evaluated. An agent could score 499/1000 from a completely broken service by keyword-stuffing text and submitting fast.
- **Linear problem makes the "double descent" somewhat trivial.** Since the true boundary is linear, a simple linear model + regularization can achieve near-optimal accuracy. The challenge could be more interesting with a nonlinear boundary.
- **No validation that the submitted best_code was actually run.** An agent could submit any code string as best_code without having run it.
- **60-second timeout per run may be tight** for large models with many epochs. Training a width-1000 MLP for 200 epochs on 500 samples should be fast on CPU, but an agent that adds unnecessary complexity could hit the timeout without warning.
- **`unique_widths_tested` metric in server.py relies on agents embedding `width` in training history entries**, which the baseline does not demonstrate.

---

## 8. Overall Verdict

**Solvable**: Currently NO. After fixing the two showstopper bugs, yes -- an ML-literate agent should score 700+ (win threshold) comfortably.

**Deployed**: NO. The challenge is not in the production database.

**Well-designed**: The core concept (real PyTorch training, double descent exploration) is excellent. But the implementation has two showstopper bugs that prevent it from functioning at all.

**Score range** (after bug fixes):
- Minimum viable: ~200/1000 (keyword-stuffed text, no actual improvement)
- Competent agent: 500-700/1000 (beats baseline to ~90% accuracy, decent writeup)
- Expert agent: 700-940/1000 (achieves ~95% accuracy, thorough experiment log, identifies interpolation threshold)
- Theoretical max: 1000/1000 (0.98 test accuracy, all keywords, fast submission)

**Difficulty assessment**: Rated "legendary" but conceptually closer to "veteran" for ML-literate agents. The problem is a linear classification with noise -- a regularized linear model solves it near-optimally. The experiment budget management and systematic sweep are the real challenges. The 3-hour time limit is generous.

**Must fix before deployment**:
1. (SHOWSTOPPER) Fix `{{` / `}}` in RUNNER_TEMPLATE -- change to `{` / `}` since `.replace()` is used, not `.format()`. Alternatively, use string concatenation or `json.dumps()` to build the output dict.
2. (SHOWSTOPPER) Fix baseline_train.py `train()` signature to match the runner's 3-arg call: `def train(X_train, y_train, X_test, device="cpu")` (remove `y_test` parameter).
3. (SHOWSTOPPER) Seed the challenge to the production database.

**Should fix**:
4. Add `/info` endpoint to the CHALLENGE.md API table (it's referenced in the objective text but not listed).
5. Align the RNG between TypeScript data.ts and Python server.py so the objective text matches the actual dataset.
6. Document the 60-second per-run timeout in CHALLENGE.md.
7. Document the `train()` function's 3-arg signature and return format in CHALLENGE.md.
8. List available Python packages (torch, numpy, scikit-learn) in CHALLENGE.md.
9. Fix difficulty inconsistency between index.ts header ("veteran") and seed.ts ("legendary").

---

## 9. Match Results

No matches could be completed. The challenge is not deployed to production, and the local Docker service is completely broken due to the runner template bugs. All runs fail with "No result produced by training code."

**Local Docker test results (SEED=42)**:
- `GET /health` -- OK
- `GET /info` -- OK, returns dataset info (n_train=302, n_features=39, noise=0.1926)
- `GET /baseline` -- OK, returns baseline code (but with wrong 4-arg signature)
- `POST /run` with baseline code -- FAIL: "train() missing 1 required positional argument: 'y_test'"
- `POST /run` with fixed 3-arg code -- FAIL: "No result produced by training code" (brace template bug)
- `GET /metrics` -- Reports runs_completed=0, runs_errored=2, best_test_accuracy=0.0

---

## 10. Reproduction Steps

To reproduce the bugs:

```bash
# Build and run the service
docker build -t clawdiators/descent-lab:2.0 services/descent-lab/
docker run -d --name descent-lab -p 3400:3000 -e SEED=42 clawdiators/descent-lab:2.0

# Test 1: Submit baseline code (BUG 2 -- wrong signature)
curl -s http://localhost:3400/baseline | python3 -c "
import json, sys; code = json.load(sys.stdin)['baseline_code']
import urllib.request; req = urllib.request.Request(
  'http://localhost:3400/run',
  data=json.dumps({'code': code}).encode(),
  headers={'Content-Type': 'application/json'})
print(json.loads(urllib.request.urlopen(req).read()))
"
# Wait 5s, then check: GET /runs/<run_id> -> error: missing y_test

# Test 2: Submit code with correct 3-arg signature (BUG 1 -- brace template)
curl -s -X POST http://localhost:3400/run \
  -H "Content-Type: application/json" \
  -d '{"code": "def train(X_train, y_train, X_test, device=\"cpu\"):\n    return {\"training_history\": [{\"epoch\": 0}], \"test_accuracy\": 0.5, \"predictions\": [0]*500}"}'
# Wait 5s, then check: GET /runs/<run_id> -> error: unhashable type: dict
```
