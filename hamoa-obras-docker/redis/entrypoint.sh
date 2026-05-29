#!/bin/sh
# REDIS_PASS é injetado pelo ECS via Secrets Manager antes do container iniciar.
set -e
exec redis-server \
  --requirepass "${REDIS_PASS}" \
  --appendonly yes \
  --maxmemory 256mb \
  --maxmemory-policy allkeys-lru
