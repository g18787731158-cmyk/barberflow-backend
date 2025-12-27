#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/ecs-user/apps/barberflow-backend"
APP_NAME="barberflow-backend"
BRANCH="main"
PORT="3000"

cd "$APP_DIR"

echo "==> cd $APP_DIR"

# ---------- backup .next ----------
BACKUP_DIR="/home/ecs-user/.deploy_backups/$APP_NAME/$(date +%Y%m%d-%H%M%S)-$(git rev-parse HEAD)"
mkdir -p "$BACKUP_DIR"
if [ -d ".next" ]; then
  cp -a .next "$BACKUP_DIR/.next"
  echo "✅ backup .next done -> $BACKUP_DIR"
else
  echo "ℹ️ no .next to backup"
fi

OLD_REV="$(git rev-parse HEAD)"
echo "==> old rev: $OLD_REV"

echo "==> fetch origin/$BRANCH"
git fetch origin "$BRANCH" --quiet

echo "==> hard reset to origin/$BRANCH"
git reset --hard "origin/$BRANCH" --quiet
NEW_REV="$(git rev-parse HEAD)"
echo "==> new rev: $NEW_REV"

# ---------- changed files ----------
echo "==> changed files: $OLD_REV..$NEW_REV"
CHANGED="$(git diff --name-only "$OLD_REV" "$NEW_REV" || true)"
echo "$CHANGED" | sed '/^$/d' || true

need_npm=0
need_migrate=0
need_generate=0

if echo "$CHANGED" | grep -Eq '^(package\.json|package-lock\.json)$'; then
  need_npm=1
fi

if echo "$CHANGED" | grep -Eq '^prisma/schema\.prisma$'; then
  need_generate=1
  need_migrate=1
fi

if echo "$CHANGED" | grep -Eq '^prisma/migrations/'; then
  need_migrate=1
fi

# ---------- clean untracked (but keep scripts + env) ----------
echo "==> clean untracked (exclude scripts/ and .env*)"
git clean -fd -e "scripts/" -e ".env*" >/dev/null || true

rollback() {
  echo
  echo "❌ deploy failed — rolling back .next ..."
  if [ -d "$BACKUP_DIR/.next" ]; then
    rm -rf .next
    cp -a "$BACKUP_DIR/.next" .next
    echo "✅ restored .next from backup"
  fi

  # PM2 兜底：不存在就 start，存在就 reload
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 reload "$APP_NAME" || true
  else
    pm2 start npm --name "$APP_NAME" -- start || true
    pm2 save || true
  fi

  curl -fsS "http://127.0.0.1:$PORT/api/health" || echo "⚠️ rollback local /api/health FAIL (check pm2 logs)"
  echo "==> rollback done"
  pm2 ls || true
}

trap rollback ERR

# ---------- install ----------
if [ "$need_npm" -eq 1 ]; then
  echo "==> npm ci"
  npm ci
else
  echo "==> skip npm ci (no package*.json change)"
fi

# ---------- migrate + generate ----------
if [ "$need_migrate" -eq 1 ]; then
  echo "==> prisma migrate deploy"
  npx prisma migrate deploy
else
  echo "==> skip prisma migrate deploy (no prisma migrations/schema change)"
fi

if [ "$need_generate" -eq 1 ] || [ "$need_migrate" -eq 1 ] || [ "$need_npm" -eq 1 ]; then
  echo "==> prisma generate"
  npx prisma generate
else
  echo "==> skip prisma generate"
fi

# ---------- build ----------
echo "==> next build"
npm run build

# ---------- pm2 reload/start ----------
echo "==> pm2 reload/start $APP_NAME"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$APP_NAME"
else
  pm2 start npm --name "$APP_NAME" -- start
fi
pm2 save

# ---------- warmup ----------
echo "==> wait app warmup"
for i in {1..20}; do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "✅ local api/health ok"
    break
  fi
  sleep 0.5
done

# ---------- nginx reload (optional, keep as you had) ----------
echo "==> nginx test/reload"
sudo nginx -t
sudo systemctl reload nginx

# ---------- smoke (optional) ----------
if [ -x "./scripts/pay-smoke.sh" ]; then
  echo "==> smoke"
  ./scripts/pay-smoke.sh
else
  echo "==> smoke skipped (scripts/pay-smoke.sh not found)"
fi

echo "✅ deploy done"
pm2 ls
