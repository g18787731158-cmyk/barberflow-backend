#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/home/ecs-user/apps/barberflow-backend"
BRANCH="main"
PM2_APP_NAME="barberflow-backend"

BACKUP_ROOT="/home/ecs-user/.deploy_backups/barberflow-backend"
mkdir -p "${BACKUP_ROOT}"

cd "${APP_DIR}"

PREV_HEAD="$(git rev-parse HEAD)"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TS}-${PREV_HEAD}"

rollback() {
  trap - ERR
  set +e
  echo
  echo "❌ deploy failed — rolling back to ${PREV_HEAD} ..."

  # 1) 回到旧 commit
  git reset --hard "${PREV_HEAD}" >/dev/null 2>&1 || true

  # 2) 恢复 .next（如果有备份）
  if [ -d "${BACKUP_DIR}/.next" ]; then
    rm -rf .next >/dev/null 2>&1 || true
    cp -a "${BACKUP_DIR}/.next" .next || true
    echo "✅ restored .next from backup"
  else
    echo "⚠️ no .next backup found, skip restore"
  fi

  # 3) 拉起服务
  pm2 restart "${PM2_APP_NAME}" --update-env >/dev/null 2>&1 || true
  sleep 1

  # 4) 健康检查
  curl -fsS --max-time 3 "http://127.0.0.1:3000/api/health" >/dev/null \
    && echo "✅ rollback local /api/health OK" \
    || echo "⚠️ rollback local /api/health FAIL (check pm2 logs)"

  echo "==> rollback done"
  pm2 list || true
  exit 1
}

trap rollback ERR

echo "==> cd ${APP_DIR}"
echo "==> backup to ${BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}"
echo "${PREV_HEAD}" > "${BACKUP_DIR}/HEAD"

# 备份 .next（如果存在）
if [ -d .next ]; then
  cp -a .next "${BACKUP_DIR}/.next"
  echo "✅ backup .next done"
else
  echo "ℹ️ no .next to backup (first deploy?)"
fi

echo "==> git remote"
git remote -v || true

echo "==> fetch origin/${BRANCH}"
git fetch origin "${BRANCH}"

echo "==> compute changed files: HEAD..origin/${BRANCH}"
CHANGED_FILES="$(git diff --name-only HEAD..origin/${BRANCH} || true)"
echo "${CHANGED_FILES}" | sed -n '1,200p' || true

NEED_NPM_CI=0
NEED_PRISMA_GENERATE=0

# package/lock 改了 => npm ci
if echo "${CHANGED_FILES}" | grep -Eq '(^|/)(package-lock\.json|package\.json)$'; then
  NEED_NPM_CI=1
fi

# prisma 相关变更 => prisma generate
if echo "${CHANGED_FILES}" | grep -Eq "(^|/)prisma/(schema\.prisma|migrations/)|(^|/)prisma\.config\.ts$"; then
  NEED_PRISMA_GENERATE=1
fi

echo "==> hard reset to origin/${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "==> clean untracked"
git clean -fd

# reset/clean 后再判断 node_modules（更规范）
if [ ! -d node_modules ]; then
  NEED_NPM_CI=1
fi

export npm_config_audit=false
export npm_config_fund=false
export npm_config_loglevel=warn

if [ "${NEED_NPM_CI}" -eq 1 ]; then
  echo "==> npm ci"
  npm ci
  # 只要 npm ci 跑过，保险起见也生成 Prisma Client
  NEED_PRISMA_GENERATE=1
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

# 成功后清理旧备份：只留最近10份
echo "==> cleanup old backups (keep last 10)"
ls -1dt "${BACKUP_ROOT}"/* 2>/dev/null | tail -n +11 | xargs -r rm -rf

echo "==> done ✅"
pm2 list || true
