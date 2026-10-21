# Bluey 0.5.4 preview — Ollama connection and credential fixes

## Windows model connection

- The Windows EXE obtains its engine address/token directly from Electron. It no longer asks you to type a Bluey engine token or confuse it with an Ollama provider key.
- **Ollama · on your machine** needs no API key for ordinary local models. Start Ollama and choose an installed model (default `llama3.2`).
- **Ollama Cloud · your key** uses `https://ollama.com`. Enter your Ollama provider key and an exact model name available from Ollama Cloud. Model availability and provider limits change; Bluey does not substitute models automatically. Cloud inference sends prompts to Ollama, even when routed through a local Ollama installation.
- Save & connect checks the model list and performs a one-token inference probe without user conversation data or desktop tools. This can consume provider quota. A public model list alone is not treated as proof that a key works.
- Provider settings survive engine restarts. Windows API keys are encrypted using DPAPI for the current Windows account; only redacted status is returned to the renderer. A blank input keeps the current key for the same provider/API endpoint, not a different destination. The settings panel can forget the saved key.
- On other engine operating systems, model settings persist but keys remain in memory or environment, never plaintext settings files. Explicit `BLUEY_*` environment configuration takes precedence on startup; remove an old `BLUEY_API_KEY` from the environment when replacing/removing it in the app.
- Invalid keys, unreachable servers, missing models, quota limits and provider outages have distinct errors. A model error does not disconnect a healthy Windows engine or clear its saved key. Unsupported tool metadata is retried once without tools, allowing text-only Ollama models to answer ordinary chats. No desktop action bypasses approval.

Settings are stored at `~/.bluey/model.json` (or `BLUEY_MODEL_CONFIG`). Do not copy Windows-encrypted credentials between users/machines. Keep that file out of source control. Reinstalling/updating Bluey retains it; profile recovery may require re-entering a key. Provider keys are never stored in browser localStorage or sent to Android. Native tests use disposable keys; no real provider key is bundled.

## Cloud account activation

Bluey's existing family API runs on Vercel, with Supabase PostgreSQL as its persistent database. Connecting the Supabase app alone does not set Vercel's database connection. Production requires `BLUEY_FAMILY_DATABASE_URL` and a private `BLUEY_FAMILY_SETUP_INVITE`; see [secure setup](VERCEL_FAMILY.md). Do not paste credentials into chat.

This release does not claim that storage is activated until the live `/api/family/status` returns `ready` after a real query. Supabase is not a model inference host. Windows screen access, microphone capture and desktop automation still require the local permission-gated engine. No all-browser or non-bypassable Windows enforcement is added here.

## Validation scope

Regression tests cover keyless Ollama, cloud-key forwarding, authenticated inference probing, restart persistence, wrong-host key isolation, failed-write rollback, safe key deletion, redacted API responses, provider errors, text-only model fallback, and the native bridge UI. Windows CI runs real DPAPI encryption/decryption and restart tests. Network tests use deterministic provider fixtures, not a claim about a user's model installation or live account quota.

Windows installers remain unsigned previews. Update the Windows app and any separately managed Python engine together; the new app requires the new model configuration/test endpoints. The website's separate exact Gemma BASE preview is unchanged.
