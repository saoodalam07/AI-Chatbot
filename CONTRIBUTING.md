# Contributing

This started as a portfolio project, so the bar for "contribution" is intentionally low-friction — no CI pipeline, no build step, no test suite to satisfy. That said, a few conventions keep the four variants consistent with each other.

## Ground rules

- **No build step, ever.** Every HTML file must remain openable directly in a browser (once served over `http(s)://`) with zero bundling. If a change needs a build tool, it doesn't belong in these files.
- **No `localStorage` / `sessionStorage`.** Conversation state is intentionally in-memory only, so the files stay dependency-free and behave identically whether previewed or deployed. If you want persistence, add it as an opt-in, clearly documented change — don't make it silent default behavior.
- **Keep the four variants in sync where it makes sense.** A bug fix in `index-local.html`'s model-loading logic almost certainly needs the same fix in `prism-pro-local.html`, since they share that engine code. Check both before opening a PR.
- **Don't add real provider API keys anywhere in the repo**, including examples, comments, or test fixtures — not even placeholder-looking ones that might get copy-pasted as real.

## Making a change

1. Fork and branch from `main`.
2. Edit the relevant HTML file(s) directly — there's no separate source/build directory.
3. Sanity-check in a real browser: open dev tools, confirm no console errors, and actually send a message through the flow you changed (cloud mode needs a Worker URL configured; local mode needs a WebGPU browser).
4. If you touched `worker.js`, note that Cloudflare Workers can't be tested by opening the file directly — use `wrangler dev` locally (see `docs/DEPLOYMENT.md`).
5. Update `docs/CHANGELOG.md` under `[Unreleased]` with a one-line summary.
6. Open a PR describing what changed and why, and which variant(s) it touches.

## Reporting a bug

Open an issue with:
- Which file (`index.html`, `index-local.html`, `prism-pro.html`, or `prism-pro-local.html`)
- Browser + OS
- Exact error text, if any (check the browser console)
- Whether you're running it via `file://`, a local server, or a deployed URL — this matters a lot for local-mode issues specifically

## Design changes

The visual identity (the three-strand mark, the color roles per provider/tier, the type pairing) is deliberate — see the [Design section of the README](README.md#design). If you're proposing a visual change, a quick note on which part of that identity it's changing (and why) makes review much faster.
