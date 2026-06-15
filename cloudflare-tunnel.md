# เปิดแอปออกเน็ตด้วย Cloudflare Tunnel

รันสแตกบนเครื่องตัวเอง (Gemma + ComfyUI ฟรี) แล้วเข้าถึงจากที่ไหนก็ได้ผ่านโดเมนของคุณ
โดย **ไม่ต้อง** เปิด port / ตั้ง firewall / มี public IP — cloudflared ต่อขาออกไปหา Cloudflare เอง

> ใช้แบบ **token** (ง่ายสุด): cloudflared รันใน docker, hostname→service ตั้งในเว็บ Cloudflare ไม่ต้องลงอะไรในเครื่อง

---

## ขั้นที่ 0 — เอาโดเมนเข้า Cloudflare (ทำครั้งเดียว)
1. สมัคร/ล็อกอิน [dash.cloudflare.com](https://dash.cloudflare.com) → **Add a site** → ใส่โดเมนคุณ → เลือกแพลน **Free**
2. Cloudflare จะให้ **nameserver 2 ตัว** → เอาไปตั้งที่ผู้ขายโดเมน (registrar) แทนของเดิม
3. รอจน status ขึ้น **Active** (ปกติไม่กี่นาที–ชม.)

## ขั้นที่ 1 — สร้าง Tunnel + เอา token
1. ไป [one.dash.cloudflare.com](https://one.dash.cloudflare.com) (Zero Trust) → **Networks → Tunnels → Create a tunnel**
2. เลือก **Cloudflared** → ตั้งชื่อ เช่น `novel` → **Save**
3. หน้าถัดมาจะโชว์คำสั่งติดตั้งที่มี token ยาว ๆ (`...run --token eyJ...`)
   → **คัดลอกเฉพาะ token** (ส่วน `eyJ...` ทั้งก้อน)

## ขั้นที่ 2 — วาง token ลง .env
ในโฟลเดอร์โปรเจกต์ (ไฟล์ `.env` ที่ก๊อปจาก `.env.docker.example`):
```env
CLOUDFLARE_TUNNEL_TOKEN=eyJ...        # << วาง token ที่ก๊อปมา
```

## ขั้นที่ 3 — ตั้ง Public Hostname (ชี้โดเมน → แอป)
กลับไปที่ tunnel → แท็บ **Public Hostname → Add a public hostname**
| ช่อง | ใส่ |
|---|---|
| Subdomain | เช่น `novel` (เว้นว่าง = root domain) |
| Domain | เลือกโดเมนคุณ |
| Type | **HTTP** |
| URL | `web:3001` |

> `web:3001` คือ service frontend ใน compose — cloudflared อยู่เน็ตเวิร์กเดียวกันเลยเรียกชื่อ service ได้ตรง ๆ (frontend proxy `/api`,`/uploads` ไป backend ให้เองอยู่แล้ว)

กด **Save hostname**

## ขั้นที่ 4 — รัน
```bash
docker compose --profile tunnel up -d --build
```
เปิด `https://novel.yourdomain.com` ได้เลย — Cloudflare ออก HTTPS ให้อัตโนมัติ ✅

เช็ก tunnel ขึ้นไหม: `docker compose logs -f cloudflared` (ควรเห็น `Registered tunnel connection`)

---

## ⚠️ สำคัญมาก — ใส่ล็อกอินกันคนอื่นเข้า (แอปนี้ไม่มี auth + เป็น R18 + มีดาต้าส่วนตัว)
ตอนนี้ใครมีลิงก์ก็เข้าได้หมด → ปิดด้วย **Cloudflare Access** (ฟรี):
1. Zero Trust → **Access → Applications → Add an application → Self-hosted**
2. Application domain = `novel.yourdomain.com`
3. Policy → Action **Allow** → Include → **Emails** → ใส่อีเมลคุณ
4. Save — ทีนี้เปิดเว็บจะเจอหน้า login ของ Cloudflare ส่งรหัส OTP ไปเมลคุณก่อนเข้าทุกครั้ง

---

## หยุด / ปรับ
- หยุดเฉพาะ tunnel แต่แอปยังรัน: `docker compose stop cloudflared`
- รันปกติ (ไม่เปิดออกเน็ต): `docker compose up -d` (ไม่ใส่ `--profile tunnel`)
- เปลี่ยน hostname/route: แก้ในเว็บ Cloudflare ได้เลย ไม่ต้อง restart container
