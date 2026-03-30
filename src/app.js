// src/app.js
// Pure Express app — no server.listen() here
// Used by both index.js (local) and lambda.js (AWS Lambda)

const express = require("express");
const { fetchRunLogs, extractErrorLines } = require("./githubLogs");
const { analyzeLogs } = require("./analyzer");
const { sendWhatsAppAlert } = require("./notifier");

const app = express();
app.use(express.json());

const AGENT_SECRET = process.env.AGENT_SECRET;

// ─── Security Middleware ───────────────────────────────────────────────────────
function validateSecret(req, res, next) {
  const secret = req.headers["x-agent-secret"];
  if (!AGENT_SECRET || secret !== AGENT_SECRET) {
    console.warn("Unauthorized request blocked");
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Main Webhook Handler ──────────────────────────────────────────────────────
app.post("/ci-failure", validateSecret, async (req, res) => {
  const { repo, commit, run_id, branch, actor } = req.body;

  if (!repo || !run_id) {
    return res.status(400).json({ error: "Missing repo or run_id" });
  }

  console.log("\n🚨 CI Failure received!");
  console.log(`   Repo:   ${repo}`);
  console.log(`   Branch: ${branch}`);
  console.log(`   Run ID: ${run_id}`);
  console.log(`   Actor:  ${actor}`);

  // Immediately acknowledge — GitHub Actions doesn't wait for processing
  res.json({ status: "received", run_id });

  // ⚠️ IMPORTANT for Lambda: process BEFORE response ends
  // Lambda freezes execution after response — so we await everything
  try {
    const rawLogs = await fetchRunLogs(repo, run_id);
    const errorLogs = extractErrorLines(rawLogs);
    console.log(`Extracted ${errorLogs.split("\n").length} error lines`);

    const analysis = await analyzeLogs(errorLogs, repo, branch);
    console.log("Analysis:", analysis);

    await sendWhatsAppAlert({ repo, run_id, branch, actor, analysis });
  } catch (err) {
    console.error("❌ Pipeline processing error:", err.message);
  }
});

module.exports = app;