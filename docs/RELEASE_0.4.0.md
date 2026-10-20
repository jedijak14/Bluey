# Bluey 0.4.0 — privacy controls & family foundation (preview)

**This is not a parental-protection release.** Windows time-limit enforcement, website filtering, verified insights, push notifications and a tamper-resistant Kids Windows service/installer are not included. Do not remove your existing family safety controls.

- Windows engine-owned Computer Use and Screen access switches, approval revocation, explicit screen chooser and visible stop-sharing banner. Screen access defaults off. Recent JPEG context only; no saved video. Configured cloud vision providers may receive frames.
- Windows selected microphone now also applies to quiet sessions. No spoken replies; optional Android cartoon chirp only.
- Separate Bluey Home parent Android APK and Bluey for Kids APK, alongside the original companion APK and Windows EXEs.
- Home web dashboard: `https://bluey-plum.vercel.app/#home`. Parent/child enrollment, rule storage and time requests require a separately hosted persistent family backend. No production family backend is configured by this release.
- Explicit demo/unprotected/unknown-usage states. Dismissible time-up design preview, not a computer lock.

See `docs/BLUEY_HOME.md` for hosting, security, enrollment, limitations and build instructions. Preview Windows EXEs are unsigned and Android APKs debug-signed; OS warnings are expected. Windows still needs the Python desktop engine and a configured model. These apps are not standalone trained AI models, and the requested exact Gemma BASE host is still unavailable.
