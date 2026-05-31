// _write.ts — รัน WRITE ช่วงตอน [from..to] : bun _write.ts <from> <to>
// log ทุก call ลง ai_logs · rolling summary · เซฟ DB ทุกตอน (patchStory, bump rev) · resume ได้
import { getDb } from './db';
import { patchStory, readStory } from './state-store';
import { writeChapter, summarizeChapter, cleanProse } from './autopilot-write';

const SID='story_aetherion';
const FROM=Number(process.argv[2]||1), TO=Number(process.argv[3]||3);
const LOG=`/tmp/aeth_write.log`;
const log=async(m:string)=>{console.log(m);try{await Bun.write(LOG,(await Bun.file(LOG).text().catch(()=>''))+m+'\n');}catch{}};

const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const toHtml=(p:string)=>p.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean).map(x=>'<p>'+esc(x).replace(/\n/g,'<br>')+'</p>').join('');
const plainOf=(h:string)=>(h||'').replace(/<[^>]+>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');

const db=await getDb();
const aiLogs=db.collection('ai_logs');
async function logCall(d:any){
  const resp=d.response||'';
  const eng=(resp.match(/[A-Za-z]{2,}/g)||[]).filter((w:string)=>!['HUD','LED','VIP'].includes(w));
  await aiLogs.insertOne({ _id:(`log_aeth_${Date.now()}_${Math.random().toString(36).slice(2,6)}`) as any, ts:new Date(),
    endpoint:d.endpoint, provider:'deepseek', model:process.env.DEEPSEEK_MODEL??'deepseek-chat',
    system:d.system, user:d.user, response:resp, usage:d.usage, ms:d.ms, ok:!!resp,
    meta:{ ...d.meta, respChars:resp.length, engHits:[...new Set(eng)].slice(0,15), engCount:eng.length } });
}

const s=await readStory(db,SID);
const ap=s.autopilot;
const byCh:Record<number,any>={}; for(const o of ap.outline) byCh[o.ch]=o;
ap.summaries=ap.summaries||{};

// rolling summary จากตอนก่อน FROM
let storySoFar=''; for(let c=1;c<FROM;c++) if(ap.summaries[c]) storySoFar+=ap.summaries[c]+'\n';
// prevTail จากตอน FROM-1
let prevTail=''; const prevCh=s.chapters.find((c:any)=>c.order===FROM-1); if(prevCh) prevTail=plainOf(prevCh.content).slice(-1500);

await log(`▶ WRITE ตอน ${FROM}-${TO} (story ${SID})`);
for(let ch=FROM; ch<=TO; ch++){
  const o=byCh[ch]; if(!o){await log(`  ✗ ไม่มี outline ตอน ${ch}`);continue;}
  // resume: ถ้ามีเนื้อยาวพอแล้วข้าม
  const existing=s.chapters.find((c:any)=>c.order===ch);
  if(existing && plainOf(existing.content).length>=9000){ await log(`  • ตอน ${ch} มีแล้ว ข้าม`); if(ap.summaries[ch])storySoFar+=ap.summaries[ch]+'\n'; prevTail=plainOf(existing.content).slice(-1500); continue; }
  const t0=Date.now();
  let plain=await writeChapter(s,o,{storySoFar,prevTail},logCall);
  if(!plain){await log(`  ✗ ตอน ${ch} เขียนไม่ได้`);break;}
  plain=cleanProse(plain);
  // เซฟ chapter
  const id=`aeth_ch${ch}`;
  const html=toHtml(plain);
  const idx=s.chapters.findIndex((c:any)=>c.order===ch || c.id===id);
  const summary=await summarizeChapter(o,plain);
  if(idx>=0){ s.chapters[idx].content=html; s.chapters[idx].title=o.title; s.chapters[idx].summary=summary; }
  else s.chapters.push({id,title:o.title,order:ch,content:html,summary});
  ap.summaries[ch]=summary;
  await patchStory(db,SID,{chapters:s.chapters, autopilot:ap});
  storySoFar+=summary+'\n'; prevTail=plain.slice(-1500);
  await log(`  ✓ ตอน ${ch} [${o.sceneType}${o.r18?` R18:${(o.r18partner||'').split(' ')[0]}`:''}] ${plain.length} ตัวอักษร · ${((Date.now()-t0)/1000).toFixed(0)}s`);
}
await log(`■ เสร็จช่วง ${FROM}-${TO}`);
process.exit(0);
