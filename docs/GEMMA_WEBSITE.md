# Gemma 3 website integration

The website now uses the requested **`keras/gemma3/keras/gemma3_1b`** model identifier. The retired scratch-model page/weights are not shipped or used as a fallback. `/#gemma` opens the new page; the old `/#starter` bookmark redirects to the same interface. The sidebar entry is **Test AI**.

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

## Mobile information site, desktop-only AI

Phones, iPads (including desktop-mode Safari) and generic tablets receive a separate, readable mobile information website with feature explanations, setup steps, a sad Bluey illustration and the notice: “iPads, Phones, and other tablets are not supported. You are now viewing the mobile version of the website.” This restriction refers to the interactive desktop/AI experience, not access to the information site.

Pressing **Test AI** rechecks the browser signals. Unsupported devices see an accessible explanation dialog and can continue exploring. Direct `/#gemma` and legacy `/#starter` links also remain restricted. Neither case mounts the AI client or contacts inference from a mobile device. Native Capacitor Android pairing remains separate and unchanged.

Desktop visitors see Bluey pop in, wink, reveal the logo, and then enter the workspace. The intro runs once per tab session, has a Skip control, and respects reduced-motion preferences. Windows Electron and the native Android app do not receive the website intro.

Detection uses user-agent/platform hints, touch support and pointer characteristics. It does **not** scan CPU/GPU identity: browsers do not reliably expose it, and an Apple GPU is not proof of an iPad. Unknown tablets are labeled generically unless Apple-specific signals support the iPad heuristic. No hardware identifiers are collected or sent. Narrow desktop windows are supported; touch-first convertible PCs may be classified as tablets. This remains a best-effort compatibility policy, not security attestation.

The “On it” expression has steady eyes and a confident smile across the face, phone face and independent cursor. Thinking bubbles pulse in place; no horizontal/scaling transform moves them. A thin, pointer-transparent blue screen edge appears only during actual microphone recording in the workspace or native companion. It disappears on stop, cancellation, hiding or navigation. It does not imply that idle “listening” facial expressions are recording audio. Reduced-motion mode makes the edge static.

The Bluey SVG favicon, PNG fallback/touch icon and manifest are local assets. Device illustrations contain no tracking or external requests.

## Checks

- Unit tests: device classification, server-only gateway auth/sanitization, missing configuration, exact-model enforcement, input bounds, backend authorization and busy capacity.
- `npm run test:gemma`: desktop, iPhone, iPad desktop-mode, Android tablet, narrow desktop, local icons, unavailable state and clearly labeled transport fixtures.
- `npm run test:mobile-site`: mobile reading/navigation, AI-entry restriction, generic-tablet classification, desktop welcome/reduced motion, fixed-position thoughts and actual simulated-microphone border lifecycle.
- Existing UI, research/tools and native-speech browser regressions remain in CI.
- No actual Gemma inference or Kaggle download success is implied by these tests.
