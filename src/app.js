// src/app.js
const express = require("express");
const { fetchRunLogs, extractErrorLines } = require("./githubLogs");
const { analyzeLogs } = require("./analyzer");
const { sendSlackAlert } = require("./slackNotifier");
const { saveFailure, getRecentFailures, getStats } = require("./database");

const app = express();
app.use(express.json());

function validateSecret(req, res, next) {
  const secret = req.headers["x-agent-secret"];
  const expected = process.env.AGENT_SECRET;
  if (!expected || secret !== expected) {
    console.warn("🚫 Unauthorized request blocked");
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Stats endpoint ────────────────────────────────────────────────────────────
app.get("/stats", validateSecret, async (req, res) => {
  const { repo } = req.query;
  if (!repo) return res.status(400).json({ error: "Missing repo query param" });

  try {
    const stats = await getStats(repo);
    res.json(stats);
  } catch (err) {
    console.error("❌ Stats error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Main Webhook Handler ──────────────────────────────────────────────────────
app.post("/ci-failure", validateSecret, async (req, res) => {
  const { repo, commit, run_id, branch, actor } = req.body;

  if (!repo || !run_id) {
    return res.status(400).json({ error: "Missing repo or run_id" });
  }

  console.log("🚨 CI Failure received!");
  console.log(`   Repo:   ${repo}`);
  console.log(`   Branch: ${branch}`);
  console.log(`   Run ID: ${run_id}`);
  console.log(`   Actor:  ${actor}`);

  try {
    const rawLogs = await fetchRunLogs(repo, run_id);
    const errorLogs = extractErrorLines(rawLogs);
    console.log(`📋 Extracted ${errorLogs.split("\n").length} error lines`);

    const analysis = await analyzeLogs(errorLogs, repo, branch);
    console.log("📊 Analysis:", analysis);

    // Check if this error is recurring before saving
    const recent = await getRecentFailures(repo, analysis.error_type, 7);
    if (recent.count > 0) {
      analysis.recurring = true;
      analysis.occurrences = recent.count + 1; // +1 for current failure
      console.log(`🔁 Recurring failure detected: ${recent.count} times in last 7 days`);
    }

    // Save to DynamoDB
    await saveFailure({ repo, branch, actor, run_id, analysis });

    // Send Slack alert (with recurring info if applicable)
    await sendSlackAlert({ repo, run_id, branch, actor, analysis });

    console.log("✅ Pipeline complete");
    res.json({ status: "done", run_id });

  } catch (err) {
    console.error("❌ Pipeline processing error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;