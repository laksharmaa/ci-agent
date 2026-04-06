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
  /^\s*✓\s+/,
  /^\s*✔\s+/,
  /^\s*PASS\s+/,
  /^Resolving deltas/i,
  /^Receiving objects/i,
  /^remote: Counting/i,
  /^remote: Compressing/i,
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+$/,
];

// Strip timestamps from lines like "2026-04-06T12:10:05.9660918Z FAIL ./app.test.js"
function stripTimestamp(line) {
  return line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+/, "").trim();
}

function stripNoise(lines) {
  return lines
    .map(stripTimestamp)
    .filter(line => {
      if (!line.trim()) return false;
      return !NOISE_PATTERNS.some(pattern => pattern.test(line.trim()));
    });
}

// ─── Stage 2: Detect error category ───────────────────────────────────────────
function detectCategory(lines) {
  const text = lines.join("\n").toLowerCase();

  if (/fail\s+src\/|fail\s+test\/|fail\s+\.\/|●\s+|expected:|received:|toequal|tobetruthy/i.test(text)) {
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
        /FAIL\s+|●\s+|Expected:|Received:|at\s+\S+\.test\.\w+:\d+|AssertionError|Tests:|Test Suites:/i.test(line)
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
      return lines.filter(line =>
        /error|failed|failure|fatal|exception/i.test(line)
      );
  }
}

// ─── Stage 4: Parse test counts (Jest only) ───────────────────────────────────
function parseTestCounts(lines) {
  const text = lines.join("\n");

  // Jest format: "Tests:       1 failed, 2 passed, 3 total"
  const testsMatch = text.match(/Tests:\s+(.+)/);
  const suitesMatch = text.match(/Test Suites:\s+(.+)/);

  if (!testsMatch) return null; // not Jest or line not found — skip silently

  const tests = testsMatch[1].trim();
  const suites = suitesMatch ? suitesMatch[1].trim() : null;

  // Parse numbers from "1 failed, 2 passed, 3 total"
  const failedMatch = tests.match(/(\d+)\s+failed/);
  const passedMatch = tests.match(/(\d+)\s+passed/);
  const totalMatch  = tests.match(/(\d+)\s+total/);

  const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
  const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
  const total  = totalMatch  ? parseInt(totalMatch[1])  : 0;

  const failPercent = total > 0 ? Math.round((failed / total) * 100) : 0;

  const result = {
    summary: tests,                          // "1 failed, 2 passed, 3 total"
    suites: suites,                          // "1 failed, 1 total"
    failed,
    passed,
    total,
    fail_percent: `${failPercent}%`,
  };

  console.log(`🧪 Test counts parsed:`);
  console.log(`   Tests:  ${tests}`);
  if (suites) console.log(`   Suites: ${suites}`);
  console.log(`   Failure rate: ${failPercent}% (${failed}/${total})`);

  return result;
}

// ─── Main export ──────────────────────────────────────────────────────────────
function extractErrorLines(rawLogs) {
  const allLines = rawLogs.split("\n");
  console.log(`📊 Total raw log lines: ${allLines.length}`);

  // Stage 1 — strip noise + timestamps
  const cleanLines = stripNoise(allLines);
  console.log(`🧹 After noise removal: ${cleanLines.length} lines`);

  // Stage 2 — detect category
  const category = detectCategory(cleanLines);
  console.log(`🔍 Detected error category: ${category}`);

  // Stage 3 — extract by category
  let extracted = extractByCategory(cleanLines, category);
  console.log(`✂️  Category-specific extraction: ${extracted.length} lines`);

  // fallback if too few lines
  if (extracted.length < 3) {
    console.log(`⚠️  Too few lines, falling back to keyword filter`);
    extracted = cleanLines.filter(line =>
      /error|failed|failure|fatal|exception|exit code/i.test(line)
    );
  }

  // Stage 4 — parse test counts if Test Failure
  let testCounts = null;
  if (category === "Test Failure") {
    testCounts = parseTestCounts(extracted);
  }

  // deduplicate and limit
  const unique = [...new Set(extracted.map(l => l.trim()))].slice(0, 15);
  console.log(`✅ Final extracted lines: ${unique.length}`);

  console.log("─── Extracted lines sent to Groq ───");
  unique.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
  console.log("────────────────────────────────────");

  return {
    lines: `[Detected Category: ${category}]\n${unique.join("\n")}`,
    category,
    testCounts, // null for non-test failures
  };
}

// ─── Stage 5: Extract failed file name + line number ──────────────────────────
function extractFailedFile(lines, category) {
  for (const line of lines) {
 
    // Jest: "FAIL src/auth/user.test.js" or "FAIL ./app.test.js"
    const jestMatch = line.match(/^FAIL\s+(\S+\.(test|spec)\.(js|ts|jsx|tsx))/i);
    if (jestMatch) return jestMatch[1];
 
    // Stack trace: "at Object.<anonymous> (src/app.js:24:5)"
    const stackMatch = line.match(/\(([^)]+\.(js|ts|jsx|tsx)):(\d+):\d+\)/);
    if (stackMatch) return `${stackMatch[1]}:${stackMatch[3]}`;
 
    // TypeScript: "src/app.ts:24:5 - error TS2345"
    const tsMatch = line.match(/^(src\/[^\s:]+\.(ts|tsx)):(\d+):\d+/);
    if (tsMatch) return `${tsMatch[1]}:${tsMatch[3]}`;
 
    // Require stack: "- /home/runner/work/repo/src/app.js"
    const requireMatch = line.match(/- .+\/(src\/.+\.(js|ts|jsx|tsx))/);
    if (requireMatch) return requireMatch[1];
  }
 
  return null; // not found — skipped gracefully
}

module.exports = { fetchRunLogs, extractErrorLines };