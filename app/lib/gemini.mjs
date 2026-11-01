import { env } from "./env.mjs";
import dns from "node:dns";

try { dns.setDefaultResultOrder("ipv4first"); } catch {}

const RETRY = new Set([429, 500, 502, 503, 529]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEAT_MODELS = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-3.5-flash"];
const CHAIR_MODELS = ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-3.5-flash"];

function pickModels(role = "seat") {
  return role === "chair" ? CHAIR_MODELS : SEAT_MODELS;
}

export async function geminiStream({ model, system, messages, maxTokens = 2500, onText = () => {} }) {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set in .env");

  const isChair = (typeof model === "string" && model.includes("chair")) || false;
  const candidateModels = pickModels(isChair ? "chair" : "seat");

  const systemText = Array.isArray(system)
    ? system.map((x) => x.text || "").join("\n")
    : (typeof system === "string" ? system : "");

  const contents = (messages || []).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }]
  }));

  for (const m of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
          contents,
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.7
          }
        })
      });

      if (!res.ok) {
        if (RETRY.has(res.status) || res.status === 404) continue;
        throw new Error(`Gemini ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (text) {
        onText(text);
        return text;
      }
    } catch (err) {
      console.warn(`[Gemini] model ${m} failed: ${err.message}, trying next...`);
    }
  }

  throw new Error("All Gemini candidate models failed to generate content.");
}

export async function geminiJson({ model, system, prompt, schema, maxTokens = 4000 }) {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set in .env");

  const isChair = (typeof model === "string" && model.includes("chair")) || false;
  const candidateModels = pickModels(isChair ? "chair" : "seat");

  const systemText = Array.isArray(system)
    ? system.map((x) => x.text || "").join("\n")
    : (typeof system === "string" ? system : "");

  const promptWithSchema = `${prompt}\n\nIMPORTANT: You must return ONLY a JSON object with this exact structure (no markdown formatting, no code fences):\n${JSON.stringify(schema, null, 2)}`;

  for (const m of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
          contents: [{ role: "user", parts: [{ text: promptWithSchema }] }],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: maxTokens,
            temperature: 0.2
          }
        })
      });

      if (!res.ok) {
        if (RETRY.has(res.status) || res.status === 404) continue;
        throw new Error(`Gemini ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      return JSON.parse(cleaned);
    } catch (err) {
      console.warn(`[Gemini JSON] model ${m} failed: ${err.message}, trying next...`);
    }
  }

  throw new Error("All Gemini candidate models failed to produce JSON.");
}
