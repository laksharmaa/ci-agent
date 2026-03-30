// src/lambda.js
// Wraps the Express app for AWS Lambda using serverless-http

const serverless = require("serverless-http");
const app = require("./app"); // Express app (extracted from index.js)

// serverless-http bridges API Gateway events → Express req/res
module.exports.handler = serverless(app);