"""Small word-level GRU language model with explicit NumPy backpropagation.

This is a real autoregressive model, not a response lookup table. It is deliberately
small enough to train on CPU and execute with the same equations in a web worker.
"""
import re
import numpy as np

SPECIAL = ["<pad>", "<bos>", "<answer>", "<eos>", "<unk>"]
PAD, BOS, ANSWER, EOS, UNK = range(5)


def tokenize(text):
    return re.findall(r"[a-z]+|[0-9]+|[^\s\w]", text.lower(), flags=re.ASCII)


def vocabulary(rows):
    return SPECIAL + sorted({w for row in rows for field in ("question", "answer")
                             for w in tokenize(row[field])})


def encode(text, vocab):
    ids = {word: i for i, word in enumerate(vocab)}
    return [ids.get(word, UNK) for word in tokenize(text)]


def detokenize(words):
    return re.sub(r"\s+([.,!?;:])", r"\1", " ".join(words))


def batch(rows, vocab):
    sequences = [[BOS] + encode(r["question"], vocab) + [ANSWER]
                 + encode(r["answer"], vocab) + [EOS] for r in rows]
    width = max(map(len, sequences)) - 1
    x = np.full((len(rows), width), PAD, dtype=np.int64)
    y = x.copy()
    mask = np.zeros(x.shape)
    for i, seq in enumerate(sequences):
        x[i, :len(seq)-1], y[i, :len(seq)-1] = seq[:-1], seq[1:]
        mask[i, seq.index(ANSWER):len(seq)-1] = 1
    return x, y, mask


def sigmoid(x):
    return 1 / (1 + np.exp(-np.clip(x, -40, 40)))


def softmax(x):
    e = np.exp(x - x.max(axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)


class Model:
    def __init__(self, vocab_size, embedding=24, hidden=48, seed=17):
        self.embedding, self.hidden = embedding, hidden
        rng = np.random.default_rng(seed)
        self.p = {"E": rng.normal(0, .1, (vocab_size, embedding)),
                  "O": rng.normal(0, 1 / hidden**.5, (hidden, vocab_size)),
                  "bO": np.zeros(vocab_size)}
        for gate in "zrn":
            self.p["W" + gate] = rng.normal(0, 1 / embedding**.5, (embedding, hidden))
            self.p["U" + gate] = rng.normal(0, 1 / hidden**.5, (hidden, hidden))
            self.p["b" + gate] = np.zeros(hidden)

    def step(self, ids, h):
        p = self.p
        e = p["E"][ids]
        z = sigmoid(e @ p["Wz"] + h @ p["Uz"] + p["bz"])
        r = sigmoid(e @ p["Wr"] + h @ p["Ur"] + p["br"])
        n = np.tanh(e @ p["Wn"] + (r * h) @ p["Un"] + p["bn"])
        out = (1 - z) * n + z * h
        return out, out @ p["O"] + p["bO"], (ids, e, h, z, r, n, out)

    def loss(self, x, y, mask, backward=False):
        if x.shape != y.shape or x.shape != mask.shape or mask.sum() <= 0:
            raise ValueError("Invalid or empty training batch")
        p = self.p
        h = np.zeros((len(x), self.hidden))
        caches, total = [], 0.
        denom = mask.sum()
        for t in range(x.shape[1]):
            h, logits, cache = self.step(x[:, t], h)
            # Stable log-sum-exp, including for badly calibrated models.
            shifted = logits - logits.max(axis=1, keepdims=True)
            log_probs = shifted - np.log(np.exp(shifted).sum(axis=1, keepdims=True))
            total -= (log_probs[np.arange(len(x)), y[:, t]] * mask[:, t]).sum() / denom
            if backward:
                dl = np.exp(log_probs)
                dl[np.arange(len(x)), y[:, t]] -= 1
                dl *= mask[:, t, None] / denom
                caches.append((cache, dl))
        if not backward:
            return float(total)
        g = {k: np.zeros_like(v) for k, v in p.items()}
        dh = np.zeros_like(h)
        for (ids, e, prev, z, r, n, out), dl in reversed(caches):
            g["O"] += out.T @ dl
            g["bO"] += dl.sum(axis=0)
            dh += dl @ p["O"].T
            dn = dh * (1 - z) * (1 - n*n)
            dz = dh * (prev - n) * z * (1 - z)
            dprev = dh * z
            g["Wn"] += e.T @ dn
            g["Un"] += (r * prev).T @ dn
            g["bn"] += dn.sum(axis=0)
            drh = dn @ p["Un"].T
            dr = drh * prev * r * (1 - r)
            dprev += drh * r
            de = dn @ p["Wn"].T
            for gate, grad in (("z", dz), ("r", dr)):
                g["W" + gate] += e.T @ grad
                g["U" + gate] += prev.T @ grad
                g["b" + gate] += grad.sum(axis=0)
                de += grad @ p["W" + gate].T
                dprev += grad @ p["U" + gate].T
            np.add.at(g["E"], ids, de)
            dh = dprev
        return float(total), g

    def generate(self, question, vocab, limit=48):
        h = np.zeros((1, self.hidden))
        for token in [BOS] + encode(question, vocab) + [ANSWER]:
            h, logits, _ = self.step([token], h)
        words = []
        for _ in range(limit):
            logits[0, [PAD, BOS, ANSWER, UNK]] = -np.inf
            token = int(logits.argmax())
            if token == EOS:
                return detokenize(words), True
            words.append(vocab[token])
            h, logits, _ = self.step([token], h)
        return detokenize(words), False


class Adam:
    def __init__(self, model, learning_rate=.003):
        self.lr, self.t = learning_rate, 0
        self.m = {k: np.zeros_like(v) for k, v in model.p.items()}
        self.v = {k: np.zeros_like(v) for k, v in model.p.items()}

    def step(self, model, grads):
        norm = np.sqrt(sum(np.sum(g*g) for g in grads.values()))
        if not np.isfinite(norm):
            raise ValueError("Non-finite gradients; stopping training")
        self.t += 1
        for k, grad in grads.items():
            grad = grad / max(1., norm)
            self.m[k] = .9*self.m[k] + .1*grad
            self.v[k] = .999*self.v[k] + .001*grad*grad
            m = self.m[k] / (1 - .9**self.t)
            v = self.v[k] / (1 - .999**self.t)
            model.p[k] -= self.lr * m / (np.sqrt(v) + 1e-8)
