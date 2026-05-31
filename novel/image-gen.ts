import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { unzipSync } from 'fflate'

export type ImageProvider = 'novelai' | 'tensorart' | 'civitai' | 'comfyui'

export interface ImageGenParams {
  prompt: string
  negative_prompt?: string
  book: string
  ch: string
  width?: number
  height?: number
  steps?: number
  cfg_scale?: number
  model?: string
  seed?: number
  // ControlNet (ComfyUI only) — path relative to ComfyUI's input/ dir, e.g. "poses/m-legs-spread.png"
  pose_image?: string
  pose_strength?: number
  controlnet_model?: string
}

export interface ImageGenResult {
  ok: true
  provider: ImageProvider
  path: string
  url: string
  filename: string
}

function sanitize(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
}

async function saveImage(
  book: string,
  ch: string,
  provider: string,
  data: Uint8Array,
): Promise<{ path: string; url: string; filename: string }> {
  const bookSafe = sanitize(book)
  const chSafe = sanitize(ch)
  const dir = join('./uploads', bookSafe, chSafe)
  await mkdir(dir, { recursive: true })
  const filename = `${Date.now()}_${provider}.png`
  const filePath = join(dir, filename)
  await Bun.write(filePath, data)
  return { path: filePath, url: `/uploads/${bookSafe}/${chSafe}/${filename}`, filename }
}

/* ============================================================
   NovelAI — returns a zip containing image_0.png
   Model options: nai-diffusion-3 | nai-diffusion-xl-4-5
   ============================================================ */
export async function generateNovelAI(params: ImageGenParams): Promise<ImageGenResult> {
  const apiKey = process.env.NOVELAI_API_KEY
  if (!apiKey) throw new Error('NOVELAI_API_KEY not set')

  const res = await fetch('https://image.novelai.net/ai/generate-image', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: params.prompt,
      model: params.model ?? 'nai-diffusion-3',
      action: 'generate',
      parameters: {
        negative_prompt:
          params.negative_prompt ?? 'lowres, bad anatomy, bad hands, text, watermark',
        width: params.width ?? 832,
        height: params.height ?? 1216,
        steps: params.steps ?? 28,
        scale: params.cfg_scale ?? 7,
        sampler: 'k_euler_ancestral',
        seed: Math.floor(Math.random() * 9_999_999_999),
        n_samples: 1,
        ucPreset: 0,
        qualityToggle: true,
      },
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`NovelAI ${res.status}: ${txt.slice(0, 300)}`)
  }

  const zipBuffer = new Uint8Array(await res.arrayBuffer())
  const files = unzipSync(zipBuffer)
  const pngEntry = Object.entries(files).find(([name]) => name.endsWith('.png'))
  if (!pngEntry) throw new Error('NovelAI: no PNG found in zip response')

  const saved = await saveImage(params.book, params.ch, 'novelai', pngEntry[1])
  return { ok: true, provider: 'novelai', ...saved }
}

/* ============================================================
   Tensor.art — async job, poll until SUCCESS
   หา sdModel ID ได้จาก URL ของ model บน tensor.art
   ============================================================ */
export async function generateTensorArt(params: ImageGenParams): Promise<ImageGenResult> {
  const apiKey = process.env.TENSORART_API_KEY
  if (!apiKey) throw new Error('TENSORART_API_KEY not set')

  const submitRes = await fetch('https://ap-east-1.tensorart.cloud/v1/jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request_id: `novel_${Date.now()}`,
      stages: [
        { type: 'INPUT_INITIALIZE', inputInitialize: { count: 1, seed: -1 } },
        {
          type: 'DIFFUSION',
          diffusion: {
            width: params.width ?? 512,
            height: params.height ?? 768,
            prompts: [{ text: params.prompt }],
            negativePrompts: [{ text: params.negative_prompt ?? 'lowres, bad anatomy, bad hands' }],
            steps: params.steps ?? 30,
            cfgScale: params.cfg_scale ?? 7,
            sampler: 'Euler a',
            sdModel: params.model ?? '757279507095956705', // Realistic Vision
            sdVae: 'Automatic',
          },
        },
      ],
    }),
  })

  if (!submitRes.ok) {
    const txt = await submitRes.text()
    throw new Error(`TensorArt submit ${submitRes.status}: ${txt.slice(0, 300)}`)
  }

  const submitJson = (await submitRes.json()) as any
  const jobId = submitJson.job?.id
  if (!jobId) throw new Error(`TensorArt: no job ID — ${JSON.stringify(submitJson).slice(0, 200)}`)

  let imageUrl: string | null = null
  for (let i = 0; i < 60; i++) {
    await Bun.sleep(2000)
    const pollRes = await fetch(`https://ap-east-1.tensorart.cloud/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const poll = (await pollRes.json()) as any
    const status = poll.job?.status

    if (status === 'SUCCESS') {
      imageUrl = poll.job?.successInfo?.images?.[0]?.url ?? null
      break
    }
    if (status === 'FAILED') {
      throw new Error(`TensorArt job failed: ${JSON.stringify(poll.job?.failedInfo)}`)
    }
  }

  if (!imageUrl) throw new Error('TensorArt: timeout after 120s')

  const imgRes = await fetch(imageUrl)
  const imgData = new Uint8Array(await imgRes.arrayBuffer())
  const saved = await saveImage(params.book, params.ch, 'tensorart', imgData)
  return { ok: true, provider: 'tensorart', ...saved }
}

/* ============================================================
   Civitai — async job ผ่าน orchestration API, ใช้ Buzz เป็น credit
   หา model URN ได้จาก civitai.com/models/{id} > Air URN
   ============================================================ */
export async function generateCivitai(params: ImageGenParams): Promise<ImageGenResult> {
  const apiKey = process.env.CIVITAI_API_KEY
  if (!apiKey) throw new Error('CIVITAI_API_KEY not set')

  const submitRes = await fetch('https://orchestration.civitai.com/v1/consumer/jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      $type: 'textToImage',
      model: params.model ?? 'urn:air:sd1:checkpoint:civitai:4201@130072', // Realistic Vision V5.1
      params: {
        prompt: params.prompt,
        negativePrompt:
          params.negative_prompt ??
          '(worst quality:1.4), (low quality:1.4), lowres, bad anatomy, bad hands, text, watermark',
        width: params.width ?? 512,
        height: params.height ?? 768,
        steps: params.steps ?? 30,
        cfgScale: params.cfg_scale ?? 7,
        clipSkip: 2,
        sampler: 'Euler a',
      },
      quantity: 1,
    }),
  })

  if (!submitRes.ok) {
    const txt = await submitRes.text()
    throw new Error(`Civitai submit ${submitRes.status}: ${txt.slice(0, 300)}`)
  }

  const submitJson = (await submitRes.json()) as any
  const token = submitJson.token
  if (!token) throw new Error(`Civitai: no token — ${JSON.stringify(submitJson).slice(0, 200)}`)

  let imageUrl: string | null = null
  for (let i = 0; i < 30; i++) {
    await Bun.sleep(3000)
    const pollRes = await fetch(
      `https://orchestration.civitai.com/v1/consumer/jobs?token=${token}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    )
    const poll = (await pollRes.json()) as any
    const job = Array.isArray(poll.jobs) ? poll.jobs[0] : null

    if (job?.result?.blobUrl) {
      imageUrl = job.result.blobUrl
      break
    }
    if (job?.status?.failed) {
      throw new Error(`Civitai job failed: ${JSON.stringify(job.status)}`)
    }
  }

  if (!imageUrl) throw new Error('Civitai: timeout after 90s')

  const imgRes = await fetch(imageUrl)
  const imgData = new Uint8Array(await imgRes.arrayBuffer())
  const saved = await saveImage(params.book, params.ch, 'civitai', imgData)
  return { ok: true, provider: 'civitai', ...saved }
}

/* ============================================================
   ComfyUI local — ส่ง workflow JSON, poll history, download PNG
   รัน: cd ~/dru/comfyui && ./start.sh
   ============================================================ */
export async function generateComfyUI(params: ImageGenParams): Promise<ImageGenResult> {
  const baseUrl = process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188'
  const modelName = params.model ?? 'Illustrious-XL-v0.1.safetensors'
  const clientId = `novel_${Date.now()}`

  const workflow: Record<string, any> = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: modelName },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: params.prompt,
        clip: ['1', 1],
      },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: params.negative_prompt ?? 'lowres, bad anatomy, bad hands, text, watermark, worst quality, low quality',
        clip: ['1', 1],
      },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: params.width ?? 832,
        height: params.height ?? 1216,
        batch_size: 1,
      },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: params.seed ?? Math.floor(Math.random() * 9_999_999_999),
        steps: params.steps ?? 28,
        cfg: params.cfg_scale ?? 7,
        sampler_name: 'euler_ancestral',
        scheduler: 'normal',
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'novel', images: ['6', 0] },
    },
  }

  // ControlNet (OpenPose) injection — only if a pose preset image is provided
  if (params.pose_image) {
    const cnModel = params.controlnet_model ?? 'control_v11p_sd15_openpose_fp16.safetensors'
    const cnStrength = params.pose_strength ?? 1.0
    workflow['8'] = {
      class_type: 'LoadImage',
      inputs: { image: params.pose_image },
    }
    workflow['9'] = {
      class_type: 'ControlNetLoader',
      inputs: { control_net_name: cnModel },
    }
    workflow['10'] = {
      class_type: 'ControlNetApply',
      inputs: {
        strength: cnStrength,
        conditioning: ['2', 0],
        control_net: ['9', 0],
        image: ['8', 0],
      },
    }
    // re-route KSampler positive through ControlNet-applied conditioning
    workflow['5'].inputs.positive = ['10', 0]
  }

  // Submit prompt
  const submitRes = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  })
  if (!submitRes.ok) {
    const txt = await submitRes.text()
    throw new Error(`ComfyUI submit ${submitRes.status}: ${txt.slice(0, 300)}`)
  }
  const { prompt_id } = (await submitRes.json()) as { prompt_id: string }

  // Poll history until done (max 10 min)
  let outputImage: { filename: string; subfolder: string; type: string } | null = null
  for (let i = 0; i < 120; i++) {
    await Bun.sleep(5000)
    const histRes = await fetch(`${baseUrl}/history/${prompt_id}`)
    const hist = (await histRes.json()) as any
    const entry = hist[prompt_id]
    if (!entry) continue
    if (entry.status?.status_str === 'error') {
      throw new Error(`ComfyUI error: ${JSON.stringify(entry.status?.messages)}`)
    }
    const outputs = entry.outputs
    if (outputs) {
      const node = Object.values(outputs as Record<string, any>).find((o: any) => o.images)
      if (node) { outputImage = (node as any).images[0]; break }
    }
  }

  if (!outputImage) throw new Error('ComfyUI: timeout after 10 min')

  // Download the generated image
  const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(outputImage.filename)}&subfolder=${encodeURIComponent(outputImage.subfolder)}&type=${outputImage.type}`
  const imgRes = await fetch(viewUrl)
  const imgData = new Uint8Array(await imgRes.arrayBuffer())
  const saved = await saveImage(params.book, params.ch, 'comfyui', imgData)
  return { ok: true, provider: 'comfyui', ...saved }
}
