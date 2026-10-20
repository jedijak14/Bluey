> **Retired experiment.** This page records earlier work. Its website page and public weight assets have been removed at the user’s request. The active integration is [Gemma 3](GEMMA_WEBSITE.md); the code below is retained only as reproducible research, not shipped inference or a fallback.

# Bluey Starter: a trained model in the website preview

Open **Local AI preview** in the workspace sidebar, or visit `/#starter`, then choose **Load trained starter**. No Windows engine, IP address, provider account, or API key is needed for this experimental page. The existing PC-connected assistant is separate and unchanged. This does **not** implement Wi-Fi PC discovery.

## What was actually trained

- A word-level, single-layer GRU autoregressive language model, with embeddings and an output projection. All weights start from random initialization. There is no pretrained foundation model, teacher API, hidden assistant weight access, downloaded knowledge corpus, or response lookup used for inference.
- Original assistant-authored teaching facts and templates in `training/make_curriculum.py`: **384 training questions covering 32 facts**, 32 validation questions, and 32 test questions. JSONL files and their SHA-256 hashes are included. Examples are deliberately public, synthetic engineering fixtures; no user conversations are training data.
- Explicit NumPy forward/backward passes, answer-token cross entropy, gradient clipping and Adam. Finite-difference tests verify gradients for every parameter family.
- Three randomly initialized configurations: embedding/hidden sizes **24/48**, **32/80**, and **40/112**, with seeds **17**, **29**, and **41**. Each ran **2,000 optimization steps**. They are small starter experiments, not three pretrained LLMs.
- Within each run, the lowest-validation-loss checkpoint is retained. Across candidates, validation exact match selects the winner, with validation loss as tie-breaker. Test answers are evaluated after the winner is selected. There was an earlier, separate 192-example engineering baseline; its results are not the shipped model's scores.
- The winner has **22,484 parameters**, with checkpoint **1,200 of 2,000** retained. The larger candidates did not win. Continuing to minimize training loss was not evidence of better generalization.

## Results and limits

| Split      | Exact answer match |
| ---------- | ------------------ |
| Training   | 377 / 384 (98.2%)  |
| Validation | 24 / 32 (75%)      |
| Test       | 16 / 32 (50%)      |

These are **held-out phrasings of the same facts**, not held-out subjects, independent broad benchmarks, or evidence of general intelligence. Validation and test are different templates, with very small sample sizes. Do not compare these percentages to foundation-model benchmarks. Read every prediction, failed example, training curve and candidate score in `public/models/bluey-starter.report.json`.

**This model is not ready to be a general assistant.** It often returns irrelevant curriculum answers to unfamiliar questions. For example, the report includes arithmetic, weather, current-events and medicine probes; they demonstrate failures rather than a safe refusal capability. A fluent answer is not a confidence estimate. It has no real-time information, retrieval, tools, multi-turn memory, voice output, or reliable safety behavior. Do not use it for consequential advice. It is intentionally not substituted for the regular assistant or the Android paired experience.

Its knowledge is limited by its tiny curriculum and word vocabulary. More runtime does not supply missing knowledge. A useful next stage requires a much larger, rights-cleared and reviewed corpus, broader independently held-out evaluation, and a more capable architecture/compute plan. Access to this conversation's search tools or underlying model is **not** inherited by training.

## Browser execution and privacy

`public/models/bluey-starter.json` contains actual trained weights, configuration, vocabulary and the evaluation report. The report's answers are never consulted by inference. The browser implements the same GRU equations in a dedicated worker; automated tests compare all 32 test predictions to Python output and verify that changing the weights changes the answer.

The load button downloads this public asset from the website's own origin. Questions and generation stay in the worker; there are no inference network requests or provider calls. The browser smoke test verifies this using a real model, not mocked answers. History is tab-local React state, not persistent storage. Stop/unload/navigation terminates the worker. Download and generation have timeouts, inputs/output are bounded, and failed loading is shown as an error. No silent cloud fallback exists.

Internet is needed for the initial website/model download; an offline-capable installed PWA is **not** implemented. The preview does not speak by default—or at all in this experimental mode.

## Reproduce

Python 3.11+ on CPU is sufficient for this small experiment. From the repository root:

```sh
python -m venv .venv
.venv/bin/python -m pip install -r training/requirements.txt
.venv/bin/python training/make_curriculum.py
OPENBLAS_NUM_THREADS=1 .venv/bin/python -m pytest training/tests -q
OPENBLAS_NUM_THREADS=1 .venv/bin/python -m training.select_starter
```

On Windows use `.venv\Scripts\python.exe` and set `$env:OPENBLAS_NUM_THREADS="1"` in PowerShell instead of the Unix prefix. Fixed seeds give reproducible initialization and batch sampling; floating-point libraries/platforms can cause small numerical differences. Recorded elapsed time is wall time for each optimization loop, not GPU time or an overnight training claim.

Selection writes the final export and report in `public/models/`. Intermediate candidate weights/logs stay in ignored `artifacts/starter/`. Do not put private datasets, credentials or large checkpoints in Git. The small final browser asset and public curriculum are versioned deliberately because the static preview needs them.

For one run without overwriting the public preview:

```sh
OPENBLAS_NUM_THREADS=1 .venv/bin/python -m training.bluey_starter.train \
  --data training/data --steps 2000 --hidden 48 --embedding 24 --seed 17 \
  --output artifacts/starter/my-run.json
```

`--defer-test` leaves test metrics unset for candidate selection. Such a candidate is deliberately rejected by the browser loader until a final evaluation is attached. Checkpoints are inference exports, not resumable optimizer checkpoints; new runs start afresh.

Website checks:

```sh
npm ci
npm test
npm run build
# Start npm run dev or npm run preview -- --host 0.0.0.0 --port 5173 separately:
npm run test:starter
```

The browser test also runs against a production build. On minimal Linux installations, supply the bundled Chromium shared libraries as with the existing UI tests. No new Android APK or Windows EXE release, hosted inference service, or production Vercel deployment is implied by this preview work.
