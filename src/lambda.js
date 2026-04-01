// src/lambda.js
const serverless = require("serverless-http");
const { loadSecrets } = require("./secrets");
const app = require("./app");

const serverlessApp = serverless(app);

module.exports.handler = async (event, context) => {
  await loadSecrets();

  // 🔍 Temporary debug — remove after fixing
  console.log("DEBUG env check:", {
    AGENT_SECRET: process.env.AGENT_SECRET ? `"${process.env.AGENT_SECRET}"` : "undefined",
    GROQ_API_KEY: process.env.GROQ_API_KEY ? "set" : "undefined",
    GITHUB_TOKEN: process.env.GITHUB_TOKEN ? "set" : "undefined",
    AWS_REGION: process.env.AWS_REGION,
  });

  return serverlessApp(event, context);
};