const axios = require("axios");
const retry = require("../utils/retry");

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

  // Build test counts block if available
  const testCountsBlock = analysis.testCounts ? {
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Tests Failed:*\n${analysis.testCounts.failed}/${analysis.testCounts.total} (${analysis.testCounts.fail_percent})`,
      },
      {
        type: "mrkdwn",
        text: `*Tests Passed:*\n${analysis.testCounts.passed}/${analysis.testCounts.total}`,
      },
      ...(analysis.testCounts.suites ? [{
        type: "mrkdwn",
        text: `*Test Suites:*\n${analysis.testCounts.suites}`,
      }] : []),
    ],
  } : null;

  const payload = {
    text: `🚨 CI Pipeline Failed — ${repo}`,
    attachments: [
      {
        color,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "🚨 CI Pipeline Failed" },
          },

          // Recurring warning block
          ...(analysis.recurring ? [{
            type: "section",
            text: {
              type: "mrkdwn",
              text: `⚠️ *Recurring issue — seen ${analysis.occurrences} times in last 7 days*`,
            },
          }] : []),

          // Repo, branch, actor, severity
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Repo:*\n${repo}` },
              { type: "mrkdwn", text: `*Branch:*\n${branch}` },
              { type: "mrkdwn", text: `*Triggered by:*\n${actor}` },
              { type: "mrkdwn", text: `*Severity:*\n${analysis.severity.toUpperCase()}` },
              ...(analysis.failedFile ? [{ type: "mrkdwn", text: `*Failed File:*\n\`${analysis.failedFile}\`` }] : []),
            ],
          },

          // Test counts block (only for Test Failure)
          ...(testCountsBlock ? [testCountsBlock] : []),

          // Error details
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Error Type:* ${analysis.error_type}\n*Root Cause:* ${analysis.root_cause}`,
            },
          },

          // Suggested fix
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Suggested Fix:*\n${analysis.fix}`,
            },
          },

          // View logs button
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

  try {
    await retry(() => axios.post(webhookUrl, payload));
    console.log("✅ Slack alert sent!");
  } catch (err) {
    console.error("❌ Failed to send Slack alert:", err.message);
  }
}

module.exports = { sendSlackAlert };