#!/usr/bin/env bash
# แปลด้วย Codex (แพ็กเกจ ChatGPT ในเครื่องนี้ ไม่ใช้ API key) ทีละชุด 50 บท → อัปขึ้น VPS + สร้างหน้าอ่านใหม่ แล้วทำชุดถัดไปเอง
# ต้องมี library/<เรื่อง>/raw/ (prefetch.ts บน VPS แล้วดึงลงมา) + glossary.json + progress.json ล่าสุดจาก VPS
#
#   bash codex-batch.sh <บทเริ่ม> <บทสุดท้าย> [workers=6] [เรื่อง=45305]
#   ดูความคืบหน้า: tail -f logs/codex-batch.log
# บทที่ล้มเหลว (codex ค้าง/โควตาหมด) ลองซ้ำในชุดเดียวกันสูงสุด 3 รอบ ; ยังไม่ครบ → ไปชุดถัดไป แล้วเก็บตกตอนจบ
set -u
cd "$(dirname "$0")"
FROM=$1; TO=$2; W=${3:-6}; BOOK=${4:-45305}
SSH=${NR_SSH:-novel}; DIR=/opt/novel-reader
LIBB=library/$BOOK
mkdir -p logs
log() { echo "[$(date '+%m-%d %H:%M')] $*" | tee -a logs/codex-batch.log; }

# บทในช่วงที่มีต้นฉบับแต่ยังไม่มีคำแปล
missing() {
  node -e '
    const fs=require("fs"); const [lib,a,b]=process.argv.slice(1);
    const o=JSON.parse(fs.readFileSync(lib+"/progress.json","utf8")).order;
    const m=[]; for(let n=+a;n<=+b&&n<=o.length;n++){ if(fs.existsSync(`${lib}/raw/${o[n-1]}.json`)&&!fs.existsSync(`${lib}/chapters/chapter${n}.md`)) m.push(n); }
    console.log(m.join(","));' "$LIBB" "$1" "$2"
}

# อัปบทในช่วง + คลังคำ ขึ้น VPS แล้วให้ VPS สร้างหน้าอ่าน/จุดต่อใหม่ (--raw ไม่มีบทให้แปล = แค่ปรับ progress + reader)
push() {
  local a=$1 b=$2
  local files; files=$(cd "$LIBB/chapters" && for ((n=a; n<=b; n++)); do [ -f chapter$n.md ] && echo chapter$n.md chapter$n.zh.md; done)
  [ -z "$files" ] && return
  (cd "$LIBB/chapters" && tar cf - $files) | ssh "$SSH" "tar xf - -C $DIR/$LIBB/chapters" || { log "push ล้มเหลว $a-$b"; return; }
  # คลังคำ: รวมสองทางกับของ VPS (เผื่อแก้มือบนเว็บ) — เติมเฉพาะคำที่อีกฝั่งยังไม่มี
  scp -q "$LIBB/glossary.json" "$SSH:/tmp/glossary.codex.json"
  ssh "$SSH" "cd $DIR && python3 - <<'PY'
import json
L='$LIBB/glossary.json'
v=json.load(open(L,encoding='utf8')); c=json.load(open('/tmp/glossary.codex.json',encoding='utf8'))
for z,x in c['characters'].items(): v['characters'].setdefault(z,x)
for z,t in c['terms'].items(): v['terms'].setdefault(z,t)
json.dump(v,open(L,'w',encoding='utf8'),ensure_ascii=False,indent=2)
PY
set -a; . /etc/novel-reader.env; set +a; /opt/node/bin/node translate.ts --raw --book $BOOK --range 1-0 > /dev/null 2>&1" \
    && log "อัปขึ้นเซิร์ฟแล้ว บท $a-$b (อ่านได้ที่หน้าเว็บ)"
}

log "เริ่ม: บท $FROM-$TO · ครั้งละ $W บท · ชุดละ 50"
for ((s=FROM; s<=TO; s+=50)); do
  e=$((s+49)); [ $e -gt $TO ] && e=$TO
  for try in 1 2 3; do
    node translate.ts --raw --provider codex --book "$BOOK" --range "$s-$e" --workers "$W" >> logs/codex-batch.log 2>&1
    m=$(missing "$s" "$e")
    [ -z "$m" ] && break
    log "ชุด $s-$e ยังขาด: $m (รอบ $try)"
  done
  push "$s" "$e"
done
m=$(missing "$FROM" "$TO")
if [ -n "$m" ]; then
  log "เก็บตก: $m"
  node translate.ts --raw --provider codex --book "$BOOK" --range "$FROM-$TO" --only "$m" --workers "$W" >> logs/codex-batch.log 2>&1
  push "$FROM" "$TO"
fi
log "จบ: ยังขาด [$(missing "$FROM" "$TO")]"
