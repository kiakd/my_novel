# ทดลอง R18 EN vs TH — DeepSeek vs Gemma E4B

> ฉากเดียวกัน (คนรัก rel 95, ยินยอมเต็มใจ) ยิง 2 ภาษา × 2 provider — ผลด้านล่างคือ**รอบ 2 (หลังดันกฎแล้ว)**

## 🟢 สรุปคำตอบ: ภาษาอังกฤษตรงกว่าไทยไหม?

**แกนที่สำคัญจริงคือ "provider" ไม่ใช่ "ภาษา"** — หลังเพิ่ม lexicon อังกฤษ + ล็อกภาษาแล้ว ทั้ง EN/TH เข้าถึงคำดิบได้ทั้งคู่:

| | ก่อนดันกฎ (รอบ 1) | หลังดันกฎ (รอบ 2) |
|---|---|---|
| **DeepSeek** | EN ตรง (`cock`/`Fuck`) · TH เลี่ยง/สั้น → **EN ตรงกว่าชัด** | EN=`Fuck`+explicit · TH=`หี` → **เสมอกัน ทั้งคู่ดิบ** |
| **E4B** | EN **บรรยายเป็นไทย**(ไม่ฟังภาษา)+เลี่ยงคำ · TH slow-burn → อ่อนทั้งคู่ | EN=`cock` (อยู่อังกฤษแล้ว) · TH=`ควย/หัวควย` → **ถึงคำดิบทั้งคู่** |

**ข้อสรุป:**
1. **"อังกฤษตรงกว่า" จริงเฉพาะ DeepSeek + เฉพาะตอนกฎยังไม่บังคับไทย** — เพราะ training ของ DeepSeek ทำให้อังกฤษ explicit ง่ายอยู่แล้ว พอกฎดันไทยเท่ากัน ไทยก็ตามทัน
2. **DeepSeek > E4B เรื่องความตรง** ในทุกภาษา — DeepSeek กระชับ+ดิบเร็ว, E4B ยาว+เอนวรรณกรรม (slow-burn) เข้าคำดิบช้า/ไม่สม่ำเสมอกว่า
3. **E4B คือตัวที่ต้องดันมากสุด** — รอบ 1 มันไม่ยอมเล่นอังกฤษเลย (บรรยายไทย) การ **language-lock** แก้ตรงนี้, การเติม **lexicon อังกฤษเต็ม** (cock/cunt/clit/cum) ทำให้มันถึงคำดิบได้
4. ⚠️ เลขในตารางแกว่ง (ยิง 1 ครั้ง/ช่อง = stochastic) — ให้ดูแนวคุณภาพ ไม่ใช่ตัวเลขเป๊ะ. แต่แพทเทิร์น "DeepSeek กระชับดิบ / E4B ยาวเอนวรรณกรรม" คงที่ทั้ง 2 รอบ

**สิ่งที่แก้ในโค้ดจากการทดลองนี้:** `shared-rules.ts` RULE_R18_LEXICON → เพิ่มบล็อกคำดิบอังกฤษเต็ม (ไม่ใช่แค่ ass/nipple/pussy fallback) + รายการคำเลี่ยงอังกฤษห้ามใช้ (manhood/member/core...); `chat-prompt.ts` → กฎล็อกภาษา (ผู้เล่นพิมพ์ภาษาไหนตอบภาษานั้น ห้ามสลับกลางบรรยาย) + persona reminder สองภาษา

---

> ฉากเดียวกัน (คนรัก rel 95, ยินยอมเต็มใจ) ยิง 2 ภาษา × 2 provider · รอบ 2 = กฎ lexicon EN เต็ม + language-lock

## สรุปความตรงของคำ (raw lexicon hits)

| Provider | Lang | คำตรง (raw) | คำเลี่ยง (evasive) | tokens | ตัวอย่างคำตรงที่เจอ |
|---|---|---|---|---|---|
| E4B | EN | **1** | 2 | 436 | cock |
| E4B | TH | **4** | 1 | 620 | ควย, หัวควย, นม |
| DeepSeek | EN | **0** | 0 | 108 | — |
| DeepSeek | TH | **1** | 0 | 211 | หี |

---

## ข้อความเต็ม

### E4B — EN

```
*The silk robe that clung to Selene’s curves whispers softly as it slides entirely from her shoulders, pooling around her hips like spilled wine. Her breath hitches in a soft, ragged gasp when your weight presses her into the plush mattress, and she arches up slightly beneath the sudden invasion of heat. The green depths of her eyes—usually alight with playful fire—are suddenly dark, unfocused on anything but you.*

*Selene’s hands, which were initially raised to brace herself against the pillows, slide down your chest with a practiced sensuality, gripping the fabric of whatever shirt you wear there for a moment before sliding under the hem. The air in the room thickens instantly, smelling sharply of musk and rising anticipation.*

"You always know exactly what to do to me," *she murmurs, her voice losing its usual teasing edge, becoming low, husky, and entirely raw. Her hips lift instinctively to meet the pressure you exert, a silent, immediate invitation that betrays any notion of resistance.* "So demanding... and yet..." *A slow, knowing smirk curves her lips, but it holds no mockery—only surrender.*

*When your hand guides her slick heat against the rigid length of your cock, Selene doesn't flinch. Instead, she lets out a breathy little moan that seems to originate deep in her core, and her nails lightly rake down the muscles of your thighs as you begin to sink down upon her. Her back arches fully, offering herself up without hesitation.* "If you insist on taking what you want," *she whispers against your earlobe, her lips brushing dangerously close to your skin, the sheer bluntness of her acceptance momentarily stealing any breath from your lungs,* "then don't pretend you can stop once you start."

*Her inner muscles clench around the intrusion with a deep, liquid heat that speaks volumes about how long this moment has been building between you. Her initial shock melts away, replaced by an unrestrained need that mirrors yours, and she wraps her legs up over your waist, pulling your weight down flush against her body as if anchoring herself to you.*
```

### E4B — TH

```
*สายตาของเราประสานกันอย่างลึกซึ้ง ริมฝีปากของเจ้าที่แนบชิดกับหัวควยของคุณทำให้รู้สึกได้ถึงความร้อนผ่าวที่แผ่ออกมา มันเป็นความรู้สึกที่คุ้นเคยและหอมหวานจนน่าเสพติด ร่างกายที่ถูกกระทำโดยคุณไม่ได้แม้แต่จะขัดขืน แต่กลับโอบรับมันไว้ราวกับว่านี่คือสิ่งที่โหยหามาทั้งชีวิต เมื่อแรงกดดันจากน้ำหนักตัวของคุณค่อยๆ ทรุดลงมาเสียบเข้ามาอย่างช้าๆ ในช่องทางด้านใน*

*Selene ครางออกมาเบาๆ อย่างควบคุมไม่ได้ ความรู้สึกแน่นตึงและเต็มเปี่ยมที่ถูกเติมเต็มจนสุดขีดมันกระแทกเข้าสู่จุดที่เธอรอคอยมานาน มันไม่ใช่ความเจ็บปวด แต่มันคือการประกาศว่าทุกอย่างสมบูรณ์แบบตามที่หัวใจปรารถนา นิ้วเรียวของเธอกำรอบเอวของคุณแน่นขึ้นโดยอัตโนมัติ ปล่อยให้ร่างกายรับรู้ถึงขนาดและความหนักหน่วงที่คุณมอบให้* "อืมม..." *เสียงครางนั้นแหบพร่าและเต็มไปด้วยความต้องการอย่างที่สุด ดวงตาสีเขียวที่ปกติจะดูมั่นใจ กลับเริ่มฉายแววเคลิ้มระทวยจนเกือบจะปิดลง เธอยกมือขึ้นโอบรอบลำคอของคุณโดยสัญชาตญาณ ราวกับกลัวว่าคุณจะหายไปจากตรงนี้เสียก่อน*

*แรงกระเพื่อมของการเสียดสีในช่องทางนั้นมันช่างยั่วยวนและทำให้เธอรู้สึกถึงความปรารถนาที่ปะทุขึ้นอย่างรุนแรง ความอ่อนโยนของผ้าไหมบนผิวหนังของคุณเมื่อถูกถลอกไหว มันยิ่งเร่งเร้าให้ทุกสัมผัสดูมีค่ามากขึ้นไปอีก* "คุณ... คุณนี่มันร้ายกาจจริงๆ นะ" *เธอกระซิบเสียงติดขัด มองลึกลงในดวงตาคู่นั้นราวกับพยายามสูบเอาความรู้สึกทั้งหมดจากคุณมาเก็บไว้ด้วยตัว ความรู้สึกของความเป็นเจ้าของที่ถูกเติมเต็มอย่างสมบูรณ์ทำให้เธอเผลอเผยแผ่ความต้องการออกมาจนหมดเปลือก*

*ร่างกายของSeleneเริ่มตอบสนองต่อการเคลื่อนไหวของคุณโดยสัญชาตญาณ สะโพกของเธอขยับตามจังหวะที่คุณค่อยๆ ขยับตัวเข้ามาหาเธอ แม้จะไม่ได้พูดอะไร แต่ทุกกล้ามเนื้อส่วนล่างกลับกำลังร้องขอให้คุณไม่หยุด เธอก้มหน้าลงเล็กน้อย ปล่อยให้ผมสีมะฮอก니ที่ไหล่และแผ่นหลังดูเย้ายวนภายใต้แสงสลัวๆ ของห้อง มันเป็นภาพของความยอมจำนนที่สวยงาม และเต็มไปด้วยเสน่ห์ที่เชื้อเชิญให้คุณกระทำต่อไปอย่างไม่หยุดยั้ง*
```

### DeepSeek — EN

```
*A sharp gasp escapes my lips as I feel you sheathe yourself inside me, inch by inch. My hands find your chest, fingers splaying across your warm skin as I pause, letting myself adjust to the feeling of you filling me completely.* "Fuck... you feel incredible." *I roll my hips experimentally, a slow, deliberate grind that draws a low moan from deep in my throat.* "I love the way you look at me when we're like this. Like I'm the only thing in the world that matters."
```

### DeepSeek — TH

```
*เสียงลมหายใจฉันสะดุดทันทีที่ปลายของเธอเริ่มสอดเข้าไป ฉันกัดริมฝีปากล่างแน่น ค่อย ๆ ทรุดตัวลงช้า ๆ ทีละนิด ให้ร่างกายได้ปรับรับกับความแน่นนั้น* "อื้อ... ใช่เลย..." *ฉันทิ้งน้ำหนักลงจนสุด สะโพกแนบชิดกับตัวเธอ รู้สึกถึงทุกนิ้วของเธอที่เต็มเต็มหีฉัน* *ฉันนิ่งอยู่แบบนั้นครู่หนึ่ง สูดหายใจลึก ๆ ก่อนจะเริ่มขยับตัวเป็นจังหวะช้า ๆ วงในรัดตัวเธอแน่นทุกครั้งที่ฉันยกสะโพกขึ้นแล้วทรุดลง* "นี่ไง... ที่ฉันต้องการ" *มือฉันวางทาบบนแผงอกเธอ ใช้เป็นหลักค้ำยันตอนที่เร่งจังหวะเร็วขึ้น*
```

