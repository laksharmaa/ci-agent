// src/analyzer.js
// Sends filtered logs to Groq and gets structured analysis

const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Sends error logs to Groq (llama-3) and returns a structured analysis object:
 * { error_type, root_cause, fix, severity }
 */
async function analyzeLogs(errorLogs, repo, branch) {
  console.log("🤖 Sending logs to Groq for analysis...");

  const prompt = `
You are an expert DevOps engineer analyzing a CI/CD pipeline failure.

Repository: ${repo}
Branch: ${branch}

Here are the error logs from the failed CI run:
\`\`\`
${errorLogs}
\`\`\`

Analyze the failure and respond ONLY with a valid JSON object. No extra text.
Use this exact format:
{
  "error_type": "short category like 'Test Failure', 'Build Error', 'Dependency Issue', 'Lint Error', 'Network Error'",
  "root_cause": "one clear sentence explaining the root cause",
  "fix": "one or two concrete steps the developer should take to fix it",
  "severity": "low | medium | high"
}
`;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile", // Fast, free tier, great for structured output
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2, // Low temperature = more consistent, structured output
  });

  const raw = response.choices[0].message.content.trim();

  // Strip any accidental markdown fences
  const clean = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch (err) {
    console.error("⚠️ LLM returned non-JSON:", raw);
    // Graceful fallback if parsing fails
    return {
      error_type: "Unknown",
      root_cause: raw,
      fix: "Check the logs manually.",
      severity: "medium",
    };
  }
}

module.exports = { analyzeLogs };