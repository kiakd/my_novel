/**
 * manga-gen.ts — เจนภาพมังงะแบบคุมความนิ่ง (anchor + img2img-chain + inpaint + openpose)
 * อ้างอิงวิธีใช้: managestep.md
 *
 * รัน (ต้อง start ComfyUI ก่อน):
 *   bun manga-gen.ts txt2img  <out.png> <seed> "<scene prompt>"            [--pose poses/x.png] [--w 512 --h 768]
 *   bun manga-gen.ts img2img  <out.png> <seed> "<scene prompt>" <src.png>  [--denoise 0.5] [--pose ...] [--w --h]
 *   bun manga-gen.ts inpaint  <out.png> <seed> "<scene prompt>" <src.png> <mask.png> [--denoise 0.75] [--grow 8]
 *
 * - <src.png>/<mask.png>/pose = path บนดิสก์ (script จะ copy เข้า comfyui/input/ ให้เอง)
 * - mask: ขาว = บริเวณที่ให้เปลี่ยน, ดำ = คงเดิม
 * - checkpoint/negative/character base ต่อให้อัตโนมัติ — ใส่แค่ "scene prompt" เฉพาะเฟรม
 */
import { basename, join } from 'node:path'
import { copyFileSync } from 'node:fs'

const COMFY = process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188'
const COMFY_INPUT = process.env.COMFYUI_INPUT ?? '../comfyui/input'
const CKPT = 'meinahentai_v5Final.safetensors'
const CN_OPENPOSE = 'control_v11p_sd15_openpose_fp16.safetensors'
const OUT_DIR = 'uploads/manga' // ผลลัพธ์รวมไว้ที่นี่

// ---- ฐานตัวละครโฟล์เทียร์ (ตรงกับ prompt.md) ----
const CHAR_SOLO =
  'masterpiece, best quality, highly detailed, 1girl, solo, ' +
  'very long navy blue hair, high ponytail, hair between eyes, ' +
  'red eyes, pale skin, mature female, large breasts, thin waist, wide hips, ' +
  'beautiful detailed face, soft lighting'

const COUPLE_BASE =
  'masterpiece, best quality, highly detailed, hetero, 1boy, 1girl, couple, ' +
  'girl: very long navy blue hair, high ponytail, red eyes, pale skin, large breasts, mature female, ' +
  'boy: short black hair, undercut, dark eyes, tan skin, muscular, abs, tall male, detailed faces'

const NEG =
  'worst quality, low quality, lowres, bad anatomy, bad hands, extra digits, fewer digits, ' +
  'extra limbs, missing limbs, deformed, malformed, mutated, blurry, jpeg artifacts, watermark, ' +
  'signature, text, multiple views, child, loli, short, flat chest, ' +
  'extra arms, extra legs, fused bodies, conjoined, multiple girls, multiple boys, futanari, shota'

type Mode = 'txt2img' | 'img2img' | 'inpaint'

function parseFlags(argv: string[]) {
  const f: Record<string, string> = {}
  const pos: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) f[argv[i].slice(2)] = argv[++i]
    else pos.push(argv[i])
  }
  return { f, pos }
}

/** copy ภาพต้นทางเข้า comfyui/input/ แล้วคืนชื่อไฟล์ (LoadImage อ้างอิงจาก input/) */
function stageInput(path: string): string {
  const name = `_mg_${Date.now()}_${basename(path)}`
  copyFileSync(path, join(COMFY_INPUT, name))
  return name
}

function buildWorkflow(opts: {
  mode: Mode
  prompt: string
  seed: number
  width: number
  height: number
  denoise: number
  srcName?: string
  maskName?: string
  growMask: number
  poseName?: string
  poseStrength: number
  negExtra?: string
}) {
  const wf: Record<string, any> = {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CKPT } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: opts.prompt, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: opts.negExtra ? `${NEG}, ${opts.negExtra}` : NEG, clip: ['1', 1] } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: opts.seed, steps: 24, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras',
        denoise: opts.denoise, model: ['1', 0], positive: ['2', 0], negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'manga', images: ['6', 0] } },
  }

  // latent source ตาม mode
  if (opts.mode === 'txt2img') {
    wf['4'] = { class_type: 'EmptyLatentImage', inputs: { width: opts.width, height: opts.height, batch_size: 1 } }
  } else if (opts.mode === 'img2img') {
    wf['11'] = { class_type: 'LoadImage', inputs: { image: opts.srcName } }
    wf['4'] = { class_type: 'VAEEncode', inputs: { pixels: ['11', 0], vae: ['1', 2] } }
  } else {
    // inpaint
    wf['11'] = { class_type: 'LoadImage', inputs: { image: opts.srcName } }
    wf['12'] = { class_type: 'LoadImage', inputs: { image: opts.maskName } }
    wf['4'] = {
      class_type: 'VAEEncodeForInpaint',
      inputs: { pixels: ['11', 0], vae: ['1', 2], mask: ['12', 1], grow_mask_by: opts.growMask },
    }
  }

  // OpenPose ControlNet (optional)
  if (opts.poseName) {
    wf['8'] = { class_type: 'LoadImage', inputs: { image: opts.poseName } }
    wf['9'] = { class_type: 'ControlNetLoader', inputs: { control_net_name: CN_OPENPOSE } }
    wf['10'] = {
      class_type: 'ControlNetApply',
      inputs: { strength: opts.poseStrength, conditioning: ['2', 0], control_net: ['9', 0], image: ['8', 0] },
    }
    wf['5'].inputs.positive = ['10', 0]
  }
  return wf
}

async function run() {
  const [mode, out, seedStr, prompt, ...rest] = process.argv.slice(2) as [Mode, string, string, string, ...string[]]
  if (!mode || !out || !prompt) {
    console.error('usage: bun manga-gen.ts <txt2img|img2img|inpaint> <out.png> <seed> "<prompt>" [src] [mask] [flags]')
    process.exit(1)
  }
  const { f, pos } = parseFlags(rest)
  const seed = Number(seedStr)
  const width = Number(f.w ?? 512)
  const height = Number(f.h ?? 768)
  const poseStrength = Number(f.pose_strength ?? 1.0)

  // ต่อ base prompt: ถ้า scene พูดถึง boy/couple → ใช้ COUPLE_BASE, ไม่งั้น solo
  const wantsCouple = /\b(boy|couple|fellatio|blowjob|penis|penetrat|cum)\b/i.test(prompt)
  const fullPrompt = `${wantsCouple ? COUPLE_BASE : CHAR_SOLO}, ${prompt}`
  // ซีนคู่: ไล่ไม่ให้ออกมาเป็นรูปเดี่ยว (ปัญหา boy หายบน SD1.5)
  if (wantsCouple) f.neg = f.neg ? `solo, 1girl alone, ${f.neg}` : 'solo, 1girl alone'

  let srcName: string | undefined
  let maskName: string | undefined
  if (mode === 'img2img') srcName = stageInput(pos[0])
  if (mode === 'inpaint') { srcName = stageInput(pos[0]); maskName = stageInput(pos[1]) }
  const poseName = f.pose ? stageInput(f.pose) : undefined

  const denoise =
    f.denoise != null ? Number(f.denoise) : mode === 'txt2img' ? 1 : mode === 'inpaint' ? 0.75 : 0.5

  const wf = buildWorkflow({
    mode, prompt: fullPrompt, seed, width, height, denoise,
    srcName, maskName, growMask: Number(f.grow ?? 8), poseName, poseStrength,
    negExtra: f.neg,
  })

  const clientId = `manga_${Date.now()}`
  const submit = await fetch(`${COMFY}/prompt`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: wf, client_id: clientId }),
  })
  if (!submit.ok) throw new Error(`submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`)
  const { prompt_id } = (await submit.json()) as { prompt_id: string }
  console.log(`[${mode}] seed=${seed} denoise=${denoise} → ${out} (id ${prompt_id})`)

  let img: { filename: string; subfolder: string; type: string } | null = null
  for (let i = 0; i < 120; i++) {
    await Bun.sleep(5000)
    const hist = (await (await fetch(`${COMFY}/history/${prompt_id}`)).json()) as any
    const entry = hist[prompt_id]
    if (!entry) continue
    if (entry.status?.status_str === 'error') throw new Error(`comfy error: ${JSON.stringify(entry.status?.messages)}`)
    const node = entry.outputs && Object.values(entry.outputs as Record<string, any>).find((o: any) => o.images)
    if (node) { img = (node as any).images[0]; break }
    process.stdout.write('.')
  }
  if (!img) throw new Error('timeout 10min')

  const view = `${COMFY}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`
  const data = new Uint8Array(await (await fetch(view)).arrayBuffer())
  await Bun.write(join(OUT_DIR, out), data)
  console.log(`\n✅ saved ${join(OUT_DIR, out)}`)
}

run().catch((e) => { console.error('❌', e.message); process.exit(1) })
