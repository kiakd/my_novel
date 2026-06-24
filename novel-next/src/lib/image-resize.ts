// ============ ย่อรูปฝั่ง client → data URL (กันเก็บ base64 ก้อนโตใน state) ============
// อ่านไฟล์รูป → วาดลง canvas ย่อให้ด้านยาวสุด ≤ max → คืน JPEG data URL
// ใช้กับ avatar ตัวละครแชท (เก็บรวมกับ chat-state) — ~640px/q0.82 ≈ 40-80KB

export async function fileToScaledDataUrl(file: File, max = 640, quality = 0.82): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('read failed'));
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('decode failed'));
    i.src = dataUrl;
  });

  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl; // เผื่อ canvas ใช้ไม่ได้ → คืนรูปเดิม
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}
