const { DynamoDBClient, PutItemCommand, QueryCommand} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const { v4: uuidv4 } = require("uuid");

const TABLE_NAME = "ci-failures";

function getClient() {
  return new DynamoDBClient({ region: process.env.AWS_REGION });
}

/**
 * Save a CI failure record to DynamoDB
 */
async function saveFailure({ repo, branch, actor, run_id, analysis }) {
  const client = getClient();

  const item = {
    id: uuidv4(),                          // unique ID for each failure
    repo,                                  // partition key — query by repo
    timestamp: new Date().toISOString(),   // sort key — query by time
    branch,
    actor,
    run_id,
    error_type: analysis.error_type,
    root_cause: analysis.root_cause,
    fix: analysis.fix,
    severity: analysis.severity,
  };

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item),
  }));

  console.log(`💾 Failure saved to DynamoDB: ${item.id}`);
  return item;
}

/**
 * Get recent failures for a repo in the last N days
 * Used for recurring failure detection
 */
async function getRecentFailures(repo, errorType, days = 7) {
  const client = getClient();

  const since = new Date();
  since.setDate(since.getDate() - days);

  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "repo = :repo AND #ts >= :since",
    FilterExpression: "error_type = :errorType",
    ExpressionAttributeNames: { "#ts": "timestamp" },
    ExpressionAttributeValues: marshall({
      ":repo": repo,
      ":since": since.toISOString(),
      ":errorType": errorType,
    }),
  }));

  return {
    count: response.Count,
    items: response.Items?.map(unmarshall) || [],
  };
}

/**
 * Get stats for a repo — total failures, most common error, etc.
 */
async function getStats(repo) {
  const client = getClient();

  // Get all failures for this repo
  const response = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "repo = :repo",
    ExpressionAttributeValues: marshall({ ":repo": repo }),
  }));

  const items = response.Items?.map(unmarshall) || [];

  if (items.length === 0) {
    return { total_failures: 0 };
  }

  // Count failures this week
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const thisWeek = items.filter(i => new Date(i.timestamp) > oneWeekAgo).length;

  // Find most common error type
  const errorCounts = {};
  const branchCounts = {};

  for (const item of items) {
    errorCounts[item.error_type] = (errorCounts[item.error_type] || 0) + 1;
    branchCounts[item.branch] = (branchCounts[item.branch] || 0) + 1;
  }

  const mostCommonError = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])[0][0];

  const mostFailingBranch = Object.entries(branchCounts)
    .sort((a, b) => b[1] - a[1])[0][0];

  // Last failure
  const sorted = items.sort((a, b) =>
    new Date(b.timestamp) - new Date(a.timestamp)
  );

  return {
    total_failures: items.length,
    this_week: thisWeek,
    most_common_error: mostCommonError,
    most_failing_branch: mostFailingBranch,
    last_failure: sorted[0].timestamp,
  };
}

module.exports = { saveFailure, getRecentFailures, getStats };