// src/slackNotifier.js
const axios = require("axios");

const SEVERITY_COLOR = {
  low: "#FFD700",
  medium: "#FF8C00",
  high: "#FF0000",
};

async function sendSlackAlert({ repo, run_id, branch, actor, analysis }) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("⚠️ SLACK_WEBHOOK_URL not set, skipping Slack alert");
    return;
  }

  const logsUrl = `https://github.com/${repo}/actions/runs/${run_id}`;
  const color = SEVERITY_COLOR[analysis.severity] || "#FF0000";

  // Add recurring warning if detected
  const recurringText = analysis.recurring
    ? `⚠️ *Recurring issue — seen ${analysis.occurrences} times in last 7 days*\n`
    : "";

  const payload = {
    text: `🚨 CI Pipeline Failed — ${repo}`,
    attachments: [
      {
        color,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "🚨 CI Pipeline Failed",
            },
          },
          // Show recurring warning block only if recurring
          ...(analysis.recurring ? [{
            type: "section",
            text: {
              type: "mrkdwn",
              text: `⚠️ *Recurring issue — seen ${analysis.occurrences} times in last 7 days*`,
            },
          }] : []),
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