# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

- Attach-file support in the composer (currently UI-only)
- Real account system behind the login gate
- Token-per-second readout for local mode

## v0.4.0 — Local model resilience

### Fixed
- `index-local.html` / `prism-pro-local.html`: WebLLM was statically imported at the top of the module, so a blocked or slow CDN silently broke the entire script — including the login screen, in `prism-pro-local.html`'s case. The import is now dynamic and deferred to `loadModel()`, isolating any failure to the model-loading feature only.
- Model loading now tries three CDN sources (`esm.run`, `jsdelivr`, `unpkg`) in sequence instead of one, and reports which failure mode occurred (blocked network vs. `file://` restrictions) instead of a generic error.
- The composer and send button no longer hard-lock while waiting for a model to load; sending before a model is ready now returns an explicit in-chat explanation instead of doing nothing.
- `prism-pro-local.html`: app shell now uses `position: fixed; inset: 0` instead of relying on `height: 100%` cascading through `html`/`body`, fixing a layout bug where the app could render at partial viewport size depending on how the page was hosted/opened.

## v0.3.0 — Glass redesign + auth gate

### Added
- `prism-pro.html`, `prism-pro-local.html`: glassmorphic visual redesign (frosted panels, ambient depth, layered shadows), a sign-in/sign-up/guest landing screen, and additional conversation tooling — pin, search, Markdown export, per-message copy/regenerate, live per-response latency.
- Text-based NETSOL Technologies credit line in place of a reproduced logo asset.

## v0.2.0 — Local, zero-key mode

### Added
- `index-local.html`: fully client-side chat using [WebLLM](https://github.com/mlc-ai/web-llm) over WebGPU. No API key, no server, works offline after the first model download. Three selectable model tiers (fast / balanced / accurate).

## v0.1.0 — Initial release

### Added
- `index.html`: static multi-provider chat frontend (Claude / Gemini / OpenRouter), provider switcher, conversation history, streaming-style responses.
- `worker.js`: Cloudflare Worker proxy that holds provider API keys as server-side secrets and normalizes each provider's request/response shape.
