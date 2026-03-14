"""
Fitness Lab — HTTP service for protein fitness landscape challenge.

Provides a deterministic protein fitness landscape oracle that agents query
to navigate and find high-fitness variants. The landscape features additive
effects, pairwise epistasis, and nonlinear hotspot interactions, creating
a rugged surface with few high-fitness peaks.

Agents submit variant queries (e.g. "M1A/K5R") and receive fitness scores.
Budget: 300 total queries. Good ML-guided search reaches ~2.0-3.0 fitness.
"""

from __future__ import annotations

import os
import time
import hashlib
import textwrap

import numpy as np
from flask import Flask, request, jsonify

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SEED = int(os.environ.get("SEED", "42"))
MATCH_ID = os.environ.get("MATCH_ID", "local")
MAX_QUERIES = int(os.environ.get("MAX_QUERIES", "300"))
MAX_VARIANTS_PER_QUERY = 20
MATCH_TIME_LIMIT = int(os.environ.get("MATCH_TIME_LIMIT", "10800"))  # 3 hours

MATCH_START_TIME = time.time()

AMINO_ACIDS = list("ACDEFGHIKLMNPQRSTVWY")
PROTEIN_LENGTH = 100

# ---------------------------------------------------------------------------
# Landscape State (populated on startup)
# ---------------------------------------------------------------------------

wild_type_sequence: list[str] = []
additive_effects: np.ndarray = None          # shape (PROTEIN_LENGTH, 20)
epistasis_pairs: list[dict] = []             # ~50 pairwise interactions
hotspots: list[dict] = []                    # ~5 triple-mutant hotspots
global_best_estimate: float = 0.0

# ---------------------------------------------------------------------------
# Query tracking
# ---------------------------------------------------------------------------

query_log: list[dict] = []     # [{variants: [...], results: [...], timestamp}]
queries_used: int = 0
best_fitness_found: float = 1.0
unique_positions_explored: set[int] = set()
multi_mutant_count: int = 0
best_found_at_query: int = 0


# ---------------------------------------------------------------------------
# Landscape Generation
# ---------------------------------------------------------------------------

def generate_landscape():
    """Build the full fitness landscape deterministically from SEED."""
    global wild_type_sequence, additive_effects, epistasis_pairs, hotspots
    global global_best_estimate

    rng = np.random.default_rng(SEED)

    # --- Wild-type sequence ---
    wild_type_sequence.clear()
    for _ in range(PROTEIN_LENGTH):
        wild_type_sequence.append(AMINO_ACIDS[rng.integers(0, 20)])

    # --- Additive effects ---
    # Each (position, amino_acid) pair has an additive fitness effect.
    # Wild-type amino acid at each position has effect 0 by definition.
    # Most mutations are slightly deleterious; a few are beneficial.
    raw = rng.normal(loc=-0.03, scale=0.08, size=(PROTEIN_LENGTH, 20))

    # Zero out the wild-type amino acid effect at each position
    for pos in range(PROTEIN_LENGTH):
        wt_idx = AMINO_ACIDS.index(wild_type_sequence[pos])
        raw[pos, wt_idx] = 0.0

    # Sprinkle ~15 strongly beneficial mutations across the landscape
    beneficial_count = 10 + rng.integers(0, 11)  # 10-20
    for _ in range(beneficial_count):
        pos = rng.integers(0, PROTEIN_LENGTH)
        aa_idx = rng.integers(0, 20)
        # Avoid overwriting wild-type
        wt_idx = AMINO_ACIDS.index(wild_type_sequence[pos])
        if aa_idx == wt_idx:
            aa_idx = (aa_idx + 1) % 20
        raw[pos, aa_idx] = rng.uniform(0.05, 0.25)

    additive_effects = raw

    # --- Pairwise epistasis ---
    # ~50 pairs of positions that interact non-additively
    epistasis_pairs.clear()
    n_pairs = 45 + rng.integers(0, 11)  # 45-55
    used_pairs = set()
    for _ in range(n_pairs):
        while True:
            p1, p2 = sorted(rng.integers(0, PROTEIN_LENGTH, size=2))
            if p1 != p2 and (p1, p2) not in used_pairs:
                used_pairs.add((p1, p2))
                break
        # Pick specific amino acid mutations that interact
        aa1_idx = rng.integers(0, 20)
        aa2_idx = rng.integers(0, 20)
        # Effect magnitude: can be positive (synergy) or negative (antagonism)
        effect = rng.normal(loc=0.0, scale=0.15)
        epistasis_pairs.append({
            "pos1": int(p1),
            "pos2": int(p2),
            "aa1": AMINO_ACIDS[aa1_idx],
            "aa2": AMINO_ACIDS[aa2_idx],
            "effect": float(effect),
        })

    # --- Hotspot triple interactions ---
    # ~5 combinations of 3 positions with strong nonlinear effects
    hotspots.clear()
    n_hotspots = 4 + rng.integers(0, 3)  # 4-6
    for _ in range(n_hotspots):
        positions = sorted(rng.choice(PROTEIN_LENGTH, size=3, replace=False).tolist())
        aas = [AMINO_ACIDS[rng.integers(0, 20)] for _ in range(3)]
        # Strong effect, biased positive so global optimum is reachable
        effect = float(rng.choice([-1, 1]) * rng.uniform(0.3, 0.8))
        hotspots.append({
            "positions": positions,
            "amino_acids": aas,
            "effect": effect,
        })

    # --- Estimate global best ---
    # Monte Carlo sampling to get a rough upper bound on fitness
    global_best_estimate = _estimate_global_best(rng)


def _estimate_global_best(rng: np.random.Generator) -> float:
    """Estimate the best fitness achievable within the query budget.

    With 300 queries, an agent can fully scan ~15 positions (15*19=285)
    and has 15 queries left for combinations. The estimate uses the top-12
    most beneficial positions to reflect a realistic but ambitious target.
    """
    # Find the best mutation gain at each position
    position_gains = []
    for pos in range(PROTEIN_LENGTH):
        wt_idx = AMINO_ACIDS.index(wild_type_sequence[pos])
        best_aa_idx = int(np.argmax(additive_effects[pos]))
        # Skip positions where best is the wild-type itself
        if best_aa_idx == wt_idx:
            # Check second-best
            effects = additive_effects[pos].copy()
            effects[wt_idx] = -999
            best_aa_idx = int(np.argmax(effects))
        gain = additive_effects[pos, best_aa_idx] - additive_effects[pos, wt_idx]
        if gain > 0:
            position_gains.append((gain, pos, AMINO_ACIDS[best_aa_idx]))

    # Sort by gain (descending) and take top-12 positions
    position_gains.sort(reverse=True)
    top_n = min(12, len(position_gains))
    top_positions = position_gains[:top_n]

    # Build variant from top positions and score it
    greedy_variant = []
    for _gain, pos, aa in top_positions:
        wt_aa = wild_type_sequence[pos]
        greedy_variant.append(f"{wt_aa}{pos + 1}{aa}")

    try:
        greedy_fitness = _compute_fitness(greedy_variant, add_noise=False)
    except Exception:
        greedy_fitness = 1.0

    # Also sample combinations from the top-20 beneficial positions
    top_20 = [p for _, p, _ in position_gains[:min(20, len(position_gains))]]
    best = greedy_fitness
    for _ in range(2000):
        n_muts = rng.integers(3, min(12, len(top_20)) + 1)
        positions = rng.choice(top_20, size=n_muts, replace=False)
        variant = []
        for pos in positions:
            wt_aa = wild_type_sequence[pos]
            non_wt = [aa for aa in AMINO_ACIDS if aa != wt_aa]
            mut_aa = non_wt[rng.integers(0, len(non_wt))]
            variant.append(f"{wt_aa}{pos + 1}{mut_aa}")
        try:
            f = _compute_fitness(variant, add_noise=False)
        except (ValueError, Exception):
            continue
        if f > best:
            best = f

    return round(best, 4)


# ---------------------------------------------------------------------------
# Fitness Computation
# ---------------------------------------------------------------------------

def _parse_mutation(mutation_str: str) -> tuple[str, int, str]:
    """Parse 'M1A' → (wt_aa='M', position=0 (0-indexed), mut_aa='A')."""
    mutation_str = mutation_str.strip()
    if len(mutation_str) < 3:
        raise ValueError(f"Invalid mutation format: '{mutation_str}'")
    wt_aa = mutation_str[0].upper()
    mut_aa = mutation_str[-1].upper()
    try:
        position_1indexed = int(mutation_str[1:-1])
    except ValueError:
        raise ValueError(f"Invalid position in mutation: '{mutation_str}'")
    position = position_1indexed - 1  # convert to 0-indexed
    if position < 0 or position >= PROTEIN_LENGTH:
        raise ValueError(
            f"Position {position_1indexed} out of range (1-{PROTEIN_LENGTH})"
        )
    if wt_aa not in AMINO_ACIDS:
        raise ValueError(f"Unknown amino acid: '{wt_aa}'")
    if mut_aa not in AMINO_ACIDS:
        raise ValueError(f"Unknown amino acid: '{mut_aa}'")
    actual_wt = wild_type_sequence[position]
    if wt_aa != actual_wt:
        raise ValueError(
            f"Wild-type mismatch at position {position_1indexed}: "
            f"expected '{actual_wt}', got '{wt_aa}'"
        )
    if mut_aa == wt_aa:
        raise ValueError(
            f"Mutation '{mutation_str}' is same as wild-type at position "
            f"{position_1indexed}"
        )
    return wt_aa, position, mut_aa


def _compute_fitness(
    mutation_strs: list[str], add_noise: bool = True
) -> float:
    """Compute fitness for a variant defined by a list of mutation strings."""
    if not mutation_strs:
        return 1.0  # wild-type

    mutations = []
    positions_seen = set()
    for ms in mutation_strs:
        wt_aa, pos, mut_aa = _parse_mutation(ms)
        if pos in positions_seen:
            raise ValueError(
                f"Duplicate position {pos + 1} in variant"
            )
        positions_seen.add(pos)
        mutations.append((pos, mut_aa))

    fitness = 1.0

    # Additive effects
    for pos, mut_aa in mutations:
        aa_idx = AMINO_ACIDS.index(mut_aa)
        fitness += additive_effects[pos, aa_idx]

    # Pairwise epistasis
    mut_dict = {pos: aa for pos, aa in mutations}
    for ep in epistasis_pairs:
        p1, p2 = ep["pos1"], ep["pos2"]
        if p1 in mut_dict and p2 in mut_dict:
            if mut_dict[p1] == ep["aa1"] and mut_dict[p2] == ep["aa2"]:
                fitness += ep["effect"]

    # Hotspot triple interactions
    for hs in hotspots:
        positions = hs["positions"]
        aas = hs["amino_acids"]
        if all(
            p in mut_dict and mut_dict[p] == aa
            for p, aa in zip(positions, aas)
        ):
            fitness += hs["effect"]

    # Small noise for realism (deterministic per variant via hash)
    if add_noise:
        variant_key = "/".join(
            f"{wild_type_sequence[p]}{p + 1}{a}" for p, a in sorted(mutations)
        )
        h = hashlib.sha256(
            f"{SEED}:{variant_key}".encode()
        ).hexdigest()[:8]
        noise = (int(h, 16) / 0xFFFFFFFF - 0.5) * 0.02  # ±0.01
        fitness += noise

    return round(fitness, 6)


# ---------------------------------------------------------------------------
# Time check
# ---------------------------------------------------------------------------

def _check_time_limit():
    """Return error response if match time has expired, else None."""
    elapsed = time.time() - MATCH_START_TIME
    if elapsed > MATCH_TIME_LIMIT:
        return jsonify({
            "error": "match_time_expired",
            "message": f"Match time limit of {MATCH_TIME_LIMIT}s exceeded.",
            "elapsed": round(elapsed, 1),
        }), 400
    return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "fitness-lab"})


@app.route("/info", methods=["GET"])
def info():
    wt_seq = "".join(wild_type_sequence)
    return jsonify({
        "protein": {
            "name": "Synthetic Fitness Protein",
            "function": (
                "A computationally generated protein with a rugged fitness "
                "landscape. The landscape includes additive single-mutation "
                "effects, pairwise epistatic interactions between ~50 pairs "
                "of positions, and ~5 nonlinear hotspot interactions among "
                "triples of positions. Navigation requires systematic "
                "exploration and combinatorial reasoning."
            ),
            "length": PROTEIN_LENGTH,
            "wild_type_sequence": wt_seq,
            "wild_type_fitness": 1.0,
        },
        "amino_acids": AMINO_ACIDS,
        "variant_format": (
            "Single: '{WT}{POS}{MUT}' e.g. 'M1A'. "
            "Multi: slash-separated e.g. 'M1A/K5R/L10W'. "
            "Positions are 1-indexed."
        ),
        "query_budget": MAX_QUERIES,
        "max_variants_per_query": MAX_VARIANTS_PER_QUERY,
        "queries_used": queries_used,
    })


@app.route("/baseline", methods=["GET"])
def baseline():
    """Return baseline exploration code: single-point mutation scan of first 15 positions."""
    wt_seq = "".join(wild_type_sequence)
    code = textwrap.dedent(f"""\
    # Baseline exploration: single-point mutation scan of positions 1-15.
    # This scans 15 positions x 19 mutations = 285 variants total (285 queries),
    # covering only the first 15 positions. Budget-intensive! Plan accordingly.
    #
    # Wild-type sequence (first 15 residues): {wt_seq[:15]}
    # Wild-type fitness: 1.0

    import requests

    SERVICE_URL = "http://localhost:3000"
    AMINO_ACIDS = {AMINO_ACIDS!r}
    WT_SEQ = "{wt_seq}"

    results = {{}}

    for pos in range(15):  # positions 1-15 (0-indexed: 0-14)
        wt_aa = WT_SEQ[pos]
        variants = []
        for aa in AMINO_ACIDS:
            if aa != wt_aa:
                variants.append(f"{{wt_aa}}{{pos + 1}}{{aa}}")
        resp = requests.post(
            f"{{SERVICE_URL}}/query",
            json={{"variants": variants}},
        )
        data = resp.json()
        for v, score in zip(variants, data["results"]):
            results[v] = score["fitness"]

    # Sort by fitness descending
    ranked = sorted(results.items(), key=lambda x: x[1], reverse=True)
    print("Top 10 single mutants (positions 1-15):")
    for variant, fitness in ranked[:10]:
        print(f"  {{variant}}: {{fitness:.4f}}")
    """)
    return jsonify({"code": code, "language": "python"})


@app.route("/query", methods=["POST"])
def query():
    global queries_used, best_fitness_found, multi_mutant_count, best_found_at_query

    time_err = _check_time_limit()
    if time_err:
        return time_err

    body = request.get_json(silent=True)
    if not body or "variants" not in body:
        return jsonify({
            "error": "bad_request",
            "message": "Request body must include 'variants' array.",
        }), 400

    variants = body["variants"]
    if not isinstance(variants, list):
        return jsonify({
            "error": "bad_request",
            "message": "'variants' must be an array of strings.",
        }), 400

    if len(variants) == 0:
        return jsonify({
            "error": "bad_request",
            "message": "'variants' array must not be empty.",
        }), 400

    if len(variants) > MAX_VARIANTS_PER_QUERY:
        return jsonify({
            "error": "bad_request",
            "message": (
                f"Max {MAX_VARIANTS_PER_QUERY} variants per query. "
                f"Got {len(variants)}."
            ),
        }), 400

    remaining = MAX_QUERIES - queries_used
    if remaining <= 0:
        return jsonify({
            "error": "budget_exhausted",
            "message": "All query budget has been used.",
            "queries_used": queries_used,
            "max_queries": MAX_QUERIES,
        }), 400

    if len(variants) > remaining:
        return jsonify({
            "error": "budget_exceeded",
            "message": (
                f"Only {remaining} queries remaining. "
                f"Requested {len(variants)}."
            ),
            "queries_used": queries_used,
            "remaining": remaining,
            "max_queries": MAX_QUERIES,
        }), 400

    results = []
    for variant_str in variants:
        if not isinstance(variant_str, str):
            results.append({
                "variant": str(variant_str),
                "error": "Variant must be a string.",
            })
            queries_used += 1
            continue

        variant_str = variant_str.strip()
        mutation_strs = [m.strip() for m in variant_str.split("/") if m.strip()]

        try:
            fitness = _compute_fitness(mutation_strs)
            # Track metrics
            for ms in mutation_strs:
                _, pos, _ = _parse_mutation(ms)
                unique_positions_explored.add(pos)
            if len(mutation_strs) > 1:
                multi_mutant_count += 1
            if fitness > best_fitness_found:
                best_fitness_found = fitness
                best_found_at_query = queries_used + 1  # 1-indexed

            results.append({
                "variant": variant_str,
                "fitness": fitness,
                "num_mutations": len(mutation_strs),
            })
        except ValueError as e:
            results.append({
                "variant": variant_str,
                "error": str(e),
            })

        queries_used += 1

    query_log.append({
        "query_number": len(query_log) + 1,
        "variants": variants,
        "results": results,
        "timestamp": round(time.time() - MATCH_START_TIME, 2),
    })

    return jsonify({
        "results": results,
        "queries_used": queries_used,
        "remaining": MAX_QUERIES - queries_used,
    })


@app.route("/queries", methods=["GET"])
def queries():
    return jsonify({
        "queries": query_log,
        "queries_used": queries_used,
        "remaining": MAX_QUERIES - queries_used,
    })


@app.route("/metrics", methods=["GET"])
def metrics():
    elapsed = round(time.time() - MATCH_START_TIME, 2)
    return jsonify({
        "queries_used": queries_used,
        "max_queries": MAX_QUERIES,
        "remaining": MAX_QUERIES - queries_used,
        "best_fitness": best_fitness_found,
        "wild_type_fitness": 1.0,
        "improvement_over_wt": round(best_fitness_found - 1.0, 6),
        "unique_positions_explored": len(unique_positions_explored),
        "total_positions": PROTEIN_LENGTH,
        "position_coverage": round(
            len(unique_positions_explored) / PROTEIN_LENGTH, 4
        ),
        "multi_mutant_count": multi_mutant_count,
        "global_best_fitness": global_best_estimate,
        "best_found_at_query": best_found_at_query,
        "total_variants_queried": queries_used,
        "elapsed_seconds": elapsed,
        "time_remaining": max(0, MATCH_TIME_LIMIT - elapsed),
    })


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print(f"[fitness-lab] Generating landscape with SEED={SEED}")
    generate_landscape()
    wt_seq = "".join(wild_type_sequence)
    print(f"[fitness-lab] Wild-type sequence: {wt_seq[:30]}...")
    print(f"[fitness-lab] Estimated global best: ~{global_best_estimate:.4f}")
    print(f"[fitness-lab] Epistasis pairs: {len(epistasis_pairs)}")
    print(f"[fitness-lab] Hotspots: {len(hotspots)}")
    print(f"[fitness-lab] Query budget: {MAX_QUERIES}")

    port = int(os.environ.get("PORT", "3000"))
    print(f"[fitness-lab] Listening on :{port}")
    app.run(host="0.0.0.0", port=port)
