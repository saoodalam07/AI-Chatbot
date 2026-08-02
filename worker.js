/**
 * NETSOL Chatbot proxy worker
 * Routes chat requests to Claude, Gemini, or OpenRouter while keeping
 * API keys server-side as Worker secrets.
 *
 * Secrets to set in Cloudflare (Settings -> Variables and secrets):
 *   ANTHROPIC_API_KEY
 *   GEMINI_API_KEY
 *   OPENROUTER_API_KEY
 *   GROQ_API_KEY
 *
 * Optional: set ALLOWED_ORIGIN as a variable to restrict CORS to your
 * deployed frontend domain instead of "*".
 */

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

    try {
      let reply;
      if (provider === "claude") {
        reply = await callClaude(env, model, messages);
      } else if (provider === "gemini") {
        reply = await callGemini(env, model, messages);
      } else if (provider === "openrouter") {
        reply = await callOpenRouter(env, model, messages);
      } else if (provider === "groq") {
        reply = await callGroq(env, model, messages);
      } else {
        return json({ error: "Unknown provider: " + provider }, 400, corsHeaders);
      }
      return json({ reply }, 200, corsHeaders);
    } catch (err) {
      return json({ error: err.message || "Upstream error" }, 502, corsHeaders);
    }
  },
};

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
      max_tokens: 1024,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error("Claude API error: " + (await res.text()));
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
    if (!res.ok) {
      const text = await res.text();
      const err = new Error("Gemini API error: " + text);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  const primary = model || "gemini-3.6-flash";
  const fallback = "gemini-2.5-flash";
  try {
    return await tryModel(primary);
  } catch (err) {
    // Google renames/retires model IDs often -- if the model itself is the
    // problem (404/not found), retry once with a fallback before giving up.
    if (err.status === 404 && primary !== fallback) {
      return await tryModel(fallback);
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
  if (!res.ok) throw new Error("OpenRouter API error: " + (await res.text()));
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
  if (!res.ok) throw new Error("Groq API error: " + (await res.text()));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
