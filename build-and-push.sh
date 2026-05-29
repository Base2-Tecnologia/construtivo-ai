#!/bin/bash
# =============================================================================
# Build e push das imagens Docker para o ECR da AWS
# Pré-requisitos: aws cli configurado, docker instalado e rodando
#
# Uso: ./build-and-push.sh <environment> <aws-account-id> [aws-region]
# Exemplo: ./build-and-push.sh prd 123456789012 us-east-1
# =============================================================================

set -euo pipefail

ENV="${1:?Informe o environment: prd | qa | dev}"
ACCOUNT_ID="${2:?Informe o AWS Account ID}"
REGION="${3:-us-east-1}"
PROJECT="hamoa"

API_ECR="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${PROJECT}-${ENV}-api-ecr"
WEB_ECR="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${PROJECT}-${ENV}-web-ecr"

GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
TAG="${GIT_SHA}"

echo "=== Login no ECR ==="
aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# =============================================================================
# API — Node.js
# =============================================================================
echo ""
echo "=== Build da API ==="
docker build \
  --platform linux/amd64 \
  -t "${API_ECR}:${TAG}" \
  -t "${API_ECR}:latest" \
  hamoa-obras-docker/api

echo "=== Push da API ==="
docker push "${API_ECR}:${TAG}"
docker push "${API_ECR}:latest"

# =============================================================================
# Web — Nginx
# O contexto é hamoa-obras-docker/nginx, mas o COPY ../app precisa subir
# um nível, por isso usamos hamoa-obras-docker como contexto.
# =============================================================================
echo ""
echo "=== Build do Nginx/Web ==="
docker build \
  --platform linux/amd64 \
  -t "${WEB_ECR}:${TAG}" \
  -t "${WEB_ECR}:latest" \
  -f hamoa-obras-docker/nginx/Dockerfile \
  hamoa-obras-docker

echo "=== Push do Nginx/Web ==="
docker push "${WEB_ECR}:${TAG}"
docker push "${WEB_ECR}:latest"

echo ""
echo "=== Concluído ==="
echo "API:  ${API_ECR}:${TAG}"
echo "Web:  ${WEB_ECR}:${TAG}"
echo ""
echo "Para atualizar o ECS com a nova imagem:"
echo "  aws ecs update-service --cluster ${PROJECT}-${ENV}-api-cluster --service ${PROJECT}-${ENV}-api --force-new-deployment --region ${REGION}"
echo "  aws ecs update-service --cluster ${PROJECT}-${ENV}-web-cluster --service ${PROJECT}-${ENV}-web --force-new-deployment --region ${REGION}"
