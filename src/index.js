require("dotenv").config();

const express = require("express");
const { fetchRunLogs, extractErrorLines } = require("./services/githubLogs");
const { analyzeLogs } = require("./services/analyzer");
const { sendSlackAlert } = require("./integrations/slackNotifier");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const AGENT_SECRET = process.env.AGENT_SECRET;

// ─── Security Middleware ───────────────────────────────────────────────────────
// Validates the shared secret sent by GitHub Actions
function validateSecret(req, res, next) {
  const secret = req.headers["x-agent-secret"];
  if (!AGENT_SECRET || secret !== AGENT_SECRET) {
    console.warn("🚫 Unauthorized request blocked");
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

  // Validate required fields
  if (!repo || !run_id) {
    return res.status(400).json({ error: "Missing repo or run_id" });
  }

  console.log("\n🚨 CI Failure received!");
  console.log(`   Repo:   ${repo}`);
  console.log(`   Branch: ${branch}`);
  console.log(`   Run ID: ${run_id}`);
  console.log(`   Actor:  ${actor}`);

  // Immediately acknowledge — GitHub Actions doesn't wait
  res.json({ status: "received", run_id });

  // Process asynchronously
  try {
    // Step 1: Fetch raw logs from GitHub API
    const rawLogs = await fetchRunLogs(repo, run_id);

    // Step 2: Extract only error-relevant lines
    const errorLogs = extractErrorLines(rawLogs);
    console.log(`📋 Extracted ${errorLogs.split("\n").length} error lines`);

    // Step 3: Send to LLM for analysis
    const analysis = await analyzeLogs(errorLogs, repo, branch);
    console.log("📊 Analysis:", analysis);

    // Step 4: Send Slack alert with analysis results
    await sendSlackAlert({ repo, run_id, branch, actor, analysis });

  } catch (err) {
    console.error("❌ Pipeline processing error:", err.message);
  }
});

// ─── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 AI DevOps Agent running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Webhook URL:  http://localhost:${PORT}/ci-failure\n`);
});