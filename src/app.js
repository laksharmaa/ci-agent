// src/app.js
const express = require("express");
const { fetchRunLogs, extractErrorLines } = require("./githubLogs");
const { analyzeLogs } = require("./analyzer");
const { sendWhatsAppAlert } = require("./notifier");

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

  // ✅ Do ALL async work BEFORE sending response
  // Lambda freezes the process after res.json() — nothing runs after it
  try {
    const rawLogs = await fetchRunLogs(repo, run_id);
    const errorLogs = extractErrorLines(rawLogs);
    console.log(`📋 Extracted ${errorLogs.split("\n").length} error lines`);

    const analysis = await analyzeLogs(errorLogs, repo, branch);
    console.log("📊 Analysis:", analysis);

    await sendWhatsAppAlert({ repo, run_id, branch, actor, analysis });
    console.log("✅ Pipeline complete");

    // Send response only after everything is done
    res.json({ status: "done", run_id });

  } catch (err) {
    console.error("❌ Pipeline processing error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;

// 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