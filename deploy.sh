
#!/usr/bin/env bash

set -euo pipefail

APP_DIR="/home/ecs-user/apps/barberflow-backend"

BRANCH="main"

PM2_APP_NAME="barberflow-backend"

echo "==> cd ${APP_DIR}"

cd "${APP_DIR}"

echo "==> git remote"

git remote -v || true

echo "==> fetch origin/${BRANCH}"

git fetch origin "${BRANCH}"

echo "==> compute changed files: HEAD..origin/${BRANCH}"

CHANGED_FILES="$(git diff --name-only HEAD..origin/${BRANCH} || true)"

echo "${CHANGED_FILES}" | sed -n '1,200p' || true

NEED_NPM_CI=0

NEED_PRISMA_GENERATE=0

# 如果 node_modules 不存在，也必须 npm ci（规范+防崩）

if [ ! -d node_modules ]; then

  NEED_NPM_CI=1

fi

if echo "${CHANGED_FILES}" | grep -Eq '(^|/)(package-lock\.json|package\.json)$'; then

  NEED_NPM_CI=1

fi
if echo "${CHANGED_FILES}" | grep -Eq '(^|/)prisma/schema\.prisma$'; then

  NEED_PRISMA_GENERATE=1

fi

echo "==> hard reset to origin/${BRANCH}"

git reset --hard "origin/${BRANCH}"

echo "==> clean untracked"

git clean -fd

export npm_config_audit=false

export npm_config_fund=false

export npm_config_loglevel=warn

if [ "${NEED_NPM_CI}" -eq 1 ]; then

  echo "==> npm ci"

  npm ci

else

  echo "==> skip npm ci"

fi
if [ "${NEED_PRISMA_GENERATE}" -eq 1 ]; then

  echo "==> prisma generate"

  npx prisma generate

else

  echo "==> skip prisma generate"

fi
echo "==> next build"

export NODE_OPTIONS="--max-old-space-size=768"

npm run build

echo "==> pm2 restart ${PM2_APP_NAME}"

pm2 restart "${PM2_APP_NAME}" --update-env

echo "==> wait 1s and local health check"

sleep 1

curl -fsS --max-time 3 "http://127.0.0.1:3000/api/health" >/dev/null && echo "  ✅ local /api/health OK"

echo "==> public healthz check"

curl -fsS --max-time 5 "https://barberflow.cn/healthz" >/dev/null && echo "  ✅ public /healthz OK" || echo "  ⚠️ public /healthz not reachable (ignore)"

echo "==> done ✅"

pm2 list || true

