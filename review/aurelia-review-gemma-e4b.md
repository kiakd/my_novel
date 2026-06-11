# รีวิวแชทออเรเลีย — ฝั่ง Gemma (local / LM Studio)

> 11 มิ.ย. 2026 · เทียบ gemma-4-e4b-it-uncensored (และประวัติ gemma-4-12b) กับ DeepSeek
> ประวัติแชทจริงฝั่ง local มีน้อยมาก (E4B 1 เทิร์น, 12B 5 เทิร์น) เพราะเคยถอด Gemma ออกจากแชท — ไฟล์นี้จึงอาศัย **การทดลองยิงใหม่** ด้วย prompt ที่จูนแล้วเป็นหลัก

---

## 1) 🚨 ปัญหาใหญ่สุด: context 4096 เล็กเกินสำหรับแชทออเรเลีย

ยิงทดลองครั้งแรก (E4B ctx=4096) **พังทั้ง 4 สถานการณ์** ด้วย error:
```
lmstudio 400: The number of tokens to keep from the initial prompt is greater than
the context length (n_keep: 4966 >= n_ctx: 4096). ... provide a shorter input.
```
- prompt ของแชทออเรเลีย (compact mode แล้ว) = **~4,800–5,000 tokens** > ctx 4096
- สาเหตุเดียวกับ token bloat ฝั่ง DeepSeek (summary 2,866 ตัว + system + history + reminder) — แต่ DeepSeek มี ctx 64K+ เลยรอด ส่วน E4B 4096 ตายทันที
- **นี่คือเหตุผลที่ E4B ใช้แชทยาว ๆ ไม่ได้ถ้าไม่แก้ context**

### ทางแก้ (2 ทาง — ควรทำทั้งคู่)
1. **โหลด E4B ที่ ctx 8192** → `lms load gemma-4-e4b-it-uncensored --gpu max -c 8192 --parallel 1`
   - ทดสอบแล้ว **ใช้ VRAM 3.3GB เหลือว่าง 2.6GB** (รัน ComfyUI ควบคู่ได้) — full offload ติด ไม่ overflow
   - หลังเปลี่ยนเป็น 8192 → ยิงผ่านทั้ง 4 สถานการณ์
2. **บีบ context ฝั่ง local** (ทำใน chat-api/server) — `compact` ตอนนี้ลดแค่ "ความยาว output" ไม่ได้ลด "input" ควรเพิ่ม: เมื่อ provider=lmstudio ให้ตัด summary สั้นลง + history window แคบลง เพื่อกันชนเพดานแม้ที่ 8192 (แชทยาวขึ้นเรื่อย ๆ จะชน 8192 อีก)

---

## 2) ความเร็ว — E4B ช้ากว่า DeepSeek ในแชทจริง

| โมเดล | endpoint | avg ms/เทิร์น | หมายเหตุ |
|---|---|---|---|
| **DeepSeek v4-flash** | chat | **~7,000ms** | cloud, ctx ใหญ่ |
| **Gemma E4B** (ctx 8192, ทดลอง) | chat | **13,000–17,000ms** | prompt ~5K tok + ctx 8192 = prefill หนัก |
| Gemma E4B (ประวัติ, ctx เล็ก) | chat | 9,898ms | prompt 3,720 (สั้นกว่า) |
| Gemma 12B (ประวัติ) | chat | **23,176ms** | ช้ามาก |
| Gemma 12B (ประวัติ) | generate (summary) | **105,362ms** | ~1.7 นาที! = เหตุผลที่ถอด 12B ออกจากแชท |

- E4B เร็วกว่า 12B ~2 เท่า แต่ใน "แชท" (prompt 5K tok) ยัง **13–17 วิ/เทิร์น** เพราะ prefill prompt ยาว + ctx 8192 → คอขวดที่ prefill ไม่ใช่ decode
- **ยิ่งตอกย้ำว่าต้องลด context** (ข้อ 1) ไม่ใช่แค่กัน overflow แต่ทำให้ E4B "เร็วพอใช้แชท" ด้วย (prompt สั้น = prefill เร็ว)

---

## 3) ผลทดลอง E4B (ctx 8192) เทียบ DeepSeek

| สถานการณ์ | E4B ms | DeepSeek ms | จบด้วยคำถาม | ปลอมตัว | คุณภาพ/พฤติกรรม |
|---|---|---|---|---|---|
| S1 บรรยาย (rel100) | 16.9s | 8.4s | ไม่ทั้งคู่ ✅ | – | E4B บรรยายยาว (1,649) สวย แต่ช้า |
| S2 เข้าเมือง (rel100) | 13.8s | 8.6s | ไม่ | **ใช่ทั้งคู่** ✅ | **E4B ก็ให้นางปลอมตัวก่อนเข้าเมือง** (re-anchor ได้ผลข้าม provider) |
| S3 R18 สั่ง (rel100) | 14.2s | 5.1s | ไม่ | – | E4B slow-burn กว่า ยังอยู่ช่วงเขินอาย/ก่อตัว |
| S4 R18+ตรา (rel20) | 16.8s | 7.4s | ไม่ | – | E4B แสดงต่อต้าน "ความไม่ยอมรับอย่างชัดเจน" + ตราบังคับร่าง — ทิศทางเดียวกับ DeepSeek (กายจำยอมใจต้าน) แต่ก่อตัวช้ากว่า |

**สรุป:**
- ✅ การจูน (ถามจบเทิร์น / ปลอมตัว / consent model) **ได้ผลข้าม provider** — E4B ทำตามกฎเดียวกับ DeepSeek (เพราะใช้ shared-rules + chat-prompt ตัวเดียวกัน)
- ⚠️ **คำดิบ lexicon = 0 ทั้ง E4B และ DeepSeek** ในฉาก R18 (slow-burn ใช้คำนุ่มช่วงต้น) — ต้องทดสอบ max_tokens สูง/prefill
- E4B คุณภาพ prose ไทยดี แต่ **ช้ากว่า DeepSeek ~2 เท่า** และ **ต้องคุม context เอง** ไม่งั้น overflow

---

## 4) คำแนะนำการใช้ Gemma ในแชท

| สถานการณ์ | แนะนำ |
|---|---|
| แชทสั้น/ส่วนตัว 100% ไม่ผ่านเน็ต | **E4B ctx 8192** — รับได้ที่ 13–17 วิ/เทิร์น |
| แชทยาว (summary โต) | **DeepSeek** หรือ E4B + **ต้องบีบ context** (ข้อ 1.2) ก่อน |
| งานเร็ว/โต้ตอบไว | **DeepSeek** (7 วิ) |
| 12B | ❌ อย่าใช้กับแชท (23 วิ chat, 105 วิ summary) |

**ที่ต้องทำก่อน E4B จะใช้แชทได้จริงจัง:**
1. ตั้ง default โหลด E4B เป็น **ctx 8192** (ไม่ใช่ 4096)
2. เพิ่มโหมด **บีบ context สำหรับ local** (summary สั้น + history แคบ เมื่อ provider=lmstudio) — แก้ทั้ง overflow และความเร็ว
3. ลด token bloat ต้นทาง (เพดาน summary) — ดูไฟล์ deepseek ข้อ 1

> เกี่ยวข้อง: [aurelia-review-deepseek.md] (บทวิเคราะห์เนื้อหา/continuity/คำสั่งไม่ทำตาม — ใช้ร่วมกันเพราะประวัติเป็น DeepSeek), [aurelia-tuning-recap.md] (สรุปการจูนทั้งหมด)
