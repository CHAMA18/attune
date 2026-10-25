/* LLM call for the playbook composer (ported from functions/index.js callLLM). */

export async function callLLM(env, system, user) {
  const key = env.LLM_API_KEY;
  const provider = (env.LLM_PROVIDER || "openai").toLowerCase();
  const model =
    env.LLM_MODEL ||
    (provider === "gemini" ? "gemini-1.5-flash"
      : provider === "anthropic" ? "claude-3-5-haiku-latest"
      : "gpt-4o-mini");

  if (provider === "gemini") {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );
    if (!r.ok) throw new Error("Gemini HTTP " + r.status + ": " + (await r.text()).slice(0, 200));
    const j = await r.json();
    const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
    return { text: (parts || []).map((p) => p.text || "").join("").trim() || "(empty response)", model, provider };
  }

  if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 400, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error("Anthropic HTTP " + r.status + ": " + (await r.text()).slice(0, 200));
    const j = await r.json();
    return { text: (j.content || []).map((b) => b.text || "").join("").trim() || "(empty response)", model, provider };
  }

  /* default: OpenAI-compatible chat completions */
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error("OpenAI HTTP " + r.status + ": " + (await r.text()).slice(0, 200));
  const j = await r.json();
  const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  return { text: (content || "(empty response)").trim(), model, provider };
}
