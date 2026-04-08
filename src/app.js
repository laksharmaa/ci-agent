// src/app.js
const express = require("express");
const { fetchRunLogs, extractErrorLines } = require("./services/githubLogs");
const { analyzeLogs } = require("./services/analyzer");
const { sendSlackAlert } = require("./integrations/slackNotifier");
const { saveFailure, getRecentFailures, getStats } = require("./db/database");

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

app.post("/ci-failure", validateSecret, async (req, res) => {
  const { repo, run_id, branch, actor } = req.body;

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

    // extractErrorLines now returns { lines, category, testCounts, failedFile }
    const { lines: errorLogs, category, testCounts, failedFile } = extractErrorLines(rawLogs);
    console.log(`📋 Extracted ${errorLogs.split("\n").length} error lines`);

    const analysis = await analyzeLogs(errorLogs, repo, branch);

    // Attach test counts to analysis if available
    if (testCounts) analysis.testCounts = testCounts;

    // Attach failed file to analysis if detected
    if (failedFile) analysis.failedFile = failedFile;

    console.log("📊 Analysis:", analysis);

    // Check recurring failures
    const recent = await getRecentFailures(repo, analysis.error_type, 7);
    if (recent.count > 0) {
      analysis.recurring = true;
      analysis.occurrences = recent.count + 1;
      console.log(`🔁 Recurring failure: ${recent.count} times in last 7 days`);
    }

    await saveFailure({ repo, branch, actor, run_id, analysis });
    await sendSlackAlert({ repo, run_id, branch, actor, analysis });

    console.log("✅ Pipeline complete");
    res.json({ status: "done", run_id });

  } catch (err) {
    console.error("❌ Pipeline processing error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;