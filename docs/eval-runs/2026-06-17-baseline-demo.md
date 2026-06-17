# Eval run — baseline (demo needle set)

> วันที่: 2026-06-17 · commit: feat/mem-eval-telemetry · ชุด: `novel/eval/needles-demo.json` (**synthetic** 20 turns / 8 needles, k=4)
> รัน: `bun run eval/recall-eval.ts`

## ผล

| สูตร | hit@4 (FTS-only) | hit@4 (Hybrid) | MRR (Hybrid) | typo-hit@4 (Hybrid) |
|---|---|---|---|---|
| weighted | 0% | 25% | 0.073 | 100% |
| weighted + importance | 0% | **75%** | **0.438** | 50% |
| rrf | 0% | 13% | 0.125 | 50% |
| rrf + importance | 0% | 63% | 0.302 | 100% |

## สิ่งที่อ่านได้ (และข้อควรระวัง)

1. **importance boost (Part B) ช่วยจริงในชุดนี้** — weighted hit@4 25%→75%, MRR 0.073→0.438
   - ⚠️ **ข้อควรระวัง:** ชุด demo เป็น synthetic และเข็มถูกออกแบบให้ชี้ไป turn ที่ตั้ง importance สูง → ส่วนหนึ่งเป็น "by construction" ต้องยืนยันด้วยแชทจริงก่อนเชื่อตัวเลขนี้เต็มร้อย
2. **FTS-only = 0% ทุกสูตร** — ไม่ใช่บั๊ก แต่เป็นข้อจำกัดจริงของภาษาไทย:
   - ไทยไม่มีช่องว่างระหว่างคำ → `toFtsMatch` แปลง query ทั้งประโยคเป็น "วลี trigram ก้อนเดียว" → ต้องเจอ substring ตรงเป๊ะถึงจะ match → แทบไม่เคยเจอ
   - **นัยสำคัญ:** path graceful-degradation "FTS-only เมื่อ embedding ล่ม" **ใช้แทบไม่ได้กับไทย** — recall ระยะยาวพึ่ง embedding เป็นหลัก
   - 👉 ควรตั้ง `EMBED_*` บน prod เสมอ (ตอนนี้ตั้งแล้ว) · ถ้าจะให้ FTS-only ใช้ได้จริงต้องเพิ่ม Thai word segmentation (งานแยก มี regression risk — ยังไม่ทำ)
3. **weighted ดูดีกว่า rrf ในชุดนี้** (hit@4 75% vs 63%) — แต่ n=8 เล็กเกินสรุป default · `MEM_FUSION` คง `weighted` ไว้ก่อน

## ทำซ้ำ/ขยาย

- คัดลอก `needles-demo.json` → `needles-<เรื่องจริง>.json` ใส่แชทจริง ~15-20 เข็ม แล้ว `bun run eval/recall-eval.ts eval/needles-<เรื่องจริง>.json`
- A/B fusion: harness รันทั้ง weighted/rrf ในรอบเดียวอยู่แล้ว — ดูคอลัมน์เทียบได้เลย
