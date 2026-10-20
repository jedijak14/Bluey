"""Explicit operator action: may download GBs and require acceptance of Gemma terms."""
import os
from pathlib import Path

# Avoid checking model weights into the repository. The operator can override this.
os.environ.setdefault("KAGGLEHUB_CACHE", str(Path("artifacts/gemma-cache").resolve()))
import kagglehub

# Download latest version of the exact model requested; no alternate preset fallback.
path = kagglehub.model_download("keras/gemma3/keras/gemma3_1b")
print("Path to model files:", path)
print("Set BLUEY_GEMMA_MODEL_PATH to this directory on the inference host.")
