# ย้ายข้อมูล DB "novel" จาก MongoDB Atlas → MongoDB local
# ใช้เมื่อ Atlas ต่อติด (แนะนำ: ปิด VPN ก่อนรัน เพราะ VPN ทำ TLS ล้มได้)
# อ่าน Atlas URI จาก .env.atlas.bak (สำรองไว้ตอนสลับมา local)
$ErrorActionPreference = 'Stop'
$root  = Split-Path $MyInvocation.MyCommand.Path -Parent
$bak   = Join-Path $root '.env.atlas.bak'
$tools = 'C:\Program Files\MongoDB\Tools\100\bin'
$dump  = Join-Path $env:TEMP 'novel_dump'

if (-not (Test-Path $bak)) { Write-Host 'ไม่พบ .env.atlas.bak — ไม่มี Atlas URI ให้ย้าย'; exit 1 }
$atlas = (Select-String -Path $bak -Pattern '^\s*MONGODB_URI\s*=\s*(.+?)\s*$').Matches[0].Groups[1].Value.Trim('"').Trim("'")
if (-not $atlas) { Write-Host 'อ่าน MONGODB_URI จาก .env.atlas.bak ไม่ได้'; exit 1 }

if (Test-Path $dump) { Remove-Item $dump -Recurse -Force }
Write-Host '[1/2] dumping novel จาก Atlas ...'
& "$tools\mongodump.exe" --uri="$atlas" --db=novel --out=$dump
if ($LASTEXITCODE -ne 0) { Write-Host 'dump ไม่สำเร็จ — Atlas ต่อไม่ติด (ลองปิด VPN / เช็ก IP allowlist)'; exit 1 }

Write-Host '[2/2] restoring → local (mongodb://127.0.0.1:27017) ...'
& "$tools\mongorestore.exe" --uri="mongodb://127.0.0.1:27017" --db=novel --drop "$dump\novel"
if ($LASTEXITCODE -ne 0) { Write-Host 'restore ไม่สำเร็จ'; exit 1 }

Write-Host 'เสร็จ! ตรวจด้วย: mongosh mongodb://127.0.0.1:27017/novel --eval "db.getCollectionNames()"'
