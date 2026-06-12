#!/bin/bash
set -e

if [ -d frontend ] && [ -f frontend/package.json ]; then
  (cd frontend && npm install --no-audit --no-fund --prefer-offline)
fi

if [ -d backend ] && [ -f backend/requirements.txt ]; then
  pip install --quiet -r backend/requirements.txt || true
fi
