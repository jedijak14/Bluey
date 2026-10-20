"""Reproducible CPU training, validation-selected export, then one test evaluation."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time
import numpy as np
from .model import Model, Adam, batch, vocabulary, tokenize


def read_rows(path):
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    if not rows:
        raise ValueError(f"Empty dataset: {path}")
    for row in rows:
        if set(row) != {"question", "answer"} or any(not isinstance(s, str) or not s.strip() for s in row.values()):
            raise ValueError("Each row needs a nonempty question and answer")
        if any(len(tokenize(s)) > 80 for s in row.values()):
            raise ValueError("Starter curriculum rows must have at most 80 tokens per field")
    return rows


def check_splits(splits):
    seen = set()
    for name, rows in splits.items():
        questions = {tuple(tokenize(row["question"])) for row in rows}
        if len(questions) != len(rows) or questions & seen:
            raise ValueError(f"Duplicate questions or split leakage in {name}")
        seen.update(questions)


def evaluate(model, rows, vocab):
    predictions = []
    for row in rows:
        text, stopped = model.generate(row["question"], vocab)
        expected = " ".join(tokenize(row["answer"]))
        correct = stopped and " ".join(tokenize(text)) == expected
        predictions.append({**row, "prediction": text, "ended": stopped, "correct": correct})
    return {"answer_token_loss": model.loss(*batch(rows, vocab)),
            "exact_match": sum(p["correct"] for p in predictions) / len(rows),
            "count": len(rows), "predictions": predictions}


def export(model, vocab, report, path):
    artifact = {"format": "bluey-gru-v1", "vocab": vocab,
                "embedding": model.embedding, "hidden": model.hidden,
                "parameters": {k: {"shape": list(v.shape), "data": np.round(v.ravel(), 8).tolist()}
                               for k, v in model.p.items()}, "report": report}
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(artifact, separators=(",", ":"), allow_nan=False))
    os.replace(temp, path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=Path("training/data"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/starter/model.json"))
    parser.add_argument("--steps", type=int, default=2000)
    parser.add_argument("--defer-test", action="store_true", help="Do not inspect test predictions during model selection")
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--embedding", type=int, default=24)
    parser.add_argument("--hidden", type=int, default=48)
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()
    if not 1 <= args.steps <= 100000 or not 1 <= args.batch_size <= 128 or not 4 <= args.hidden <= 256 or not 4 <= args.embedding <= 128:
        parser.error("Training configuration outside starter limits")
    splits = {name: read_rows(args.data / f"{name}.jsonl") for name in ("train", "validation", "test")}
    check_splits(splits)
    vocab = vocabulary(splits["train"])  # No held-out text in vocabulary construction.
    model, rng = Model(len(vocab), args.embedding, args.hidden, args.seed), np.random.default_rng(args.seed)
    optimizer = Adam(model)
    initial = model.loss(*batch(splits["train"], vocab))
    best, best_params, best_step, curve = float("inf"), None, 0, []
    start = time.monotonic()
    for step in range(1, args.steps + 1):
        selected = [splits["train"][i] for i in rng.integers(len(splits["train"]), size=args.batch_size)]
        loss, grads = model.loss(*batch(selected, vocab), backward=True)
        optimizer.step(model, grads)
        if step == 1 or step % 100 == 0 or step == args.steps:
            val = model.loss(*batch(splits["validation"], vocab))
            curve.append({"step": step, "batch_loss": loss, "validation_loss": val})
            print(json.dumps(curve[-1]), flush=True)
            if val < best:
                best, best_step = val, step
                best_params = {k: v.copy() for k, v in model.p.items()}
    model.p = best_params
    report = {"status": "experimental_not_general_purpose", "initialization": "random; no pretrained weights",
              "training_examples": len(splits["train"]), "seed": args.seed, "steps": args.steps,
              "selected_step": best_step, "parameter_count": sum(v.size for v in model.p.values()),
              "initial_train_loss": initial, "seconds": round(time.monotonic() - start, 2),
              "evaluation_scope": "Held-out wording of the same 32 curriculum facts, NOT unseen knowledge or general intelligence.",
              "dataset_sha256": {name: hashlib.sha256((args.data / f"{name}.jsonl").read_bytes()).hexdigest() for name in splits},
              "curve": curve, "train": evaluate(model, splits["train"], vocab),
              "validation": evaluate(model, splits["validation"], vocab),
              "test": None if args.defer_test else evaluate(model, splits["test"], vocab)}
    report["out_of_scope_probes"] = [{"question": q, "prediction": model.generate(q, vocab)[0]} for q in
        ["What is the weather today?", "What is seventeen times nineteen?", "Who won the latest election?", "Should I take this medicine?"]]
    export(model, vocab, report, args.output)
    args.output.with_suffix(".report.json").write_text(json.dumps(report, indent=2, allow_nan=False))
    print(json.dumps({"output": str(args.output), "test_exact_match": report["test"]["exact_match"] if report["test"] else None, "selected_step": best_step}), flush=True)


if __name__ == "__main__":
    main()
