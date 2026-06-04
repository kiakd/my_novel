# Design source (staging) — วางไฟล์ดีไซน์ที่นี่

โฟลเดอร์นี้ใช้พักไฟล์ดีไซน์ดิบจาก Claude/v0 ก่อนแปลงเป็น Next.js
(ยังไม่ commit — เป็นแค่ source สำหรับ migrate)

## วางไฟล์ยังไง
วางตามหน้าให้ตรงกับ 9 แท็บ ถ้าตั้งชื่อได้ จะช่วยให้ผม map ถูก เช่น:

```
_design_src/
├─ shell.(html|jsx)          # header + sidebar + layout
├─ plot.(html|jsx)           # 📝 โครงเรื่อง
├─ characters.(html|jsx)     # 👤 ตัวละคร (+ character modal)
├─ locations.(html|jsx)      # 🗺️ สถานที่
├─ relations.(html|jsx)      # 🔗 ความสัมพันธ์
├─ chapters.(html|jsx)       # 📖 บทนิยาย (+ editor)
├─ timeline.(html|jsx)       # ⏱ ไทม์ไลน์
├─ images.(html|jsx)         # 🖼️ เจนรูป
├─ ai-logs.(html|jsx)        # 📋 AI Log
├─ settings.(html|jsx)       # ⚙️ ตั้งค่า
└─ (อะไรก็ได้ที่เหลือ วางมาเลย เดี๋ยวผมจัดให้)
```

ถ้าตั้งชื่อไม่ตรงไม่เป็นไร — วางมาทั้งหมด แล้วบอกผมว่า "ใส่ครบแล้ว"
ผมจะอ่านทุกไฟล์ แล้วบอกว่าไฟล์ไหนคือหน้าอะไร + ขาดหน้าไหนก่อนเริ่มแปลง
