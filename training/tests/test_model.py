import json
import numpy as np
import pytest
from training.bluey_starter.model import Model, Adam, batch, vocabulary, tokenize
from training.bluey_starter.train import check_splits, export, read_rows

ROWS = [{"question": "what is bluey?", "answer": "an assistant."},
        {"question": "what is ice?", "answer": "frozen water."}]


def test_gradients_match_finite_differences():
    vocab = vocabulary(ROWS)
    model = Model(len(vocab), embedding=4, hidden=5)
    data = batch(ROWS, vocab)
    loss, grads = model.loss(*data, backward=True)
    assert np.isfinite(loss)
    rng = np.random.default_rng(5)
    for name, value in model.p.items():
        for _ in range(4):
            idx = tuple(rng.integers(n) for n in value.shape)
            old, eps = value[idx], 1e-5
            value[idx] = old + eps
            high = model.loss(*data)
            value[idx] = old - eps
            low = model.loss(*data)
            value[idx] = old
            assert grads[name][idx] == pytest.approx((high-low)/(2*eps), abs=2e-7, rel=2e-4), name


def test_training_actually_changes_weights_and_reduces_loss():
    vocab = vocabulary(ROWS)
    model = Model(len(vocab), embedding=8, hidden=12)
    data, optimizer = batch(ROWS, vocab), Adam(model, .02)
    before = model.loss(*data)
    for _ in range(90):
        _, grads = model.loss(*data, backward=True)
        optimizer.step(model, grads)
    assert model.loss(*data) < before * .1
    assert model.generate("what is ice?", vocab) == ("frozen water.", True)


def test_deterministic_initialization_and_no_future_leakage():
    a, b = Model(10, 4, 8), Model(10, 4, 8)
    for key in a.p:
        np.testing.assert_array_equal(a.p[key], b.p[key])
    h = np.zeros((1, 8))
    _, logits, _ = a.step([1], h)
    assert logits.shape == (1, 10)


def test_dataset_splits_and_tokenizer():
    assert tokenize("Bluey, hello!") == ["bluey", ",", "hello", "!"]
    with pytest.raises(ValueError, match="leakage"):
        check_splits({"train": ROWS, "test": ROWS})
    from pathlib import Path
    check_splits({split: read_rows(Path(f"training/data/{split}.jsonl")) for split in ("train", "validation", "test")})


def test_masking_and_export(tmp_path):
    vocab = vocabulary(ROWS)
    model = Model(len(vocab), 4, 8)
    x, y, mask = batch(ROWS, vocab)
    other_targets = y.copy()
    other_targets[mask == 0] = 0
    assert model.loss(x, y, mask) == model.loss(x, other_targets, mask)
    with pytest.raises(ValueError):
        model.loss(x, y, np.zeros_like(mask))
    path = tmp_path / "weights.json"
    export(model, vocab, {"status": "experimental"}, path)
    data = json.loads(path.read_text())
    assert data["format"] == "bluey-gru-v1"
    for name, parameter in model.p.items():
        saved = data["parameters"][name]
        np.testing.assert_allclose(np.array(saved["data"]).reshape(saved["shape"]), parameter, atol=1e-8)
