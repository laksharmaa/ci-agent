# Usage: bash scripts/deploy.sh

set -e

STACK_NAME="ai-devops-agent"
REGION="ap-south-1"
S3_BUCKET="ai-devops-agent-deploy-$(whoami)"   # ✅ fixed name, no timestamp

echo "📦 Installing production dependencies..."
npm install --production   # intentional — excludes jest/supertest from Lambda bundle

echo ""
echo "🪣 Checking S3 bucket..."
# aws s3api head-bucket --bucket $S3_BUCKET 2>/dev/null && \
AWS_PAGER="" aws s3api head-bucket --bucket $S3_BUCKET 2>/dev/null
  echo "✅ Bucket already exists, reusing: $S3_BUCKET" || \
  aws s3 mb s3://$S3_BUCKET --region $REGION && \
  echo "✅ Created new bucket: $S3_BUCKET"

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