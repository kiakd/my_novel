// autopilot-write.ts — WRITE stage: เขียน prose รายตอนจาก plan (outline+relationships+locations+threads)
// ใช้ rolling summary + spoiler-guard + relationship-stage register + location spec (กันมโน/กันบทพูดขัด)
const DS='https://api.deepseek.com/v1/chat/completions';
const DS_BETA='https://api.deepseek.com/beta/chat/completions';
const MODEL=process.env.DEEPSEEK_MODEL??'deepseek-chat';

const MODE_R18=`=== Mode: R18 explicit (สมัครใจทั้งคู่) ===
- คำอวัยวะ/การกระทำใช้คำไทยตรงๆ ตาม Vocabulary Palette ห้ามเลี่ยง (ห้าม "ปลายของเขา/ที่นั่น/น้ำรัก")
- ลงทุก beat ละเอียด สัมผัส→เสียง→จังหวะ→ปฏิกิริยากาย ห้าม fade to black ห้ามรีบจบ
- โทน/สรรพนาม/การครางเรียก "ตามไดนามิก R18 ของตัวละครคนนั้น" (ระบุด้านล่าง)`;
const MODE_NOVEL=`=== Mode: นิยายผจญภัย/ชีวิตประจำวัน ===
- บรรยายฉาก/ระบบพลัง/การต่อสู้/ดันเจี้ยนให้เห็นภาพ เร้าใจ สไตล์บำเพ็ญพลัง
- บทพูดมีชีวิตชีวาหลากหลายตามคาแร็คเตอร์ ไม่ห้วนแข็ง
- ให้ความรู้สึก progression (ฝึก/ไต่ขั้น/เก่งขึ้น)`;

const PREFILL_R18='(เขียนต่อทันทีแบบ explicit เต็มที่ ใช้คำอวัยวะไทยตรงๆ ตาม vocab ไม่เลี่ยง ไม่รีบจบ เล่าบุรุษที่ 3 คงสรรพนาม/โทนตามสเตจความสัมพันธ์และไดนามิก R18 ของตัวละคร)\n\n';

async function callProse(system:string,user:string,prefill:string|null,max_tokens=4096):Promise<{text:string,usage:any}>{
  for(let a=0;a<3;a++){try{
    const messages:any[]=[{role:'system',content:system},{role:'user',content:user}];
    let url=DS; if(prefill){url=DS_BETA;messages.push({role:'assistant',content:prefill,prefix:true});}
    const res=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${process.env.DEEPSEEK_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,temperature:prefill?0.95:0.9,max_tokens,messages})});
    const j:any=await res.json(); if(!res.ok) throw new Error(`${res.status}: ${JSON.stringify(j).slice(0,160)}`);
    return {text:(j.choices?.[0]?.message?.content??'').trim(), usage:j.usage};
  }catch(e){if(a===2)throw e; await new Promise(r=>setTimeout(r,5000));}}
  return {text:'',usage:null};
}

function activeStage(rel:any,ch:number){const st=(rel.stages||[]);return st.find((x:any)=>ch>=x.from&&ch<=x.to)||st[st.length-1];}

const FP=['ฉัน','ดิฉัน','ผม','กระผม','ข้า','หนู','เรา','กู','ชั้น','พี่','เค้า'];
function buildWriteSystem(s:any,o:any,ctx:any):string{
  const ap=s.autopilot; const isR18=!!o.r18;
  const focus:any[]=(o.focusChars||[]).map((n:string)=>s.characters.find((c:any)=>c.name===n)).filter(Boolean);
  const p:string[]=[
    'คุณคือนักเขียนนิยายแฟนตาซีบำเพ็ญพลังภาษาไทย เขียน "ตอนเต็ม" ตามโครงที่ให้ เล่าบุรุษที่ 3 ผ่านเคเลน',
    '','=== กฎเหล็ก ===','1. ภาษาไทย 100% ห้ามอังกฤษ/จีน/ญี่ปุ่น/เกาหลี (ยกเว้นชื่อเฉพาะ)','2. ห้าม disclaimer','3. เขียน prose วางในนิยายได้เลย ไม่มี markdown/หัวข้อ','4. ตอบเฉพาะเนื้อนิยาย',
    '', isR18?MODE_R18:MODE_NOVEL,
    '', '=== Style Guide ===', (s.styleGuide||'').slice(0,900),
  ];
  if(isR18) p.push('', '=== Vocabulary Palette (บังคับใช้คำตามนี้) ===', (s.vocabPalette||'').slice(0,800));
  p.push('','=== World Rules (ห้ามขัด) ===',(s.worldRules||'').slice(0,1200));
  p.push('',"=== Do/Don't ===",(s.dontList||'').slice(0,1000));

  // สถานที่ (กันมโน) — สำคัญทั้งหมด + ที่ชื่อโผล่ใน beat
  const locs=(s.locations||[]).filter((l:any)=>l.important||(o.beat||'').includes((l.name||'').split(' ')[0]));
  if(locs.length) p.push('','=== สถานที่ (บรรยายตามสเปกนี้ ห้ามสร้างใหม่/ขัด) ===',
    ...locs.map((l:any)=>`[${l.name}] ${l.type||''} | ชั้น:${l.floors||'-'} ขนาด:${l.size||'-'} | ห้อง:${l.rooms||'-'} | หน้าที่:${l.function||'-'}`));

  // ตัวละครในฉาก + keep + speech lock
  if(focus.length){
    p.push('','=== ตัวละครในฉาก (keep character เสมอ) ===');
    for(const c of focus){
      const L=[`[${c.name}${c.role?` — ${c.role}`:''}]`];
      if(c.appearance)L.push(`  ลักษณะกาย: ${c.appearance}`);
      if(c.skill)L.push(`  พลัง: ${c.skill.slice(0,200)}`);
      if(c.behavior)L.push(`  นิสัย: ${c.behavior}`);
      const sp=[c.pronounSelf&&`แทนตัว="${c.pronounSelf}"`,c.pronounOther&&`เรียกอีกฝ่าย="${c.pronounOther}"`,c.speechTone&&`โทน="${c.speechTone}"`].filter(Boolean).join(', ');
      if(sp)L.push(`  การพูดพื้นฐาน: ${sp}`);
      if(c.voiceExamples)L.push(`  ตัวอย่างบทพูด:\n${c.voiceExamples.split('\n').map((x:string)=>'    '+x.trim()).filter(Boolean).join('\n')}`);
      p.push(L.join('\n'));
    }
    const lock=focus.filter((c:any)=>c.pronounSelf).map((c:any)=>{const own=String(c.pronounSelf).split(/[\/\s,]+/).filter(Boolean);const f=FP.filter(x=>!own.includes(x)).slice(0,6);return `- ${c.name} แทนตัว="${c.pronounSelf}" → ห้ามใช้ ${f.join('/')}`;});
    if(lock.length)p.push('','⚠️ ล็อกสรรพนามพื้นฐาน:',...lock);
  }

  // ความสัมพันธ์ (สเตจ ณ ตอนนี้) — กันบทพูด/โทนขัด
  const relLines:string[]=[];
  for(const c of focus){
    if((c.role||'').includes('พระเอก'))continue;
    const rel=(ap.relationships||[]).find((r:any)=>r.char===c.name); if(!rel)continue;
    const st=activeStage(rel,o.ch); if(!st)continue;
    relLines.push(`- เคเลน↔${c.name} (ช่วงนี้: ${st.label}): เคเลนพูดกับเธอ → ${st.kaelenToHer} · เธอพูดกับเคเลน → ${st.herToKaelen}`);
    if(isR18 && o.r18partner===c.name && rel.r18?.dynamic) relLines.push(`  🔥 ไดนามิก R18 กับ${c.name}: ${rel.r18.dynamic}`);
  }
  if(relLines.length)p.push('','=== สถานะความสัมพันธ์ ณ ตอนนี้ (ใช้สรรพนาม/โทนตามนี้เป๊ะ ห้ามขัด) ===',...relLines);

  // เรื่องย่อจนถึงตอนนี้ (rolling)
  if(ctx.storySoFar)p.push('','=== เรื่องย่อจนถึงตอนก่อนหน้า (ความต่อเนื่อง) ===',ctx.storySoFar.slice(-3500));

  // ปม + spoiler guard
  const threads=ap.threads||[];
  const dT=(ids:string[])=>ids.map(id=>threads.find((t:any)=>t.id===id)).filter(Boolean);
  const lines:string[]=[];
  for(const t of dT(o.plant||[])) lines.push(t.seedOnly?`โปรย "${t.title}" ไว้เฉยๆ (${t.desc}) — ห้ามขยาย/ห้ามเข้าไปสำรวจ`:`ฝังเส้นเรื่อง "${t.title}" (${t.desc})`);
  for(const t of dT(o.hint||[])) lines.push(`ใบ้/ย้ำ "${t.title}"`);
  for(const t of dT(o.payoff||[])) lines.push(`คลี่คลาย "${t.title}" (${t.desc})`);
  // spoiler guard: ปมที่ยังไม่ถึง revealCh
  const notYet=threads.filter((t:any)=>!t.seedOnly && t.revealCh>o.ch && t.plantCh<=o.ch).map((t:any)=>t.title);
  if(lines.length)p.push('','=== เส้นเรื่องที่ต้องสอดในตอนนี้ ===',...lines.map(x=>'- '+x));
  if(notYet.length)p.push(`🚫 ห้ามเฉลย/ห้ามให้ตัวละครรู้คำตอบของ: ${notYet.join(', ')} (ยังไม่ถึงตอนเฉลย)`);

  // โครงตอนนี้
  p.push('','=== โครงตอนที่ต้องเขียน ===',`ตอน ${o.ch}: ${o.title}\n${o.beat}`);
  if(isR18) p.push('** ตอนนี้เป็น "ตอน R18" — ฉากเซ็กส์ explicit ต้องเป็น "แกนหลัก" ของตอน (กินเนื้อที่ ≥60% ของความยาว) ใช้คำตรงตาม Vocabulary Palette เต็มที่ ลงทุก beat ละเอียด / ส่วนพล็อต-ปม-คู่แข่งให้เป็นกรอบสั้นๆ ต้นหรือท้ายตอนเท่านั้น ห้ามให้ฉากพล็อตกินพื้นที่จนฉาก R18 บางลง **');
  if(o.r18pair==='start')p.push('** ตอนนี้เปิดฉาก R18 แล้ว "ปล่อยค้างไว้ช่วงกำลังเข้มข้น" ยังไม่จบ (ต่อตอนหน้า) **');
  if(o.r18pair==='cont')p.push('** ตอนนี้เขียนฉาก R18 "ต่อจากตอนก่อน (ฉากเดียวกัน)" ดำเนินจนถึงจุดจบ **');
  return p.join('\n');
}

// แปลงศัพท์ระบบอังกฤษ→ไทย + ตัดหัวข้อ markdown/title ต้นบท (กันหลุดภาษาไทย 100%)
const THAIIZE:[RegExp,string][]=[
  [/Body[\s-]*Reinforce(ment)?/gi,'เสริมกาย'],[/\bAugment(ation)?\b/gi,'เสริมกาย'],
  [/\bDormant\b/gi,'ขั้นหลับ'],[/\bAwakened\b/gi,'ขั้นตื่น'],[/\bAdept\b/gi,'ขั้นชำนาญ'],
  [/\bChanneler\b/gi,'ขั้นขับ'],[/\bArchon\b/gi,'ขั้นอัคระ'],[/\bSovereign\b/gi,'ขั้นอธิราช'],
  [/\bAscendant\b/gi,'ขั้นเสด็จฟ้า'],[/\bRift\b/gi,'รอยแยก'],[/\bAether\b/gi,'เอเธอร์'],
  [/\bPyre\b/gi,'เพลิง'],[/\bRadiant\b/gi,'แสงศักดิ์สิทธิ์'],[/\bUmbral\b/gi,'เงา'],[/\bDrakescale\b/gi,'เกล็ดมังกร'],[/\bMindscribe\b/gi,'จิตจารึก'],
];
export function cleanProse(t:string):string{
  let lines=t.split('\n');
  while(lines.length && (/^\s*$/.test(lines[0])||/^\s*#+\s/.test(lines[0])||/^\s*ตอน\s*\d+\s*[:：]/.test(lines[0])||/^\s*\*+\s*ตอน/.test(lines[0]))) lines.shift();
  let x=lines.join('\n');
  for(const [re,rep] of THAIIZE) x=x.replace(re,rep);
  return x.trim();
}

export async function writeChapter(s:any,o:any,ctx:any,logCall:(d:any)=>Promise<void>):Promise<string>{
  const TARGET=8500, MAXR=4;
  const system=buildWriteSystem(s,o,ctx);
  const isR18=!!o.r18;
  let plain=''; let round=0;
  while(plain.length<TARGET && round<MAXR){
    round++; const first=plain.length===0;
    const ctxTail=(plain?plain.slice(-2800):(ctx.prevTail||'')).trim();
    const instr=first
      ?`เขียน "ตอน ${o.ch}: ${o.title}" ตามโครงด้านบน ${ctx.prevTail?'ต่อเนื่องจากตอนก่อนอย่างลื่นไหล ':''}เริ่มได้เลย เขียนยาว ห้ามจบตอนในรอบเดียว`
      :`เขียนต่อจากที่ค้าง (ห้ามซ้ำ) ดำเนินตามโครงตอนนี้ต่อ ตอนนี้ ~${plain.length} ตัวอักษร ยังไม่ครบ ห้ามปิดตอน เขียนต่อ`;
    const user=[ctxTail?'=== ต่อจากนี้ (ห้ามซ้ำ) ===\n'+ctxTail+'\n':'','=== สิ่งที่ต้องเขียน ===',instr].filter(Boolean).join('\n');
    const t0=Date.now();
    const out=await callProse(system,user,isR18?PREFILL_R18:null,4096);
    await logCall({endpoint:'autopilot-write',system,user,response:out.text,usage:out.usage,ms:Date.now()-t0,
      meta:{ch:o.ch,round,sceneType:o.sceneType,r18:isR18,r18partner:o.r18partner||null,focusChars:o.focusChars,plant:o.plant,payoff:o.payoff}});
    if(!out.text)break;
    plain+=(plain?'\n\n':'')+out.text;
  }
  // การันตีฉาก explicit สำหรับตอน R18 (กันโมเดล slow-burn จนฉากเย็ดบางเกิน)
  if(isR18){
    const dc=(plain.match(/ควย|หี|เย็ด|กระแทก|สอดใส่|รูหี|น้ำเงี่ยน/g)||[]).length;
    if(dc<4 && o.r18pair!=='start'){
      const user='=== ต่อจากนี้ (ห้ามซ้ำ ต่อเนื่องเนียน) ===\n'+plain.slice(-2200)+'\n\n=== สิ่งที่ต้องเขียน ===\nดำเนินฉากต่อ "เข้าสู่การเย็ด/สอดใส่เต็มรูปแบบทันที" บรรยาย explicit ละเอียดทุก beat (สัมผัส/จังหวะ/เสียงคราง/ของเหลว) ใช้คำตรงตาม vocab (ควย/หี/เย็ด/กระแทก/สอดใส่/น้ำเงี่ยน/หัวนม) ดำเนินจนถึงจุดสุดยอด ห้ามเลี่ยงคำ ห้าม fade ห้ามจบแค่จูบ/ลูบ';
      const t0=Date.now();
      const out=await callProse(system,user,PREFILL_R18,4096);
      await logCall({endpoint:'autopilot-write',system,user,response:out.text,usage:out.usage,ms:Date.now()-t0,meta:{ch:o.ch,round:'r18-boost',sceneType:o.sceneType,r18:true,r18partner:o.r18partner||null}});
      if(out.text) plain+='\n\n'+out.text;
    }
  }
  return plain;
}

export async function summarizeChapter(o:any,plain:string):Promise<string>{
  const sys='สรุปตอนนิยายเป็นภาษาไทย 2-3 ประโยค เน้นเหตุการณ์สำคัญ พัฒนาการตัวละคร/ความสัมพันธ์ และปมที่คืบหน้า เพื่อใช้เป็นความจำต่อเนื่อง ตอบเฉพาะสรุป';
  const out=await callProse(sys,`ตอน ${o.ch}: ${o.title}\n\n${plain.slice(0,6000)}`,null,400);
  return `[ตอน ${o.ch}] ${out.text.replace(/\n+/g,' ').trim()}`;
}
