// src/githubLogs.js
const axios = require("axios");
const AdmZip = require("adm-zip");

async function fetchRunLogs(repo, run_id) {
  const url = `https://api.github.com/repos/${repo}/actions/runs/${run_id}/logs`;

  console.log(`📥 Fetching logs for run ${run_id} from ${repo}...`);

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
    responseType: "arraybuffer",
    maxRedirects: 5,        // ✅ follow the 302 redirect to the actual ZIP download URL
    validateStatus: (status) => status < 400,  // treat 3xx as success
  });

  console.log(`📦 Logs response status: ${response.status}`);

  const zip = new AdmZip(Buffer.from(response.data));
  const entries = zip.getEntries();

  console.log(`📂 ZIP contains ${entries.length} log files`);

  let allLogs = "";
  for (const entry of entries) {
    if (!entry.isDirectory) {
      const content = entry.getData().toString("utf8");
      allLogs += `\n--- ${entry.entryName} ---\n${content}`;
    }
  }

  return allLogs;
}

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

  const unique = [...new Set(errorLines)].slice(0, 60);

  if (unique.length === 0) {
    return lines.slice(-40).join("\n");
  }

  return unique.join("\n");
}

module.exports = { fetchRunLogs, extractErrorLines };