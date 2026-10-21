# Bluey 0.5.5 Windows preview — pick a model, set up once

Open Settings → Model settings, choose local Ollama or Ollama Cloud, then **Find models**. Pick a returned name from the **Model** dropdown and click **Save model**. You no longer have to guess/type an exact name, and saving no longer requires a one-token inference test.

- Ollama discovery reads `/api/tags`; OpenAI-compatible providers use `/v1/models` (or the configured API prefix). No inference, model download or desktop action is triggered by discovery. A public catalog is not proof of cloud inference authorization or quota.
- Saved same-provider/endpoint keys are reused. Native engine credentials are supplied automatically. Keys are never placed in browser storage or catalog responses. Errors and empty catalogs are shown without erasing credentials. Changing provider/URL or closing Settings cancels pending discovery.
- After successful setup, the connection card and top-bar setup button are removed from the rendered UI. Completion is remembered locally and restored from persisted engine settings. On restart, the Windows app reconnects automatically. A temporary outage keeps the draft and shows a brief message, not the setup dialog. Settings remains available for deliberate model changes.
- The Windows build is released independently of Android checks. This release does not update Android/Home/Kids binaries or change enforcement/cloud-database readiness.

Close Bluey, install the new Windows EXE, then reopen it. If you manage the Python engine separately, update it too: this UI requires the `/api/models` endpoint. Windows keys retain the existing per-user DPAPI encryption. The preview is unsigned. Backend, browser and Windows checks use fixtures; actual model availability depends on your Ollama installation/provider account. An engine/server that is stopped or unavailable cannot answer requests; automatic reconnection does not hide that failure.
