@echo off
rem เปิด Chrome โปรไฟล์แยกสำหรับอ่านนิยาย + เปิดพอร์ต 9222 ให้ translate.ts ต่อเข้ามาได้
rem (translate.ts เปิดให้เองได้ถ้ายังไม่เปิด) — flag disable-*background* กันแท็บเบื้องหลังถูกแช่แข็งจนต่อ CDP ไม่ได้
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%~dp0.chrome-profile" --disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows https://www.69shuba.com
