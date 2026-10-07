#!/bin/bash
set -e

echo "Ciphera Production Deployment Script"
echo "===================================="

# 1. Build images
echo "Building Docker Images..."
docker build -t $ECR_REGISTRY/ciphera-backend:latest ./backend
docker build -t $ECR_REGISTRY/ciphera-worker:latest ./backend
docker build -t $ECR_REGISTRY/ciphera-frontend:latest ./frontend

# 2. Push to Registry (ECR/GCR)
echo "Pushing to registry..."
docker push $ECR_REGISTRY/ciphera-backend:latest
docker push $ECR_REGISTRY/ciphera-worker:latest
docker push $ECR_REGISTRY/ciphera-frontend:latest

# 3. Deploy via SSH (or Kubernetes/Terraform)
echo "Deploying to production server..."
scp deploy/docker-compose.prod.yml ubuntu@$PROD_SERVER_IP:~/ciphera/
ssh ubuntu@$PROD_SERVER_IP "cd ~/ciphera && docker-compose -f docker-compose.prod.yml pull && docker-compose -f docker-compose.prod.yml up -d"

echo "Deployment Successful!"
