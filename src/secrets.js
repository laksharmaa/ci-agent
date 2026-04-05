// src/secrets.js
const { SSMClient, GetParametersCommand } = require("@aws-sdk/client-ssm");

let loaded = false;

async function loadSecrets() {
  if (loaded) return;

  const region = process.env.AWS_REGION;
  console.log(`🔐 Loading secrets from SSM in region: ${region}`);

  // Create client inside the function to ensure AWS_REGION is already set
  const client = new SSMClient({ region });

  const PARAM_NAMES = [
    "/ai-devops-agent/GITHUB_TOKEN",
    "/ai-devops-agent/GROQ_API_KEY",
    "/ai-devops-agent/AGENT_SECRET",
    "/ai-devops-agent/SLACK_WEBHOOK_URL",
  ];

  const command = new GetParametersCommand({
    Names: PARAM_NAMES,
    WithDecryption: true,
  });

  const response = await client.send(command);

  console.log(`📦 SSM returned ${response.Parameters.length} parameters`);

  if (response.InvalidParameters?.length > 0) {
    console.error("❌ Missing SSM parameters:", response.InvalidParameters);
  }

  for (const param of response.Parameters) {
    const key = param.Name.split("/").pop();
    process.env[key] = param.Value;
    console.log(`  ✓ Set process.env.${key}`);
  }

  // Verify they are actually set
  console.log("🔎 Verify AGENT_SECRET:", process.env.AGENT_SECRET ? "SET" : "STILL UNDEFINED");

  loaded = true;
  console.log("✅ All secrets loaded");
}

module.exports = { loadSecrets };