// src/notifier.js
// Sends a WhatsApp alert via Twilio with the LLM analysis

const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const SEVERITY_EMOJI = {
  low: "🟡",
  medium: "🟠",
  high: "🔴",
};

/**
 * Sends a WhatsApp alert with CI failure details
 */
async function sendWhatsAppAlert({ repo, run_id, branch, actor, analysis }) {
  const emoji = SEVERITY_EMOJI[analysis.severity] || "🔴";
  const logsUrl = `https://github.com/${repo}/actions/runs/${run_id}`;

  const message = `
${emoji} *CI PIPELINE FAILED*

📦 *Repo:* ${repo}
🌿 *Branch:* ${branch}
👤 *Triggered by:* ${actor}

🔍 *Error Type:* ${analysis.error_type}
💥 *Root Cause:* ${analysis.root_cause}
🛠️ *Suggested Fix:* ${analysis.fix}

🔗 View Logs: ${logsUrl}
`.trim();

  console.log("📲 Sending WhatsApp alert...");

  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: process.env.TWILIO_WHATSAPP_TO,
    body: message,
  });

  console.log("✅ WhatsApp alert sent!");
}

module.exports = { sendWhatsAppAlert };