// src/lambda.js
const serverless = require("serverless-http");
const { loadSecrets } = require("./secrets");
const app = require("./app");

const serverlessApp = serverless(app);

module.exports.handler = async (event, context) => {
  await loadSecrets();
  return serverlessApp(event, context);
};