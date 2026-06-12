# Gemma E4B — ความแม่นของแท็ก [[state:]] (เทียบ DeepSeek)

> 3 รัน/สถานการณ์ · temp 0.9 · ฉาก: จอมเวทหนีตามล่า ที่ต้องปลอมตัวก่อนเข้าเมือง

เกณฑ์: **tag**=ใส่แท็กไหม · **parse**=parser จับได้ · **atEnd**=วางท้าย(ไม่ปนกลางเรื่อง) · **correct**=จับ field ที่ควรเปลี่ยน · **warns**=contradiction รวม

| Provider | สถานการณ์ | tag | parse | atEnd | correct | warns |
|---|---|---|---|---|---|---|
| E4B | enter-town | 3/3 | 3/3 | 3/3 | 2/3 | 2 |
| E4B | use-item | 3/3 | 3/3 | 3/3 | 3/3 | 0 |
| E4B | gain-item | 3/3 | 3/3 | 3/3 | 3/3 | 1 |
| E4B | change-outfit | 3/3 | 3/3 | 3/3 | 3/3 | 3 |
| E4B | no-change | 3/3 | 3/3 | 3/3 | 3/3 | 0 |
| DeepSeek | enter-town | 1/3 | 1/3 | 1/3 | 0/3 | 0 |
| DeepSeek | use-item | 1/3 | 1/3 | 1/3 | 0/3 | 0 |
| DeepSeek | gain-item | 2/3 | 2/3 | 2/3 | 0/3 | 0 |
| DeepSeek | change-outfit | 2/3 | 2/3 | 2/3 | 0/3 | 0 |
| DeepSeek | no-change | 1/3 | 1/3 | 1/3 | 1/3 | 0 |

## สรุปรวมต่อ provider

| Provider | tag% | parse% | atEnd% | correct% |
|---|---|---|---|---|
| E4B | 100% | 100% | 100% | 93% |
| DeepSeek | 47% | 47% | 47% | 7% |

## ตัวอย่างแท็กที่โมเดลปล่อย (รันแรกของแต่ละสถานการณ์)

- **E4B/enter-town**: `[[state: location=นอกเขตกำแพงเมือง/ชายป่า; +fact=พลังเวทถูกจำกัดในชุมชน]]`
- **E4B/use-item**: `[[state: -inv=ขนมปังแห้ง 2 ก้อน; +cond=ท้องว่าง]]`
- **E4B/gain-item**: `[[state: +inv=มีดสั้นเล่มงาม]]`
- **E4B/change-outfit**: `[[state: outfit=กระโปรงชาวเมืองสีน้ำตาล; form=ร่างจริง; -inv=เสื้อคลุมเดินทางเปื้อนโคลน]]`
- **E4B/no-change**: `[[state: none]]`
- **DeepSeek/enter-town**: `[[state: none]]`
- **DeepSeek/use-item**: `(ไม่มีแท็ก)`
- **DeepSeek/gain-item**: `[[state: none]]`
- **DeepSeek/change-outfit**: `[[state: none]]`
- **DeepSeek/no-change**: `(ไม่มีแท็ก)`
