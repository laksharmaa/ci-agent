// src/githubLogs.js
const axios = require("axios");
const AdmZip = require("adm-zip");

async function fetchRunLogs(repo, run_id) {
  const url = `https://api.github.com/repos/${repo}/actions/runs/${run_id}/logs`;

  console.log(`📥 Fetching logs for run ${run_id} from ${repo}...`);

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      responseType: "arraybuffer",
      maxRedirects: 5,
      validateStatus: (status) => status < 400,
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

  } catch (err) {
    console.error(`❌ fetchRunLogs failed: ${err.message}`);
    console.error(`   Status: ${err.response?.status}`);
    throw err;
  }
}

// ─── Stage 1: Strip noise lines ───────────────────────────────────────────────
const NOISE_PATTERNS = [
  /^npm warn/i,
  /^npm notice/i,
  /^::(debug|group|endgroup|add-matcher|remove-matcher)::/i,
  /^##\[debug\]/i,
  /^Download action repository/i,
  /^Add matchers:/i,
  /^Waiting for a runner/i,
  /^Current runner version/i,
  /^Operating System/i,
  /^Runner Image/i,
  /^RUNNER_/i,
  /^##\[section\]/i,
  /^\/usr\/bin\/git/i,
  /^\s*✓\s+/,           // passing test lines
  /^\s*✔\s+/,           // passing test lines alternate
  /^\s*PASS\s+/,        // passing test files
  /^Resolving deltas/i,
  /^Receiving objects/i,
  /^remote: Counting/i,
  /^remote: Compressing/i,
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+$/,  // empty timestamp lines
];

function stripNoise(lines) {
  return lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return !NOISE_PATTERNS.some(pattern => pattern.test(trimmed));
  });
}

// ─── Stage 2: Detect error category ───────────────────────────────────────────
function detectCategory(lines) {
  const text = lines.join("\n").toLowerCase();

  if (/fail\s+src\/|fail\s+test\/|●\s+|expected:|received:|toequal|tobetruthy/i.test(text)) {
    return "Test Failure";
  }
  if (/syntaxerror|cannot find module|unexpected token|import.*error/i.test(text)) {
    return "Build Error";
  }
  if (/error ts\d+|type.*is not assignable|property.*does not exist/i.test(text)) {
    return "TypeScript Error";
  }
  if (/npm err!|yarn error|exit code \d|command failed/i.test(text)) {
    return "Dependency/Script Error";
  }
  if (/econnrefused|etimedout|enotfound|network timeout/i.test(text)) {
    return "Network Error";
  }
  if (/permission denied|eacces|access denied/i.test(text)) {
    return "Permission Error";
  }
  if (/docker|container|image/i.test(text) && /error|fail/i.test(text)) {
    return "Docker Error";
  }

  return "General Error";
}

// ─── Stage 3: Extract by category ─────────────────────────────────────────────
function extractByCategory(lines, category) {
  switch (category) {
    case "Test Failure":
      return lines.filter(line =>
        /FAIL\s+|●\s+|Expected:|Received:|at\s+\S+\.test\.\w+:\d+|AssertionError|test.*failed/i.test(line)
      );

    case "Build Error":
      return lines.filter(line =>
        /SyntaxError|Cannot find module|Unexpected token|error.*import|at\s+\S+:\d+:\d+/i.test(line)
      );

    case "TypeScript Error":
      return lines.filter(line =>
        /error TS\d+|Type .* is not|Property .* does not|Argument of type/i.test(line)
      );

    case "Dependency/Script Error":
      return lines.filter(line =>
        /npm ERR!|yarn error|exit code|command failed|not found/i.test(line)
      );

    case "Network Error":
      return lines.filter(line =>
        /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network timeout|connection refused/i.test(line)
      );

    default:
      // fallback — return lines with error keywords
      return lines.filter(line =>
        /error|failed|failure|fatal|exception/i.test(line)
      );
  }
}

// ─── Stage 4: Smart extract (main export) ─────────────────────────────────────
function extractErrorLines(rawLogs) {
  const allLines = rawLogs.split("\n");
  console.log(`📊 Total raw log lines: ${allLines.length}`);

  // Stage 1 — strip noise
  const cleanLines = stripNoise(allLines);
  console.log(`🧹 After noise removal: ${cleanLines.length} lines`);

  // Stage 2 — detect category
  const category = detectCategory(cleanLines);
  console.log(`🔍 Detected error category: ${category}`);

  // Stage 3 — extract by category
  let extracted = extractByCategory(cleanLines, category);
  console.log(`✂️  Category-specific extraction: ${extracted.length} lines`);

  // If category extraction got too few lines, fall back to keyword filter
  if (extracted.length < 3) {
    console.log(`⚠️  Too few lines extracted, falling back to keyword filter`);
    extracted = cleanLines.filter(line =>
      /error|failed|failure|fatal|exception|exit code/i.test(line)
    );
  }

  // Stage 4 — deduplicate and limit to 15 lines
  const unique = [...new Set(extracted.map(l => l.trim()))].slice(0, 15);
  console.log(`✅ Final extracted lines: ${unique.length}`);

  // Log the actual extracted lines so we can see what goes to Groq
  console.log("─── Extracted lines sent to Groq ───");
  unique.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
  console.log("────────────────────────────────────");

  // Prepend category as context for Groq
  return `[Detected Category: ${category}]\n${unique.join("\n")}`;
}

module.exports = { fetchRunLogs, extractErrorLines };