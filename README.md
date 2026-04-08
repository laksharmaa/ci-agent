# 🤖 AI DevOps Agent

An intelligent DevOps agent that automatically detects CI failures, analyzes logs using AI, and provides actionable insights in real-time.

---

## 📌 Overview

Debugging CI failures is time-consuming and often requires digging through hundreds of lines of logs.

This system automates that process by:
- Detecting CI failures
- Extracting and storing logs
- Analyzing errors using AI
- Sending human-readable insights + fixes to developers

---

Deployed as an AWS Lambda function via AWS SAM. Zero infrastructure to manage.

---

## How It Works

```
GitHub Actions (CI fails)
        │
        │  POST /ci-failure  {repo, run_id, branch, actor}
        ▼
API Gateway → AWS Lambda (Express via serverless-http)
        │
        ├─ 1. Fetch logs ZIP from GitHub API
        │
        ├─ 2. Extract error lines (5-stage pipeline)
        │       Strip noise → detect category → extract by category
        │       → parse test counts → extract failed file
        │
        ├─ 3. Send to Groq LLM (llama-3.1-8b-instant)
        │       Returns: error_type, root_cause, fix, severity
        │
        ├─ 4. Check DynamoDB for recurring failures (last 7 days)
        │
        ├─ 5. Save failure record to DynamoDB
        │
        └─ 6. Send Slack alert with full analysis
```

### Log Extraction Pipeline (`src/services/githubLogs.js`)

The raw GitHub log ZIP can contain thousands of lines. Before hitting the LLM, the agent runs a 5-stage pipeline to reduce it to ≤15 high-signal lines:

| Stage | What it does |
|-------|-------------|
| **1. Strip noise** | Removes runner metadata, passing test lines (`✓`), timestamps, npm notices |
| **2. Detect category** | Regex-classifies into: Test Failure, Build Error, TypeScript Error, Dependency Error, Network Error, Permission Error, Docker Error |
| **3. Extract by category** | Applies category-specific regex — e.g. for Test Failure: `FAIL`, `●`, `Expected:`, `Received:`, stack trace lines |
| **4. Parse test counts** | For Jest: extracts `failed/passed/total` and `fail_percent` from the summary line |
| **5. Extract failed file** | Detects the failing file + line number from FAIL lines, stack traces, or TypeScript errors |

### Slack Notification

The Slack alert includes:
- Repo, branch, actor, severity
- Failed file name (e.g. `./app.test.js`)
- Test counts block — only shown for Test Failures (e.g. `1/3 failed, 33%`)
- LLM root cause + suggested fix
- Recurring failure warning if the same error type appeared in the last 7 days
- Direct link to the GitHub Actions run

---

## Project Structure

```
ci-agent/
├── src/
│   ├── app.js                    # Express app — routes and pipeline orchestration
│   ├── index.js                  # Standalone server (local dev)
│   ├── lambda.js                 # Lambda handler — loads secrets, wraps Express
│   ├── services/
│   │   ├── githubLogs.js         # Log fetching + 5-stage extraction pipeline
│   │   └── analyzer.js           # Groq LLM integration
│   ├── integrations/
│   │   └── slackNotifier.js      # Slack Block Kit alert builder
│   ├── db/
│   │   └── database.js           # DynamoDB — save failures, query history, stats
│   ├── config/
│   │   └── secrets.js            # AWS SSM Parameter Store loader
│   └── utils/
│       └── retry.js              # Generic exponential backoff retry
├── scripts/
│   ├── setup-ssm.sh              # One-time: store secrets in SSM
│   └── deploy.sh                 # Build + deploy via AWS SAM
├── template.yaml                 # SAM template — Lambda + API Gateway + DynamoDB
└── package.json
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) configured (`aws configure`)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- A [Groq API key](https://console.groq.com/) (free tier works fine)
- A GitHub Personal Access Token with `repo` and `actions:read` scope
- A Slack Incoming Webhook URL

---

## Setup & Deployment

### Step 1 — Clone and install

```bash
git clone https://github.com/your-username/ci-agent.git
cd ci-agent
npm install
```

### Step 2 — Store secrets in AWS SSM (run once)

This script stores all secrets as encrypted `SecureString` parameters in AWS SSM Parameter Store. The Lambda reads them at cold start — no secrets ever in environment variables or code.

```bash
bash scripts/setup-ssm.sh
```

You will be prompted for:

| Prompt | What to enter |
|--------|--------------|
| GitHub Token (PAT) | A GitHub PAT with `repo` + `actions:read` scope |
| Groq API Key | Your key from [console.groq.com](https://console.groq.com) |
| Agent Secret | Any random string — used to authenticate webhook calls from GitHub Actions |

> The script stores parameters under the `/ai-devops-agent/` prefix in the `ap-south-1` region. To use a different region, edit `REGION` at the top of the script.

### Step 3 — Deploy with AWS SAM

```bash
bash scripts/deploy.sh
```

This script:
1. Runs `npm install --production` (excludes dev dependencies like jest from the Lambda bundle)
2. Creates or reuses an S3 bucket for deployment artifacts (`ai-devops-agent-deploy-<your-username>`)
3. Runs `sam build` to package the function
4. Runs `sam deploy` to create/update the CloudFormation stack

At the end, it prints your webhook URL:

```
Your webhook URL (copy to GitHub Secrets as AI_AGENT_URL):
https://xxxxxxxxxx.execute-api.ap-south-1.amazonaws.com/Prod
```

AWS resources created by SAM:
- **Lambda function** — `ai-devops-agent` (Node.js 20, 256MB, 60s timeout)
- **API Gateway** — exposes `/ci-failure`, `/health`, `/stats`
- **DynamoDB table** — `ci-failures` (on-demand billing, `repo` + `timestamp` key schema)
- **IAM role** — least-privilege: SSM read + DynamoDB read/write only

### Step 4 — Configure GitHub Actions

Add two secrets to your repository (`Settings → Secrets → Actions`):

| Secret name | Value |
|-------------|-------|
| `AI_AGENT_URL` | The webhook URL from Step 3 |
| `AGENT_SECRET` | The same random string you entered in Step 2 |

Then add this job to your workflow file (`.github/workflows/ci.yml`):

```yaml
notify-agent:
  needs: test          # run after your test job
  if: failure()        # only on failure
  runs-on: ubuntu-latest
  steps:
    - name: Notify AI DevOps Agent
      run: |
        curl -s -X POST "${{ secrets.AI_AGENT_URL }}/ci-failure" \
          -H "Content-Type: application/json" \
          -H "x-agent-secret: ${{ secrets.AGENT_SECRET }}" \
          -d '{
            "repo": "${{ github.repository }}",
            "run_id": "${{ github.run_id }}",
            "branch": "${{ github.ref_name }}",
            "actor": "${{ github.actor }}"
          }'
```

---

## API Endpoints

### `POST /ci-failure`
Receives a CI failure webhook. Triggers the full pipeline.

**Headers:** `x-agent-secret: <your-secret>`

**Body:**
```json
{
  "repo": "owner/repo-name",
  "run_id": "123456789",
  "branch": "main",
  "actor": "github-username"
}
```

**Response:** `{ "status": "done", "run_id": "123456789" }`

---

### `GET /stats?repo=owner/repo-name`
Returns failure history stats for a repo.

**Headers:** `x-agent-secret: <your-secret>`

**Response:**
```json
{
  "total_failures": 24,
  "this_week": 3,
  "most_common_error": "Test Failure",
  "most_failing_branch": "feature/auth",
  "last_failure": "2026-04-08T19:43:00.000Z"
}
```

---

### `GET /health`
No auth required. Returns `{ "status": "ok", "timestamp": "..." }`.

---

## Local Development

Create a `.env` file in the project root:

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GROQ_API_KEY=gsk_xxxxxxxxxxxx
AGENT_SECRET=any-random-string
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
AWS_REGION=ap-south-1
```

Then run:

```bash
npm run dev   # starts with nodemon on port 3000
```

Test the webhook locally:

```bash
curl -X POST http://localhost:3000/ci-failure \
  -H "Content-Type: application/json" \
  -H "x-agent-secret: any-random-string" \
  -d '{"repo":"owner/repo","run_id":"123456789","branch":"main","actor":"you"}'
```

> Note: `src/index.js` is the standalone local server. `src/lambda.js` is the Lambda entry point used in production. Both use the same `src/app.js` Express application.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 |
| HTTP framework | Express (wrapped by `serverless-http` for Lambda) |
| LLM | Groq — `llama-3.1-8b-instant` |
| Infra-as-code | AWS SAM (CloudFormation) |
| Compute | AWS Lambda |
| API | AWS API Gateway |
| Database | AWS DynamoDB (on-demand) |
| Secrets | AWS SSM Parameter Store (SecureString) |
| Notifications | Slack Incoming Webhooks (Block Kit) |
| Log fetching | GitHub Actions API + `adm-zip` |
