# Models — โหลดจาก Civitai

โหลดด้วย (ใส่ CIVITAI_API_KEY ของตัวเอง):
```
curl -L -H "Authorization: Bearer $CIVITAI_API_KEY" \
  "https://civitai.com/api/download/models/<verId>" -o <ชื่อไฟล์>.safetensors
```

## Checkpoint หลัก (SD1.5 — รันได้ทุกเครื่อง)
| โมเดล | verId | ขนาด | หมายเหตุ |
|---|---|---|---|
| meinahentai v5Final | (ของเดิมในเครื่อง Mac) | ~2GB | อนิเมะ NSFW ตัวหลักที่ใช้อยู่ |
| GuoFeng3 v3.4 (กั๋วเฟิง 2.5D) | 106289 | 2.2GB | จีน 2.5D |
| Dark Sushi Mix 2.5D | 93208 | 2.0GB | คุม danbooru tag เก่ง |
| majicMIX realistic v7 | 176425 | 2.0GB | สาวจีนสมจริง |
| ChilloutMix | 11732 | 2.0GB | สมจริง NSFW |

## สาย Illustrious/SDXL (ต้อง GPU VRAM >=8GB — Mac 8GB ไม่ไหว)
| โมเดล | verId | ขนาด | base |
|---|---|---|---|
| WAI-illustrious-SDXL v17 (checkpoint) | 2883731 | 6.6GB | Illustrious |
| reiQ Style (LoRA, ลายเส้น Reinaldo Quintero) | 2956448 | 272MB | Illustrious — trigger: `reill` |

> LoRA ต้อง base ตรงกับ checkpoint: LoRA สาย Illustrious ใช้กับ WAI ได้ แต่ใช้กับ SD1.5 (meinahentai) ไม่ได้
