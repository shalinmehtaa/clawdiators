"""
Data preparation for autoresearch challenge.

Downloads/generates small text corpora and writes them as binary files
(raw bytes) for byte-level tokenization.

Each corpus is split 90/10 into train/val.

Usage:
    python build_data.py              # prepare all corpora
    python build_data.py shakespeare  # prepare one corpus

Corpora are stored in data/{corpus_name}/ as train.bin and val.bin.
"""

import os
import sys
import urllib.request

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# ---------------------------------------------------------------------------
# Corpus sources
# ---------------------------------------------------------------------------

CORPORA = {
    "shakespeare": {
        "url": "https://raw.githubusercontent.com/karpathy/char-rnn/master/data/tinyshakespeare/input.txt",
        "description": "Complete works of Shakespeare (~1.1MB)",
    },
    "python": {
        "generate": True,
        "description": "Python code snippets (~300KB, procedurally generated)",
    },
    "wikipedia": {
        "url": "https://raw.githubusercontent.com/karpathy/nanoGPT/master/data/shakespeare_char/input.txt",
        "fallback_generate": True,
        "description": "Wikipedia-style prose (~300KB)",
    },
    "scientific": {
        "generate": True,
        "description": "Scientific abstract-style text (~300KB)",
    },
    "legal": {
        "generate": True,
        "description": "Legal/financial document-style text (~300KB)",
    },
}


# ---------------------------------------------------------------------------
# Text generators for corpora that can't be downloaded
# ---------------------------------------------------------------------------

def _generate_python_corpus(target_bytes: int = 300_000) -> str:
    """Generate realistic Python code snippets."""
    import random
    rng = random.Random(42)

    snippets = []
    funcs = ["process_data", "validate_input", "transform_batch", "compute_stats",
             "filter_records", "merge_results", "parse_config", "build_index",
             "encode_features", "decode_output", "normalize_scores", "aggregate_metrics"]
    types = ["list", "dict", "str", "int", "float", "bool", "tuple", "set"]
    vars_ = ["data", "result", "items", "values", "output", "batch", "config",
             "params", "buffer", "cache", "state", "context", "records", "entries"]

    while len("\n\n".join(snippets)) < target_bytes:
        fname = rng.choice(funcs) + "_" + str(rng.randint(1, 999))
        nargs = rng.randint(1, 4)
        args = [f"{rng.choice(vars_)}_{i}: {rng.choice(types)}" for i in range(nargs)]
        ret_type = rng.choice(types)

        lines = [f'def {fname}({", ".join(args)}) -> {ret_type}:']
        lines.append(f'    """Process {rng.choice(vars_)} and return {ret_type}."""')

        body_lines = rng.randint(3, 15)
        for _ in range(body_lines):
            var = rng.choice(vars_) + "_" + str(rng.randint(0, 9))
            op = rng.choice([
                f"    {var} = [{rng.choice(vars_)}[i] for i in range({rng.randint(1, 100)})]",
                f"    {var} = {{k: v for k, v in {rng.choice(vars_)}.items()}}",
                f"    if {rng.choice(vars_)} is not None:",
                f"        {var} = {rng.choice(vars_)}.{rng.choice(['append', 'extend', 'update', 'pop'])}({rng.choice(vars_)})",
                f"    for item in {rng.choice(vars_)}:",
                f"        {var} = item.{rng.choice(['strip', 'lower', 'split', 'encode'])}()",
                f"    try:",
                f"        {var} = {rng.choice(types)}({rng.choice(vars_)})",
                f"    except (ValueError, TypeError, KeyError) as e:",
                f"        raise RuntimeError(f\"Failed: {{e}}\")",
                f"    {var} = len({rng.choice(vars_)}) + {rng.randint(1, 1000)}",
                f"    assert isinstance({var}, {rng.choice(types)}), f\"Expected {rng.choice(types)}\"",
            ])
            lines.append(op)

        lines.append(f"    return {rng.choice(vars_)}")
        snippets.append("\n".join(lines))

    return "\n\n\n".join(snippets)[:target_bytes]


def _generate_scientific_corpus(target_bytes: int = 300_000) -> str:
    """Generate scientific abstract-style text."""
    import random
    rng = random.Random(43)

    fields = ["neural networks", "optimization", "gradient descent", "transformers",
              "attention mechanisms", "language models", "representation learning",
              "reinforcement learning", "generative models", "contrastive learning"]
    methods = ["We propose", "We introduce", "We present", "This paper describes",
               "We develop", "We analyze", "We investigate", "We demonstrate"]
    results = ["Our method achieves", "Experiments show", "Results demonstrate",
               "We observe", "Analysis reveals", "Empirical evaluation confirms"]
    metrics = ["accuracy", "F1 score", "BLEU score", "perplexity", "loss",
               "convergence rate", "sample efficiency", "computational cost"]

    paragraphs = []
    while len("\n\n".join(paragraphs)) < target_bytes:
        title = f"On the {rng.choice(['Convergence', 'Generalization', 'Optimization', 'Scalability', 'Efficiency'])} of {rng.choice(fields).title()}"
        abstract = (
            f"{title}\n\n"
            f"{rng.choice(methods)} a novel approach to {rng.choice(fields)} "
            f"that addresses the fundamental challenge of {rng.choice(['scalability', 'efficiency', 'generalization', 'stability'])}. "
            f"Our framework leverages {rng.choice(fields)} combined with "
            f"{rng.choice(['stochastic', 'variational', 'adversarial', 'contrastive'])} "
            f"{rng.choice(['training', 'optimization', 'regularization', 'inference'])}. "
            f"{rng.choice(results)} a {rng.uniform(1, 30):.1f}% improvement in {rng.choice(metrics)} "
            f"compared to {rng.choice(['baseline', 'state-of-the-art', 'previous work', 'standard approaches'])}. "
            f"We evaluate on {rng.randint(2, 8)} benchmark datasets and find consistent improvements "
            f"across all {rng.choice(metrics)} measurements. "
            f"The proposed method requires {rng.choice(['significantly fewer', 'comparable', 'marginally more'])} "
            f"computational resources while maintaining {rng.choice(['superior', 'competitive', 'state-of-the-art'])} performance."
        )
        paragraphs.append(abstract)

    return "\n\n".join(paragraphs)[:target_bytes]


def _generate_legal_corpus(target_bytes: int = 300_000) -> str:
    """Generate legal/financial document-style text."""
    import random
    rng = random.Random(44)

    sections = []
    section_num = 1

    while len("\n\n".join(sections)) < target_bytes:
        sec_type = rng.choice(["ARTICLE", "SECTION", "CLAUSE", "PROVISION"])
        topic = rng.choice([
            "Representations and Warranties", "Indemnification", "Limitation of Liability",
            "Intellectual Property Rights", "Confidentiality", "Termination",
            "Governing Law", "Force Majeure", "Assignment", "Notices",
            "Dispute Resolution", "Compliance", "Data Protection", "Insurance",
        ])
        party_a = rng.choice(["the Company", "the Licensor", "the Service Provider", "the Vendor"])
        party_b = rng.choice(["the Client", "the Licensee", "the Recipient", "the Purchaser"])

        section = (
            f"{sec_type} {section_num}. {topic}\n\n"
            f"{section_num}.1 {party_a} hereby represents and warrants that all information "
            f"provided pursuant to this Agreement is true, accurate, and complete in all "
            f"material respects as of the date hereof and as of each subsequent reporting date.\n\n"
            f"{section_num}.2 {party_b} acknowledges and agrees that {party_a} shall not be "
            f"liable for any indirect, incidental, special, consequential, or punitive damages, "
            f"including but not limited to loss of profits, data, business opportunities, or "
            f"goodwill, arising out of or in connection with this Agreement, regardless of the "
            f"theory of liability, whether in contract, tort, strict liability, or otherwise.\n\n"
            f"{section_num}.3 Notwithstanding anything to the contrary contained herein, the "
            f"aggregate liability of {party_a} under this Agreement shall not exceed the total "
            f"fees paid by {party_b} during the twelve ({rng.randint(6, 24)}) month period "
            f"immediately preceding the event giving rise to such liability.\n\n"
            f"{section_num}.4 The obligations set forth in this {sec_type} shall survive the "
            f"expiration or termination of this Agreement for a period of {rng.randint(1, 7)} "
            f"({rng.choice(['one', 'two', 'three', 'four', 'five', 'six', 'seven'])}) years."
        )
        sections.append(section)
        section_num += 1

    return "\n\n".join(sections)[:target_bytes]


def _generate_wikipedia_corpus(target_bytes: int = 300_000) -> str:
    """Generate Wikipedia-style factual prose."""
    import random
    rng = random.Random(45)

    topics = [
        ("The history of computing", "computers", "technology", "digital"),
        ("Marine biology", "ocean", "species", "ecosystem"),
        ("Classical music", "composers", "orchestral", "symphony"),
        ("Ancient civilizations", "empire", "archaeological", "cultural"),
        ("Modern physics", "quantum", "particle", "theoretical"),
        ("Agricultural science", "crop", "soil", "cultivation"),
        ("Urban planning", "city", "infrastructure", "development"),
        ("Linguistic theory", "language", "syntax", "morphology"),
    ]

    articles = []
    while len("\n\n".join(articles)) < target_bytes:
        title, noun, adj, context = rng.choice(topics)
        year = rng.randint(1200, 2024)
        pop = rng.randint(1000, 10_000_000)

        article = (
            f"== {title} ==\n\n"
            f"{title} encompasses the study and development of {noun} across "
            f"multiple disciplines and historical periods. The field emerged in "
            f"the {rng.choice(['early', 'mid', 'late'])} {year // 100}th century "
            f"as scholars began to systematically investigate the {adj} properties "
            f"of {noun}.\n\n"
            f"Research in this area has produced significant advances in {context} "
            f"applications, with over {pop:,} documented instances worldwide. "
            f"The International Association for {title.split()[-1]} Studies, founded "
            f"in {year}, coordinates research efforts across {rng.randint(20, 150)} "
            f"countries.\n\n"
            f"Notable contributions include the development of {adj} {noun} theory "
            f"by researchers at {rng.choice(['Cambridge', 'MIT', 'Stanford', 'Oxford', 'ETH Zurich', 'Tokyo'])} "
            f"University, which demonstrated that {noun} exhibit {rng.choice(['emergent', 'complex', 'hierarchical', 'distributed'])} "
            f"behavior under controlled conditions. This finding has implications for "
            f"{rng.choice(['medicine', 'engineering', 'education', 'environmental science', 'economics'])}.\n\n"
            f"=== Current Research ===\n\n"
            f"Contemporary studies focus on the intersection of {context} and "
            f"{rng.choice(['artificial intelligence', 'sustainability', 'biotechnology', 'nanotechnology'])}. "
            f"A {year + rng.randint(0, 5)} meta-analysis of {rng.randint(50, 500)} studies "
            f"found that {adj} approaches outperformed traditional methods by "
            f"{rng.uniform(5, 40):.1f}% on standardized benchmarks."
        )
        articles.append(article)

    return "\n\n".join(articles)[:target_bytes]


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build_corpus(name: str):
    """Download or generate a corpus and write train/val splits."""
    spec = CORPORA[name]
    out_dir = os.path.join(DATA_DIR, name)
    os.makedirs(out_dir, exist_ok=True)

    train_path = os.path.join(out_dir, "train.bin")
    val_path = os.path.join(out_dir, "val.bin")

    if os.path.exists(train_path) and os.path.exists(val_path):
        train_size = os.path.getsize(train_path)
        val_size = os.path.getsize(val_path)
        print(f"  {name}: already exists (train={train_size:,}B, val={val_size:,}B)")
        return

    print(f"  {name}: preparing...")

    # Get text
    text = None
    if "url" in spec:
        try:
            print(f"    Downloading from {spec['url']}...")
            with urllib.request.urlopen(spec["url"], timeout=30) as resp:
                text = resp.read().decode("utf-8")
            print(f"    Downloaded {len(text):,} chars")
        except Exception as e:
            print(f"    Download failed: {e}")
            if spec.get("fallback_generate"):
                text = None
            else:
                raise

    if text is None:
        # Generate
        generators = {
            "python": _generate_python_corpus,
            "scientific": _generate_scientific_corpus,
            "legal": _generate_legal_corpus,
            "wikipedia": _generate_wikipedia_corpus,
        }
        gen = generators.get(name)
        if gen is None:
            raise ValueError(f"No generator for corpus '{name}'")
        text = gen()
        print(f"    Generated {len(text):,} chars")

    # Convert to bytes (UTF-8)
    raw = text.encode("utf-8")

    # Split 90/10
    split_point = int(len(raw) * 0.9)
    train_data = raw[:split_point]
    val_data = raw[split_point:]

    # Write binary files
    with open(train_path, "wb") as f:
        f.write(train_data)
    with open(val_path, "wb") as f:
        f.write(val_data)

    print(f"    Written: train={len(train_data):,}B, val={len(val_data):,}B")


def main():
    names = sys.argv[1:] if len(sys.argv) > 1 else list(CORPORA.keys())

    print(f"Building {len(names)} corpora in {DATA_DIR}/")
    print()

    for name in names:
        if name not in CORPORA:
            print(f"  Unknown corpus: {name}")
            continue
        build_corpus(name)

    print()
    print("Done.")


if __name__ == "__main__":
    main()
