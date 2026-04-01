#!/bin/bash
# scripts/setup-ssm.sh
# Run this ONCE before deploying — stores all secrets in AWS SSM Parameter Store
# Usage: bash scripts/setup-ssm.sh
# Make sure you're logged in: aws configure

REGION="ap-south-1"

echo "Storing secrets in AWS SSM Parameter Store..."

read -p "GitHub Token (PAT): " GITHUB_TOKEN
read -p "Groq API Key: " GROQ_API_KEY
read -p "Twilio Account SID: " TWILIO_ACCOUNT_SID
read -p "Twilio Auth Token: " TWILIO_AUTH_TOKEN
read -p "Twilio WhatsApp FROM (e.g. whatsapp:+14155238886): " TWILIO_FROM
read -p "Twilio WhatsApp TO (e.g. whatsapp:+91XXXXXXXXXX): " TWILIO_TO
read -p "Agent Secret (any random string): " AGENT_SECRET

aws ssm put-parameter --name "/ai-devops-agent/GITHUB_TOKEN"        --value "$GITHUB_TOKEN"       --type SecureString --region $REGION --overwrite
aws ssm put-parameter --name "/ai-devops-agent/GROQ_API_KEY"        --value "$GROQ_API_KEY"        --type SecureString --region $REGION --overwrite
aws ssm put-parameter --name "/ai-devops-agent/TWILIO_ACCOUNT_SID"  --value "$TWILIO_ACCOUNT_SID"  --type SecureString --region $REGION --overwrite
aws ssm put-parameter --name "/ai-devops-agent/TWILIO_AUTH_TOKEN"   --value "$TWILIO_AUTH_TOKEN"   --type SecureString --region $REGION --overwrite
aws ssm put-parameter --name "/ai-devops-agent/TWILIO_WHATSAPP_FROM" --value "$TWILIO_FROM"        --type SecureString --region $REGION --overwrite
aws ssm put-parameter --name "/ai-devops-agent/TWILIO_WHATSAPP_TO"  --value "$TWILIO_TO"           --type SecureString --region $REGION --overwrite
aws ssm put-parameter --name "/ai-devops-agent/AGENT_SECRET"        --value "$AGENT_SECRET"        --type SecureString --region $REGION --overwrite

echo ""
echo "All secrets stored in SSM!"
echo "Now run: bash scripts/deploy.sh"