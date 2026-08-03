/**
 * NETSOL Chatbot proxy worker
 * Routes chat requests to Claude, Gemini, OpenRouter, Groq, or Cloudflare
 * Workers AI, while keeping API keys server-side as Worker secrets. If the
 * selected provider is rate-limited or out of quota, automatically falls
 * back to another configured free provider instead of failing outright.
 *
 * Secrets to set in Cloudflare (Settings -> Variables and secrets):
 *   ANTHROPIC_API_KEY
 *   GEMINI_API_KEY
 *   OPENROUTER_API_KEY
 *   GROQ_API_KEY
 *
 * Bindings to add (Settings -> Bindings -> Add -> Workers AI):
 *   Variable name: AI
 *
 * Optional: set ALLOWED_ORIGIN as a variable to restrict CORS to your
 * deployed frontend domain instead of "*".
 */

const PROVIDERS = { claude: callClaude, gemini: callGemini, openrouter: callOpenRouter, groq: callGroq, cloudflare: callCloudflareAI };

// Only fall back among providers that are realistically free/available --
// never silently fall back into Claude or paid OpenRouter models, since
// that could surprise someone with a cost they didn't expect. Cloudflare
// Workers AI has no external key to run out of credit on, so it's the
// safest last resort and goes at the end of the chain.
const FREE_FALLBACKS = ["groq", "gemini", "cloudflare"];

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, corsHeaders);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400, corsHeaders);
    }

    const { provider, model, messages } = body;
    if (!provider || !Array.isArray(messages)) {
      return json({ error: "Missing provider or messages" }, 400, corsHeaders);
    }
    const fn = PROVIDERS[provider];
    if (!fn) {
      return json({ error: "Unknown provider: " + provider }, 400, corsHeaders);
    }

    try {
      let reply;
      let usedProvider = provider;
      try {
        reply = await fn(env, model, messages);
      } catch (err) {
        if (!isRetryable(err)) throw err;
        let lastErr = err;
        for (const fb of FREE_FALLBACKS) {
          if (fb === provider) continue;
          try {
            reply = await PROVIDERS[fb](env, null, messages);
            usedProvider = fb;
            lastErr = null;
            break;
          } catch (fbErr) {
            lastErr = fbErr;
          }
        }
        if (lastErr) throw lastErr;
      }
      return json({ reply, provider: usedProvider }, 200, corsHeaders);
    } catch (err) {
      return json({ error: err.message || "Upstream error" }, 502, corsHeaders);
    }
  },
};

function isRetryable(err) {
  if (err.status === 429) return true;
  const msg = (err.message || "").toLowerCase();
  return msg.includes("quota") || msg.includes("more credits") || msg.includes("rate limit") || msg.includes("resource_exhausted");
}

function withStatus(err, status) {
  err.status = status;
  return err;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function callClaude(env, model, messages) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("Claude API error: ANTHROPIC_API_KEY secret is not set on this Worker.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw withStatus(new Error("Claude API error: " + (await res.text())), res.status);
  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  return textBlock ? textBlock.text : "";
}

async function callGemini(env, model, messages) {
  if (!env.GEMINI_API_KEY) throw new Error("Gemini API error: GEMINI_API_KEY secret is not set on this Worker.");
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  async function tryModel(name) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${name}:generateContent?key=${env.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });
    if (!res.ok) throw withStatus(new Error("Gemini API error: " + (await res.text())), res.status);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  const primary = model || "gemini-3.6-flash";
  const fallbackModel = "gemini-2.5-flash";
  try {
    return await tryModel(primary);
  } catch (err) {
    // Google renames/retires model IDs often -- if the model itself is the
    // problem (404/not found), retry once with a fallback model before
    // giving up (this is separate from the provider-level fallback above).
    if (err.status === 404 && primary !== fallbackModel) {
      return await tryModel(fallbackModel);
    }
    throw err;
  }
}

async function callOpenRouter(env, model, messages) {
  if (!env.OPENROUTER_API_KEY) throw new Error("OpenRouter API error: OPENROUTER_API_KEY secret is not set on this Worker.");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + env.OPENROUTER_API_KEY,
    },
    body: JSON.stringify({
      model: model || "openrouter/auto",
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw withStatus(new Error("OpenRouter API error: " + (await res.text())), res.status);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGroq(env, model, messages) {
  if (!env.GROQ_API_KEY) throw new Error("Groq API error: GROQ_API_KEY secret is not set on this Worker.");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + env.GROQ_API_KEY,
    },
    body: JSON.stringify({
      model: model || "llama-3.3-70b-versatile",
      max_tokens: 8192,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw withStatus(new Error("Groq API error: " + (await res.text())), res.status);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callCloudflareAI(env, model, messages) {
  if (!env.AI) throw new Error("Cloudflare AI error: no AI binding found on this Worker. Add one in Settings -> Bindings -> Add -> Workers AI (variable name: AI).");
  const aiModel = model || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const result = await env.AI.run(aiModel, {
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  return result?.response || result?.result?.response || "";
}
