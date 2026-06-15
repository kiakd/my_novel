# SSH เข้า VPS — คู่มือ (Windows client → Linux VPS)

เครื่องคุณ = Windows 11 (PowerShell + OpenSSH ในตัว), ปลายทาง = VPS Linux (Ubuntu/Debian)
ตอนเช่า VPS จะได้ **IP + user (มัก `root`) + รหัสผ่าน** มาทางอีเมล/แผงควบคุม

> แทนค่าเหล่านี้ตลอดทั้งไฟล์: `VPS_IP` = ไอพีจริง, `USER` = user (เช่น `root`)

---

## 1) เช็ค OpenSSH บน Windows (มีมาในตัวอยู่แล้ว)
เปิด **PowerShell** แล้ว:
```powershell
ssh -V          # ควรขึ้น OpenSSH_for_Windows...
```
ไม่มี → ลงผ่าน: Settings → System → Optional features → "OpenSSH Client" → Install

## 2) ล็อกอินครั้งแรกด้วยรหัสผ่าน (ทดสอบว่าเข้าได้)
```powershell
ssh USER@VPS_IP
# ครั้งแรกถาม "Are you sure...(yes/no)" → พิมพ์ yes → ใส่รหัสผ่าน
```
เข้าได้ = เน็ตเวิร์ก/ข้อมูลถูก ออกด้วย `exit`

---

## 3) สร้าง SSH key (แนะนำ — ปลอดภัยกว่ารหัสผ่าน)

> ทำ **2 คู่แยกกัน**: (A) คีย์ส่วนตัวไว้ล็อกอินเอง, (B) **deploy key** ไว้ให้ GitHub Actions
> แยกกันเพื่อเพิกถอนทีละอันได้ถ้าหลุด

บน PowerShell:
```powershell
# (A) คีย์ส่วนตัว (ใส่ passphrase ตอนถามก็ได้ เพิ่มความปลอดภัย)
ssh-keygen -t ed25519 -C "kiakd-laptop" -f $env:USERPROFILE\.ssh\id_ed25519

# (B) deploy key สำหรับ CI — "ห้ามใส่ passphrase" (เว้นว่าง กด Enter) เพราะ Actions พิมพ์รหัสไม่ได้
ssh-keygen -t ed25519 -C "github-actions-deploy" -f $env:USERPROFILE\.ssh\novel_deploy
```
แต่ละคู่ได้ 2 ไฟล์: `ชื่อ` (private — **ห้ามแชร์**) และ `ชื่อ.pub` (public — เอาขึ้น server ได้)

## 4) เอา public key ขึ้น VPS
Windows ไม่มี `ssh-copy-id` → ใช้ one-liner นี้ (PowerShell) ส่ง **public key ทั้ง 2 อัน** ขึ้น `authorized_keys`:
```powershell
# ส่งคีย์ A
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | ssh USER@VPS_IP "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
# ส่งคีย์ B (deploy)
Get-Content $env:USERPROFILE\.ssh\novel_deploy.pub | ssh USER@VPS_IP "cat >> ~/.ssh/authorized_keys"
```
(จะถูกถามรหัสผ่าน VPS อีกครั้ง — นี่คือครั้งท้ายๆ ที่ต้องใช้รหัส)

ทดสอบล็อกอินด้วยคีย์ (ไม่ถามรหัสแล้ว):
```powershell
ssh -i $env:USERPROFILE\.ssh\id_ed25519 USER@VPS_IP
```

## 5) ตั้ง alias ให้พิมพ์สั้น (`~/.ssh/config`)
สร้าง/แก้ไฟล์ `C:\Users\<you>\.ssh\config`:
```sshconfig
Host novel
    HostName VPS_IP
    User USER
    IdentityFile ~/.ssh/id_ed25519
    # Port 22            # ถ้าเปลี่ยน port ค่อยเปิดบรรทัดนี้
```
จากนี้แค่:
```powershell
ssh novel               # เข้าได้เลย
```

---

## 6) ผูก deploy key เข้า GitHub Actions (สำหรับ CI/CD)
CI ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) ใช้ secret `VPS_SSH_KEY` = **private key ของคีย์ B**

1. ก๊อป private key ทั้งไฟล์ (รวมบรรทัด `-----BEGIN/END-----`):
   ```powershell
   Get-Content $env:USERPROFILE\.ssh\novel_deploy | Set-Clipboard
   ```
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   | Secret | ค่า |
   |---|---|
   | `VPS_SSH_KEY` | วาง private key (คีย์ B) ที่ก๊อปไว้ |
   | `VPS_HOST` | `VPS_IP` |
   | `VPS_USER` | `USER` |
   | `VPS_PORT` | port ssh (ไม่ใส่ = 22) |
   | `GHCR_TOKEN` | PAT scope `read:packages` (ให้ VPS pull image) |

> public key ของคีย์ B อยู่ใน `authorized_keys` บน VPS แล้ว (ข้อ 4) → Actions ถึง ssh เข้าได้

---

## 7) Hardening (แนะนำหลังคีย์ใช้ได้แน่แล้ว)
บน VPS แก้ `/etc/ssh/sshd_config`:
```bash
sudo nano /etc/ssh/sshd_config
# ตั้งค่า:
#   PasswordAuthentication no        # ปิดล็อกอินด้วยรหัส (เหลือแต่คีย์)
#   PermitRootLogin prohibit-password # root เข้าได้เฉพาะคีย์
sudo systemctl restart ssh
```
⚠️ **อย่าปิด password ถ้ายังไม่ชัวร์ว่าคีย์เข้าได้** ไม่งั้นล็อกตัวเองออก — เปิด session ค้างไว้อีกหน้าต่างทดสอบก่อน

Firewall (ถ้าจะเปิด port เว็บตรง):
```bash
sudo ufw allow OpenSSH        # หรือ 'ufw allow 22'
sudo ufw allow 3001/tcp       # ถ้าจะเข้าเว็บตรง (ไม่ใช้ Cloudflare Tunnel)
sudo ufw enable
```

---

## 8) คำสั่งที่ใช้บ่อย
```powershell
# คัดลอกไฟล์ขึ้น/ลง (scp)
scp .\file.txt novel:~/             # ขึ้น VPS
scp novel:~/backup.gz .\            # ลงเครื่อง

# SSH tunnel — ดูบริการที่ไม่เปิดออกเน็ตผ่าน localhost ของเครื่องเรา
ssh -L 3001:localhost:3001 novel    # เปิด http://localhost:3001 ดูเว็บ VPS
ssh -L 27017:localhost:27017 novel  # ต่อ MongoDB ของ VPS ด้วย Compass ที่เครื่องเรา (mongo ไม่เปิด port สาธารณะ)

# รันคำสั่งเดียวแล้วออก
ssh novel "cd ~/my_novel && docker compose ps"
```

## 9) แก้ปัญหาที่เจอบ่อย
- **Permission denied (publickey)** → public key ยังไม่อยู่ใน `~/.ssh/authorized_keys` บน VPS หรือ permission ผิด (`chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`)
- **REMOTE HOST IDENTIFICATION HAS CHANGED** (หลังติดตั้ง VPS ใหม่ IP เดิม) → ลบ host key เก่า:
  ```powershell
  ssh-keygen -R VPS_IP
  ```
- **Actions deploy fail "i/o timeout / handshake"** → เช็ค `VPS_HOST/PORT` ถูกไหม, deploy key (คีย์ B) ไม่มี passphrase, firewall เปิด ssh
- **ใส่ passphrase แล้วขี้เกียจพิมพ์บ่อย** → `ssh-agent` จำให้:
  ```powershell
  Start-Service ssh-agent; ssh-add $env:USERPROFILE\.ssh\id_ed25519
  ```
