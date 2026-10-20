# Gemma 3 website integration

The website now uses the requested **`keras/gemma3/keras/gemma3_1b`** model identifier. The retired scratch-model page/weights are not shipped or used as a fallback. `/#gemma` opens the new page; the old `/#starter` bookmark redirects to the same interface. The sidebar calls it **Gemma 3 preview**.

## What is and is not running

This preset is the **pretrained base model**, not `gemma3_instruct_1b`. Keras Hub lists these as distinct presets. The implementation does not silently substitute the instruction-tuned variant. A base-model completion is not proof of reliable question-answering or safety. No fine-tuning, web search, desktop tools, or model-quality benchmark is claimed for this mode.

The website is a browser client. Kaggle's Keras model files do **not** run natively in JavaScript and are not included in the website bundle or Vercel functions. A separate Python inference host loads them. The website shows **Model not available** and disables sending until that service reports the exact preset loaded. Unavailable services never fall back to canned answers or the tiny experimental model.

This development environment cannot download from Kaggle's model hosts or run jobs in a Kaggle account. The real model has **not been downloaded or inference-tested here**. Transport tests use explicit fixtures, not purported Gemma answers. Notebook and service code require verification on the actual inference host. Vercel deployment success is separate from model readiness.

## 1. Download the exact model on your inference host or Kaggle notebook

Accept the applicable Gemma/Kaggle terms yourself, and use Kaggle's supported authentication if prompted. Never put Kaggle credentials into this repository, chat, public notebook output, or browser environment variables.

The download script uses exactly:

```python
import kagglehub

# Download latest version
path = kagglehub.model_download("keras/gemma3/keras/gemma3_1b")
print("Path to model files:", path)
```

Run `scripts/download-gemma.py` on a network that can access Kaggle. It defaults to ignored `artifacts/gemma-cache`; override `KAGGLEHUB_CACHE` to use a persistent external volume. The handle intentionally selects the latest version as requested; record its resolved version/path when deploying. Downloads can require gigabytes of storage. Do not commit weights or publish them without reviewing their license.

An importable example is in `notebooks/Bluey_Gemma3_Kaggle.ipynb`. It downloads, loads and generates a test completion; it does not claim to train a new model. Kaggle sessions are temporary, not a dependable production inference URL. No notebook jobs have been launched on your behalf.

## 2. Run the separate service

Use Python 3.11 on a sufficiently provisioned host. GPU acceleration is recommended; actual memory/latency must be tested. The desktop browser check does not verify server capacity.

```sh
python -m venv .venv-gemma
.venv-gemma/bin/python -m pip install -r backend/requirements-gemma.txt
.venv-gemma/bin/python scripts/download-gemma.py
# Set these privately in your host's environment/secrets UI:
# BLUEY_GEMMA_MODEL_PATH = the downloaded local preset directory
# BLUEY_GEMMA_TOKEN = a newly generated strong service secret
# KERAS_BACKEND = torch
.venv-gemma/bin/python -m backend.gemma_service
```

On Windows use the corresponding `.venv-gemma\Scripts\python.exe` and set environment variables in PowerShell or a secret manager. Keep the same secret only on the service and website gateway; do not paste it into a conversation.

The service binds port 8766. Use an authenticated, private deployment where possible and an HTTPS reverse proxy for a public website connection. Do not expose an unauthenticated GPU endpoint. It loads only a configured local preset directory, never downloads on a user HTTP request, and does not load at all without service authentication configured. Keras uses Torch while TensorFlow is restricted to CPU tokenization to avoid reserving GPU memory twice. The separate optional dependencies are not added to the Windows/Android baseline.

Generation is single-request-at-a-time, with no unbounded queue, a global 20-request/minute preview limit, a 1200-character / 384-token prompt limit, and up to 192 new tokens. An HTTP timeout or Stop stops waiting but cannot forcibly undo a GPU computation; the service keeps its capacity occupied until the underlying call finishes. Scale-out needs an external shared rate limiter and real access controls. This is not an unrestricted public inference product.

## 3. Connect Vercel (server-side configuration only)

Set these in the **Bluey project environment settings**, not `VITE_` variables:

- `BLUEY_GEMMA_SERVICE_URL`: HTTPS origin of the inference host, without a path, query or credentials.
- `BLUEY_GEMMA_SERVICE_TOKEN`: the service secret corresponding to `BLUEY_GEMMA_TOKEN` on that host.

Redeploy after configuring them. `/api/gemma/status` and `/api/gemma/generate` are Node serverless gateways. They attach the secret only on the server, reject arbitrary target URLs/redirects, bound prompts, and return sanitized status/output. No model weights or Python ML dependencies are installed in Vercel. A missing configuration produces an honest unavailable response. The browser never asks users for a PC IP address or service API key for this mode.

For local Vite development, the same variables may be stored in ignored `.env.local`; the inference origin may be `http://127.0.0.1:8766` locally only. Both development and preview servers provide the same gateway. The browser always calls relative `/api/gemma/*` URLs, never the visitor's localhost. Do not share the inference service secret with the PC desktop engine token.

Prompts go to the configured inference host only on submission. This code does not persist conversation history or log request bodies. Infrastructure-level logging/retention is the host operator's responsibility. Earlier turns are not automatically resent; this preview makes independent completion requests. There is no voice output.

## Desktop-only website policy

The website checks browser/platform signals before mounting its UI or contacting Gemma. Phones, iPads (including desktop-mode Safari) and Android/other tablets receive an illustrated unsupported-device screen. Narrow desktop windows remain supported. Unknown browsers fail closed. Touch-first convertible PCs may be classified as tablets.

Browser detection is **best effort**, not secure physical-device verification. User-agent spoofing and some unusual hardware can evade or confuse it. The service secret, not the device check, protects the inference host. The native Capacitor Android paired companion remains available and bypasses only this website compatibility screen; it is a separate product path, not a phone Gemma client. No Android release is produced by publishing the website.

The Bluey SVG favicon, PNG fallback/touch icon and manifest are local assets. Device illustrations are original vector drawings and contain no third-party tracking or external image requests.

## Checks

- Unit tests: device classification, server-only gateway auth/sanitization, missing configuration, exact-model enforcement, input bounds, backend authorization and busy capacity.
- `npm run test:gemma`: desktop, iPhone, iPad desktop-mode, Android tablet, narrow desktop, local icons, unavailable state and clearly labeled transport fixtures.
- Existing UI, research/tools and native-speech browser regressions remain in CI.
- No actual Gemma inference or Kaggle download success is implied by these tests.
