# Deploy — novel + novel-next + MongoDB (Docker Compose) บน VPS 3GB

สแตก: **MongoDB + novel (Bun/Elysia :3000) + novel-next (Next 15 standalone :3001)**
AI = **DeepSeek (cloud)** → ไม่ต้องมี GPU. ComfyUI/Gemma รันบน VPS ไม่ได้ (ปิดฟีเจอร์รูปไป)

จูนมาสำหรับ **VPS LG1XS+ (2C / 3GB / 30GB)** — build บน GitHub (CI), VPS แค่ pull → ไม่เปลือง RAM

---

## 0) เตรียม VPS (ทำครั้งเดียว)

```bash
# 1. ลง Docker + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2. swap 2GB — กัน OOM (สำคัญบน 3GB) + เผื่อ build เผลอรันบนเครื่อง
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10 && echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf

# 3. clone repo (เบา ~19MB) — ใช้แค่ docker-compose.yml + .env + โฟลเดอร์ uploads
git clone https://github.com/kiakd/my_novel.git ~/my_novel
cd ~/my_novel

# 4. ตั้งค่า env
cp .env.docker.example .env
nano .env            # ใส่ DEEPSEEK_API_KEY (อย่างอื่นปล่อย default ได้)
```

## 1) รันครั้งแรก

ดึง image ที่ CI build ไว้แล้ว (ไม่ build บนเครื่อง):

```bash
# login GHCR เพื่อ pull (ถ้า package ตั้ง private) — ใช้ PAT read:packages
echo "<GHCR_TOKEN>" | docker login ghcr.io -u kiakd --password-stdin

docker compose pull
docker compose up -d
docker compose ps          # เช็คว่าทั้ง 3 ตัว healthy
curl -s localhost:3001 -o /dev/null -w '%{http_code}\n'   # → 200
curl -s localhost:3001/api/health                          # → {"ok":true,...}
```

เปิดเว็บ: `http://<vps-ip>:3001` (frontend proxy `/api`,`/uploads` → backend ให้อัตโนมัติ)

> ยังไม่มี image บน GHCR? push เข้า `main` ให้ CI build ก่อน (ดูข้อ 3) หรือ build บน VPS ครั้งเดียวด้วย
> `docker compose up -d --build` (มี swap แล้วจะไม่ OOM)

## 2) เปิดออกเน็ต (เลือกอย่างใดอย่างหนึ่ง)
- **Cloudflare Tunnel** (แนะนำ — ไม่ต้องเปิด port/มี HTTPS ฟรี): ใส่ `CLOUDFLARE_TUNNEL_TOKEN` ใน `.env`
  แล้ว `docker compose --profile tunnel up -d` → ใน dashboard ตั้ง Public Hostname → `http://web:3001`
- **เปิด port ตรง + reverse proxy**: ตั้ง Caddy/Nginx หน้า `:3001` ทำ TLS (ออก domain เอง)

---

## 3) CI/CD (GitHub Actions → GHCR → VPS)

ไฟล์: [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
**push เข้า `main`** (แตะ `novel/`, `novel-next/`, หรือ compose) → build 2 image บน GitHub → push GHCR → ssh เข้า VPS สั่ง `git pull && docker compose pull && up -d` อัตโนมัติ

### Secrets ที่ต้องตั้ง (repo → Settings → Secrets and variables → Actions)
> วิธีสร้าง SSH key + deploy key (`VPS_SSH_KEY`) + ก๊อป public key ขึ้น VPS → ดู [SSH.md](SSH.md)

| Secret | คือ | หมายเหตุ |
|---|---|---|
| `VPS_HOST` | IP/โฮสต์ VPS | |
| `VPS_USER` | user ssh (เช่น `root` หรือ user ที่อยู่กลุ่ม docker) | |
| `VPS_SSH_KEY` | private key (ทั้งไฟล์) สำหรับ ssh เข้า VPS | ใส่ public key คู่กันใน `~/.ssh/authorized_keys` บน VPS |
| `VPS_PORT` | port ssh | ไม่ใส่ = 22 |
| `GHCR_TOKEN` | PAT (scope `read:packages`) ให้ VPS pull image | ถ้าตั้ง package เป็น public ข้ามได้ |

> build job ใช้ `GITHUB_TOKEN` push GHCR เอง (ไม่ต้องตั้ง secret เพิ่ม) — แค่เปิด permission `packages: write` ซึ่งระบุไว้ในไฟล์แล้ว

### Flow ปกติหลังเซ็ตเสร็จ
แก้โค้ด → merge เข้า `main` → รอ ~3-5 นาที → VPS อัปเดตเอง ✅ (ดู log ที่แท็บ Actions)

---

## 4) ดูแลรักษา

```bash
# log
docker compose logs -f novel        # หรือ web / mongo
# restart ตัวเดียว
docker compose restart novel
# backup mongo (รันเป็น cron รายวันได้)
docker compose exec -T mongo mongodump --db novel --archive | gzip > ~/backup-novel-$(date +%F).gz
# restore
gunzip -c ~/backup-novel-YYYY-MM-DD.gz | docker compose exec -T mongo mongorestore --archive --drop
# เคลียร์ disk (image/cache เก่า) — ทำเป็นระยะกัน 30GB เต็ม
docker system prune -af
```

## งบ RAM (LG1XS+ 3GB)
| ส่วน | mem_limit | ใช้จริงประมาณ |
|---|---|---|
| mongo (cache cap 0.5G) | 768m | ~0.4–0.7 GB |
| novel | 512m | ~0.1–0.2 GB |
| web (standalone) | 640m | ~0.2–0.4 GB |
| **รวม + OS/docker** | | **~1.5–2.2 GB** → เหลือ headroom + swap |

## หมายเหตุ
- **ไม่มี GPU** → เจนรูป/วิดีโอ/3D (ComfyUI) ใช้ไม่ได้บน VPS, prose ผ่าน DeepSeek ทำงานปกติ
- `./novel/uploads` ผูกเป็น volume → รูป/อวตารที่อัปไว้ไม่หายตอน redeploy
- mongo ไม่เปิด port ออกเน็ต (เข้าได้แค่ใน network ของ compose) — ปลอดภัยกว่า
