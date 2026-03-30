// src/githubLogs.js
// Fetches and extracts CI run logs from GitHub API

const axios = require("axios");
const AdmZip = require("adm-zip");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

/**
 * Downloads the logs ZIP from GitHub and extracts text content
 */
async function fetchRunLogs(repo, run_id) {
  const url = `https://api.github.com/repos/${repo}/actions/runs/${run_id}/logs`;

  console.log(`📥 Fetching logs for run ${run_id} from ${repo}...`);

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
    responseType: "arraybuffer", // logs come as a ZIP file
  });

  // Unzip the buffer in memory
  const zip = new AdmZip(Buffer.from(response.data));
  const entries = zip.getEntries();

  let allLogs = "";

  for (const entry of entries) {
    if (!entry.isDirectory) {
      const content = entry.getData().toString("utf8");
      allLogs += `\n--- ${entry.entryName} ---\n${content}`;
    }
  }

  return allLogs;
}

/**
 * Filters logs down to error/failure lines only (max 60 lines)
 * to avoid sending thousands of tokens to the LLM
 */
function extractErrorLines(rawLogs) {
  const errorKeywords = [
    "error",
    "failed",
    "failure",
    "exception",
    "cannot",
    "unable",
    "not found",
    "exit code",
    "rejected",
    "fatal",
  ];

  const lines = rawLogs.split("\n");

  const errorLines = lines.filter((line) => {
    const lower = line.toLowerCase();
    return errorKeywords.some((kw) => lower.includes(kw));
  });

  // Deduplicate and limit
  const unique = [...new Set(errorLines)].slice(0, 60);

  if (unique.length === 0) {
    // Fallback: return last 40 lines (something still failed)
    return lines.slice(-40).join("\n");
  }

  return unique.join("\n");
}

module.exports = { fetchRunLogs, extractErrorLines };