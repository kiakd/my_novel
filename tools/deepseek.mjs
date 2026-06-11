// DeepSeek helper สำหรับทีม my_novel — ส่งงานตรวจข้อความไทยจำนวนมากไปที่ DeepSeek
// แทนการอ่านทั้งไฟล์เข้า context ของ Claude (ประหยัด token ภาษาไทย)
//
// ใช้:  node tools/deepseek.mjs --system "คำสั่งตรวจ" chapters/ep001.md [ไฟล์เพิ่ม...]
//       echo "ข้อความ" | node tools/deepseek.mjs --system "คำสั่งตรวจ"
// ผลลัพธ์พิมพ์ออก stdout — เอาไปเขียนรายงานต่อได้เลย
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// โหลด .env ที่ root โปรเจค (ไม่พึ่ง dotenv)
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) {
  console.error("ยังไม่มี DEEPSEEK_API_KEY — เปิดไฟล์ .env ที่ root โปรเจคแล้ววาง key ก่อน");
  process.exit(1);
}
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

const args = process.argv.slice(2);
let system = "คุณเป็นผู้ช่วยตรวจต้นฉบับนิยายภาษาไทย ตอบเป็นภาษาไทย กระชับ ชี้ตำแหน่งชัดเจน";
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--system") system = args[++i];
  else if (args[i] === "--model") process.env.DEEPSEEK_MODEL_OVERRIDE = args[++i];
  else files.push(args[i]);
}

let content = "";
if (files.length) {
  for (const f of files) {
    const p = join(root, f);
    content += `\n===== ไฟล์: ${f} =====\n` + readFileSync(p, "utf8");
  }
} else {
  content = readFileSync(0, "utf8"); // stdin
}
if (!content.trim()) { console.error("ไม่มีข้อความให้ตรวจ"); process.exit(1); }

const res = await fetch("https://api.deepseek.com/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer " + KEY },
  body: JSON.stringify({
    model: process.env.DEEPSEEK_MODEL_OVERRIDE || MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    temperature: 0.2,
    max_tokens: 8000,
  }),
});
if (!res.ok) {
  console.error(`DeepSeek error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const data = await res.json();
console.log(data.choices?.[0]?.message?.content || "(ไม่มีคำตอบ)");
const u = data.usage;
if (u) console.error(`[deepseek ${u.prompt_tokens}+${u.completion_tokens} tokens]`);
