"use strict";

const { normalizePlannerDecision } = require("../utils/validator");

function createOpenAIProvider() {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const modelName = process.env.LLM_MODEL || "gpt-4o-mini";

  return {
    async plan(prompt, input = {}) {
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY belum diatur untuk provider openai");
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Kamu adalah planner agent. Kembalikan JSON valid action=respond atau action=tool dengan field yang diperlukan.",
            },
            {
              role: "user",
              content: `${prompt}\n\nKembalikan response JSON saja tanpa markdown.`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${errText}`);
      }

      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content || "";
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (_error) {
        // Fallback aman jika model tidak menghasilkan JSON murni.
        parsed = {
          action: "respond",
          response: `Planner fallback: ${String(content).slice(0, 300)}`,
          summary: "Fallback karena output model tidak valid JSON",
        };
      }

      // Validasi kompatibilitas schema planner.
      normalizePlannerDecision(parsed);
      return parsed;
    },
  };
}

module.exports = { createOpenAIProvider };
