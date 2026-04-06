// src/analyzer.js
const Groq = require("groq-sdk");

async function analyzeLogs(errorLogs, repo, branch) {
  console.log("🤖 Sending logs to Groq for analysis...");
  console.log(`📏 Token estimate: ~${Math.ceil(errorLogs.length / 4)} tokens`);

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const prompt = `You are a DevOps engineer. Analyze this CI failure and return JSON only.

Repo: ${repo} | Branch: ${branch}

Logs:
${errorLogs}

Return ONLY this JSON, no extra text:
{
  "error_type": "one of: Test Failure, Build Error, TypeScript Error, Dependency/Script Error, Network Error, Permission Error, Docker Error, General Error",
  "root_cause": "one sentence, specific to the actual error shown",
  "fix": "1-2 concrete actionable steps",
  "severity": "low | medium | high"
}`;

  // llama-3.1-8b-instant — fast, cheap, great for structured log analysis
  // 8b model is perfect here: logs are factual, no complex reasoning needed
  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,         // very low — we want consistent structured output
    max_tokens: 200,          // JSON response never needs more than 200 tokens
    response_format: { type: "json_object" }, // force JSON output — no parsing issues
  });

  const raw = response.choices[0].message.content.trim();
  console.log(`💰 Tokens used — prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens}`);

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("⚠️ Failed to parse LLM response:", raw);
    return {
      error_type: "General Error",
      root_cause: raw,
      fix: "Check the logs manually.",
      severity: "medium",
    };
  }
}

module.exports = { analyzeLogs };