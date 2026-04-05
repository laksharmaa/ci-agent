// src/slackNotifier.js
// Sends a Slack alert using an Incoming Webhook — no SDK needed, just axios

const axios = require("axios");

const SEVERITY_COLOR = {
  low: "#FFD700",     // yellow
  medium: "#FF8C00",  // orange
  high: "#FF0000",    // red
};

async function sendSlackAlert({ repo, run_id, branch, actor, analysis }) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("⚠️ SLACK_WEBHOOK_URL not set, skipping Slack alert");
    return;
  }

  const logsUrl = `https://github.com/${repo}/actions/runs/${run_id}`;
  const color = SEVERITY_COLOR[analysis.severity] || "#FF0000";

  // Slack Block Kit message — looks clean and professional
  const payload = {
    text: `🚨 CI Pipeline Failed — ${repo}`,   // notification preview text
    attachments: [
      {
        color,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `🚨 CI Pipeline Failed`,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Repo:*\n${repo}` },
              { type: "mrkdwn", text: `*Branch:*\n${branch}` },
              { type: "mrkdwn", text: `*Triggered by:*\n${actor}` },
              { type: "mrkdwn", text: `*Severity:*\n${analysis.severity.toUpperCase()}` },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Error Type:* ${analysis.error_type}\n*Root Cause:* ${analysis.root_cause}`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Suggested Fix:*\n${analysis.fix}`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "View Logs" },
                url: logsUrl,
                style: "danger",
              },
            ],
          },
        ],
      },
    ],
  };

  console.log("💬 Sending Slack alert...");

  await axios.post(webhookUrl, payload);

  console.log("✅ Slack alert sent!");
}

module.exports = { sendSlackAlert };