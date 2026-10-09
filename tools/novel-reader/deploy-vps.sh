#!/usr/bin/env bash
# ส่งโค้ด novel-reader ขึ้น VPS แล้วรีสตาร์ท (VPS แปลเองได้ผ่าน impit — ไม่ต้องมี Chrome)
#
#   bash tools/novel-reader/deploy-vps.sh                  # ส่งโค้ดอย่างเดียว (library บน VPS ไม่ถูกแตะ)
#   bash tools/novel-reader/deploy-vps.sh --push-library   # ⚠ ทับ library บน VPS ด้วยของเครื่องนี้ทั้งก้อน
#   bash tools/novel-reader/deploy-vps.sh --pull-library   # ดึง library จาก VPS มาแทนของเครื่องนี้ (ของเดิมเก็บไว้ที่ library.local-<เวลา>)
#   NR_SSH=root@1.2.3.4 bash deploy-vps.sh
#
# library บน VPS = ตัวหลัก (แปล/อ่าน/ตำแหน่งอ่านเกิดที่นั่น) — push เฉพาะตอนตั้งใจย้ายของจากเครื่องนี้ขึ้นไป
# ความลับ (บัญชี, DEEPSEEK_API_KEY) อยู่ใน /etc/novel-reader.env บน VPS (root อ่านได้คนเดียว) ไม่ได้ส่งจากเครื่องนี้
set -euo pipefail
cd "$(dirname "$0")"
SSH="${NR_SSH:-novel}"
DIR=/opt/novel-reader
MODE="${1:-code}"

if [ "$MODE" = "--pull-library" ]; then
  stamp=$(date +%Y%m%d-%H%M%S)
  echo "→ ดึง library จาก VPS (ของเดิม → library.local-$stamp)"
  mkdir -p .pull && rm -rf .pull/*
  ssh "$SSH" "tar -czf - -C $DIR --exclude='library/.session-secret' library" | tar -xzf - -C .pull
  [ -d library ] && mv library "library.local-$stamp"
  mv .pull/library library && rmdir .pull
  echo "✓ เสร็จ"; exit 0
fi

FILES="server.ts auth.ts translate.ts sites.ts cdp-page.ts http-page.ts glossary.ts package.json style translators"
[ "$MODE" = "--push-library" ] && FILES="$FILES library" && echo "⚠ จะทับ library บน VPS ($(du -sh library | cut -f1))"
echo "→ ส่งโค้ด"
# ไม่ส่ง: ความลับ/บัญชี, log ค่าใช้จ่าย, สำรองคำแปล, โปรไฟล์ Chrome
tar -czf - \
  --exclude='library/.session-secret' --exclude='library/usage.jsonl' --exclude='library/*/chapters/.bak' \
  $FILES \
  | ssh "$SSH" "set -e; mkdir -p $DIR/.incoming && rm -rf $DIR/.incoming/* && tar -xzf - -C $DIR/.incoming"

ssh "$SSH" bash -s -- "$DIR" <<'REMOTE'
set -euo pipefail
DIR=$1
export PATH=/opt/node/bin:$PATH
cd "$DIR"
old=$(sha1sum package.json 2>/dev/null | cut -d' ' -f1 || true)
for f in .incoming/*.ts .incoming/package.json; do cp "$f" .; done
for d in style translators; do rm -rf "$d" && mv ".incoming/$d" .; done
if [ -d .incoming/library ]; then
  # สลับทั้งก้อน แต่เก็บกุญแจ session ของ VPS ไว้ (ไม่งั้นทุกคนหลุดล็อกอิน)
  [ -f library/.session-secret ] && cp library/.session-secret .incoming/library/
  rm -rf library.old && { [ -d library ] && mv library library.old || true; } && mv .incoming/library library && rm -rf library.old
fi
rm -rf .incoming
[ -d node_modules ] && [ "$old" = "$(sha1sum package.json | cut -d' ' -f1)" ] || npm install --omit=dev --no-audit --no-fund --loglevel=error
rm -f .env # ค่าทั้งหมดอยู่ใน /etc/novel-reader.env
chown -R root:root "$DIR" && chown -R nobody:nogroup "$DIR/library"
systemctl restart novel-reader
sleep 2
systemctl is-active novel-reader
curl -s -o /dev/null -w "local http %{http_code}\n" "http://127.0.0.1:${PORT:-4000}/"
REMOTE
echo "✓ เสร็จ — https://readnovel.kiakdza.com"
