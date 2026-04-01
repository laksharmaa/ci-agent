#!/bin/bash
# scripts/deploy.sh
# Builds and deploys the Lambda function using AWS SAM
# Usage: bash scripts/deploy.sh

set -e  # exit on any error

STACK_NAME="ai-devops-agent"
REGION="ap-south-1"        # ← match the region you used in setup-ssm.sh
S3_BUCKET="ai-devops-agent-deploy-$(whoami)-$(date +%s)"   # unique S3 bucket for deployment artifacts

echo "📦 Installing dependencies..."
npm install --production

echo ""
echo "🪣 Creating S3 bucket for deployment (if not exists)..."
echo "Creating bucket: $S3_BUCKET"

aws s3 mb s3://$S3_BUCKET --region $REGION || {
  echo "❌ Failed to create bucket. Exiting..."
  exit 1
}

echo ""
echo "🔨 Building SAM application..."
sam build

echo ""
echo "🚀 Deploying to AWS Lambda..."
sam deploy \
  --stack-name $STACK_NAME \
  --s3-bucket $S3_BUCKET \
  --region $REGION \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Your webhook URL (copy to GitHub Secrets as AI_AGENT_URL):"
aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query "Stacks[0].Outputs[?OutputKey=='WebhookUrl'].OutputValue" \
  --output text