"""Fixed small CPU candidate search; test set evaluated only after selection.

All models are randomly initialized. Validation selects a checkpoint within a
run (loss) and a candidate across runs (exact match, then loss). The test set is
related curriculum paraphrases, never an independent intelligence benchmark.
"""
import json
from pathlib import Path
import subprocess
import sys
import numpy as np
from training.bluey_starter.model import Model
from training.bluey_starter.train import export, evaluate, read_rows

if __name__ == "__main__":
    candidates = [(24, 48, 17), (32, 80, 29), (40, 112, 41)]
    runs = []
    for embedding, hidden, seed in candidates:
        output = Path(f"artifacts/starter/candidate-{hidden}.json")
        subprocess.run([sys.executable, "-m", "training.bluey_starter.train", "--steps", "2000",
                        "--embedding", str(embedding), "--hidden", str(hidden), "--seed", str(seed),
                        "--output", str(output), "--defer-test"], check=True)
        artifact = json.loads(output.read_text())
        runs.append(artifact)
    winner = min(runs, key=lambda r: (-r["report"]["validation"]["exact_match"], r["report"]["validation"]["answer_token_loss"]))
    model = Model(len(winner["vocab"]), winner["embedding"], winner["hidden"])
    model.p = {k: np.array(v["data"]).reshape(v["shape"]) for k, v in winner["parameters"].items()}
    report = winner["report"]
    report["test"] = evaluate(model, read_rows(Path("training/data/test.jsonl")), winner["vocab"])
    report["selection"] = {
        "rule": "Validation exact match, then validation loss. No test-based selection.",
        "candidates": [{"embedding": r["embedding"], "hidden": r["hidden"], "seed": r["report"]["seed"],
                        "steps": r["report"]["steps"], "selected_step": r["report"]["selected_step"],
                        "validation_exact_match": r["report"]["validation"]["exact_match"],
                        "validation_loss": r["report"]["validation"]["answer_token_loss"]} for r in runs],
    }
    output = Path("public/models/bluey-starter.json")
    export(model, winner["vocab"], report, output)
    output.with_suffix(".report.json").write_text(json.dumps(report, indent=2, allow_nan=False))
    print(json.dumps({"selected_hidden": winner["hidden"], "validation": report["validation"]["exact_match"],
                      "test": report["test"]["exact_match"], "output": str(output)}), flush=True)
