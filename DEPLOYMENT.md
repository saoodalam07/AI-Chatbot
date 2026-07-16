# Prism — Multi-Provider AI Chat

A static, single-file chat frontend (`index.html`) that routes conversations through Claude, Gemini, or OpenRouter, backed by a Cloudflare Worker proxy (`worker.js`) that keeps your API keys server-side.

## 1. Deploy the frontend

Push `index.html` to a GitHub repo and enable GitHub Pages (Settings → Pages → deploy from branch), same pattern as your other projects. No build step needed.

## 2. Deploy the worker

```bash
npm install -g wrangler
wrangler init prism-proxy   # or reuse an existing worker project, then swap in worker.js
```

Copy `worker.js` in as your worker's entry file, then set your secrets:

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GEMINI_API_KEY
wrangler secret put OPENROUTER_API_KEY
```

(Only set the keys for the providers you actually plan to use — a provider button will just error until its key is set.)

Deploy:

```bash
wrangler deploy
```

Optionally lock CORS to your GitHub Pages domain by adding to `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGIN = "https://yourusername.github.io"
```

## 3. Connect them

Open the deployed `index.html`, click the gear icon in the sidebar, and paste your Worker URL (e.g. `https://prism-proxy.yourname.workers.dev`) into "Proxy worker URL." That's it — no keys ever touch the browser.

## Notes

- Model names are set in `MODEL_MAP` inside `index.html` — update `claude-sonnet-4-6`, `gemini-2.5-flash`, or the OpenRouter model slug to whatever you want to default to.
- Conversation history lives in memory only (resets on page reload) to keep the file dependency-free. If you want persistence, swap the in-memory `state.conversations` array for `localStorage` reads/writes in the `newConversation`/`sendMessage` functions once it's running on your own domain.
- The provider switcher works mid-conversation — every message is tagged with which provider generated it, so a thread can genuinely mix providers.
