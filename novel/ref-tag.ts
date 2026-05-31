// ref-tag.ts — Phase 1+2: รูป ref → booru tags (WD14 ผ่าน ComfyUI โลคัล ไม่เซ็นเซอร์) → แยกหมวด (ชุด/ท่า/การกระทำ/มุมกล้อง/...)
// ใช้ร่วม: server endpoint /api/ref/* และสคริปต์ทดสอบ

const COMFY = process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188';
const COMFY_INPUT = process.env.COMFYUI_INPUT_DIR ?? `${process.env.HOME}/dru/comfyui/input`;

export interface WD14Opts { model?: string; threshold?: number; excludeTags?: string }

/** รัน WD14 tagger บน ComfyUI → คืน array ของ booru tags */
export async function runWD14(imageBytes: Uint8Array, opts: WD14Opts = {}): Promise<string[]> {
  const name = `_wdref_${Date.now()}.png`;
  await Bun.write(`${COMFY_INPUT}/${name}`, imageBytes);

  const wf = {
    '1': { class_type: 'LoadImage', inputs: { image: name } },
    '2': {
      class_type: 'WD14Tagger|pysssss',
      inputs: {
        image: ['1', 0],
        model: opts.model ?? 'wd-v1-4-moat-tagger-v2',
        threshold: opts.threshold ?? 0.35,
        character_threshold: 0.85,
        replace_underscore: true,
        trailing_comma: false,
        exclude_tags: opts.excludeTags ?? '',
      },
    },
  };

  const sub = await fetch(`${COMFY}/prompt`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: wf, client_id: `wdref_${Date.now()}` }),
  });
  if (!sub.ok) throw new Error(`comfy submit ${sub.status}: ${(await sub.text()).slice(0, 200)}`);
  const { prompt_id } = (await sub.json()) as { prompt_id: string };

  for (let i = 0; i < 60; i++) {
    await Bun.sleep(2000);
    const e = ((await (await fetch(`${COMFY}/history/${prompt_id}`)).json()) as any)[prompt_id];
    if (!e) continue;
    if (e.status?.status_str === 'error') throw new Error(`comfy: ${JSON.stringify(e.status?.messages).slice(0, 300)}`);
    if (e.outputs) {
      const node = Object.values(e.outputs as Record<string, any>).find((o: any) => o.tags);
      const raw = node ? (node as any).tags[0] : '';
      return String(raw).split(',').map((t) => t.trim()).filter(Boolean);
    }
  }
  throw new Error('comfy WD14 timeout (120s)');
}

// ---- Phase 2: แยกหมวด tag (substring match, เช็คตามลำดับให้ tag เฉพาะชนะ tag กว้าง) ----
const BUCKETS: { key: string; kw: string[] }[] = [
  { key: 'action', kw: ['sex','vaginal','anal','fellatio','oral','cunnilingus','paizuri','handjob','footjob','masturbation','fingering','penetration','cum','ejaculation','cumshot','creampie','grinding','riding','thrusting','deepthroat','licking','sucking','kissing','groping','spanking','breast grab','clitoris','double penetration','gangbang','bukkake','facial','squirting','after sex','sex from behind','prone bone','imminent penetration','nipple tweak','breast sucking'] },
  { key: 'pose', kw: ['sitting','standing','lying','kneeling','squatting','bent over','on back','on stomach','all fours','spread legs','spread arms','arm support','leg up','legs up','crossed legs','knees up','arched back','leaning','reclining','m legs','spread pussy','presenting','doggystyle','cowgirl','missionary','straddling','top-down','on side','seiza','wariza','legs apart','raised leg','arms behind','hands on','bound','restrained','tiptoes','walking','running','jumping','crawling','bridal carry','carrying','pose'] },
  { key: 'outfit', kw: ['dress','skirt','shirt','blouse','sweater','uniform','bikini','swimsuit','lingerie','bra','panties','underwear','thighhighs','pantyhose','stockings','socks','gloves','heels','footwear','shoes','boots','jacket','coat','hoodie','kimono','china dress','cheongsam','leotard','apron','maid','nurse','jewelry','earrings','necklace','choker','glasses','hat','ribbon','bowtie','necktie','scarf','clothing cutout','cleavage cutout','garter','corset','crop top','shorts','jeans','bun cover','hair ornament','hairband','veil','collar','cape','robe','suit','bodysuit','sleeveless','off shoulder','bare shoulders','clothes','costume','see-through','wet clothes','lifted','undressing','clothes pull','strap','frills'] },
  { key: 'nude', kw: ['nude','naked','topless','bottomless','completely nude','no panties','no bra','exposed'] },
  { key: 'camera', kw: ['looking at viewer','from above','from below','from behind','from side','pov','close-up','dutch angle','wide shot','full body','upper body','lower body','cowboy shot','portrait','depth of field','simple background','white background','blurry background','indoors','outdoors','bedroom','on bed','bathroom','classroom','office','foreshortening','focus','backlighting'] },
  { key: 'expression', kw: ['blush','smile','open mouth','closed mouth','tongue out','ahegao','crying','tears','half-closed eyes','embarrassed','seductive','grin','frown','surprised','heavy breathing','drooling','aroused','trembling','clenched teeth','rolling eyes'] },
  { key: 'body', kw: ['breasts','thighs','legs','ass','navel','nipples','pussy','areola','collarbone','midriff','wide hips','thick thighs','muscular','abs','sideboob','underboob','cleavage','bare legs','feet','toes','armpit','stomach','back','butt'] },
  { key: 'appearance', kw: ['hair','eyes','bangs','ponytail','twintails','blonde','brunette','skin','tan','dark skin','freckles','mole','tattoo'] },
  { key: 'subject', kw: ['1girl','1boy','solo','2girls','2boys','multiple girls','multiple boys','couple','group',' male',' female','hetero'] },
];

export function categorizeTags(tags: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = { action: [], pose: [], outfit: [], nude: [], camera: [], expression: [], body: [], appearance: [], subject: [], other: [] };
  for (const tag of tags) {
    const t = tag.toLowerCase();
    const hit = BUCKETS.find((b) => b.kw.some((k) => t.includes(k)));
    out[hit ? hit.key : 'other'].push(tag);
  }
  return out;
}

// ---- Phase 3: บรีฟไทยจาก tag (system prompt; เรียก LLM ที่ฝั่ง server) ----
export const REF_SCENE_SYSTEM =
`คุณคือผู้ช่วยแปลง "แท็ก booru จากภาพอ้างอิง" เป็น "ฉากย่อภาษาไทย" สำหรับนักเขียนนิยายผู้ใหญ่เอาไปเขียนต่อ
- รับแท็กแยกเป็นหมวด (ชุด/ท่า/การกระทำ/มุมกล้อง/สีหน้า/ร่างกาย) เขียนเฉพาะหมวดที่ส่งมาเท่านั้น
- สรุปเป็นภาษาไทยกระชับ แยกหัวข้อด้วยอีโมจิ: 👗 ชุด | 🤸 ท่า/ตำแหน่ง | 💦 การกระทำ | 🎬 มุมมอง/ฉาก | 😳 สีหน้า/อารมณ์
- ใช้คำไทยตรงๆ แนวผู้ใหญ่ ไม่เลี่ยงคำ ไม่หลีกเลี่ยงเป็นดอกไม้/อาหาร — แต่ "ห้ามเขียน prose เต็ม" แค่บรีฟให้นักเขียนเห็นภาพ
- ห้ามแต่งตัวละคร/ชื่อ/สถานที่เพิ่มเอง ถ้ามีชื่อตัวละครส่งมาให้ใช้ชื่อนั้น ไม่มีก็ใช้ "ฝ่ายหญิง/ฝ่ายชาย"
- ภาษาไทย 100% (ยกเว้นชื่อเฉพาะ)
ตอบเป็นบรีฟไทยอย่างเดียว ไม่ต้องเกริ่น`;

/** สร้าง user message ให้ /api/ref/to-scene จาก buckets ที่ผู้ใช้เลือก */
export function buildRefSceneUser(
  buckets: Record<string, string[]>,
  use: { outfit?: boolean; pose?: boolean; action?: boolean; camera?: boolean; expression?: boolean } = { outfit: true, pose: true, action: true },
  opts: { characterNames?: string[]; extra?: string } = {},
): string {
  const sel: string[] = [];
  const add = (label: string, arr: string[]) => { if (arr.length) sel.push(`${label}: ${arr.join(', ')}`); };
  if (use.outfit) { add('ชุด/เครื่องแต่งกาย (outfit)', buckets.outfit); add('สภาพเปลือย (nude)', buckets.nude); }
  if (use.pose) add('ท่า/ตำแหน่ง (pose)', buckets.pose);
  if (use.action) add('การกระทำ (action)', buckets.action);
  if (use.camera) add('มุมกล้อง/ฉาก (camera)', buckets.camera);
  if (use.expression) add('สีหน้า/อารมณ์ (expression)', buckets.expression);
  // body แนบเป็น context เสมอเมื่อเลือก pose/action
  if ((use.pose || use.action) && buckets.body.length) add('ร่างกายที่เน้น (body)', buckets.body);

  return [
    opts.characterNames?.length ? `ตัวละครในฉาก: ${opts.characterNames.join(', ')}` : '',
    'แท็กที่เลือกจากภาพอ้างอิง:',
    sel.join('\n') || '(ไม่มีแท็กในหมวดที่เลือก)',
    opts.extra ? `\nทิศทางเพิ่มเติม: ${opts.extra}` : '',
  ].filter(Boolean).join('\n');
}
