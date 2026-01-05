#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/ecs-user/apps/barberflow-backend"
APP_NAME="barberflow-backend"
BRANCH="main"
PORT="3000"

cd "$APP_DIR"
echo "==> cd $APP_DIR"

# ---------- fix: remove stray lockfiles that confuse Next workspace root ----------
# Next/Turbopack may infer workspace root by scanning parent dirs for lockfiles.
# If there's a lockfile in /home/ecs-user, it can cause weird root selection.
STRAY_LOCKS=(
  "/home/ecs-user/package-lock.json"
  "/home/ecs-user/pnpm-lock.yaml"
  "/home/ecs-user/yarn.lock"
)
for f in "${STRAY_LOCKS[@]}"; do
  if [ -f "$f" ]; then
    echo "⚠️ removing stray lockfile: $f"
    rm -f "$f"
  fi
done

# ---------- backup .next (ONLY if valid) ----------
OLD_REV="$(git rev-parse HEAD)"
BACKUP_DIR="/home/ecs-user/.deploy_backups/$APP_NAME/$(date +%Y%m%d-%H%M%S)-$OLD_REV"
BACKUP_OK=0

mkdir -p "$BACKUP_DIR"
if [ -f ".next/BUILD_ID" ]; then
  cp -a .next "$BACKUP_DIR/.next"
  BACKUP_OK=1
  echo "✅ backup .next done -> $BACKUP_DIR"
else
  echo "ℹ️ skip backup .next (BUILD_ID missing)"
fi

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
  echo "❌ deploy failed — rollback ..."

  # If we have a VALID .next backup, restore it; otherwise stop to prevent CPU restart loop
  if [ "$BACKUP_OK" -eq 1 ] && [ -d "$BACKUP_DIR/.next" ]; then
    rm -rf .next
    cp -a "$BACKUP_DIR/.next" .next
    echo "✅ restored .next from backup"
  else
    echo "⚠️ no valid .next backup; stopping pm2 to avoid restart loop"
    pm2 stop "$APP_NAME" >/dev/null 2>&1 || true
    pm2 ls || true
    echo "==> rollback done (pm2 stopped). Check logs:"
    echo "    pm2 logs $APP_NAME --err --lines 200"
    return 0
  fi

  # PM2 fallback: reload if exists, else start
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
# Hard reset might leave partial .next from previous runs in weird cases; ensure clean build output
echo "==> clean .next (prevent partial build artifacts)"
rm -rf .next

echo "==> next build"
nice -n 10 npm run build

# ---------- ensure BUILD_ID exists ----------
if [ ! -s ".next/BUILD_ID" ]; then
  echo "❌ BUILD_ID missing after build — abort"
  exit 1
fi
echo "✅ BUILD_ID: $(cat .next/BUILD_ID)"

# ---------- pm2 reload/start ----------
echo "==> pm2 reload/start $APP_NAME"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env
else
  pm2 start npm --name "$APP_NAME" -- start
fi
pm2 save

# ---------- warmup (must succeed) ----------
echo "==> wait app warmup"
ok=0
for i in {1..30}; do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    ok=1
    echo "✅ local api/health ok"
    break
  fi
  sleep 0.5
done
if [ "$ok" -ne 1 ]; then
  echo "❌ warmup timeout — abort"
  exit 1
fi

# ---------- nginx reload (optional) ----------
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
