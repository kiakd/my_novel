/** @type {import('next').NextConfig} */

// Backend เดิม (Bun/Elysia server.ts) รันที่นี่ — proxy ทุก /api และ /uploads ไปหามัน
// เลี่ยงปัญหา CORS: ฝั่ง browser เรียก path เดียวกัน (same-origin) Next ค่อย rewrite ไป backend
const BACKEND = process.env.BACKEND_URL ?? 'http://127.0.0.1:3000';

const nextConfig = {
  reactStrictMode: true,
  // standalone = build server เล็ก รันด้วย `node server.js` (image บาง + RAM น้อย เหมาะ VPS 3GB)
  // ⚠️ rewrites ด้านล่างถูก "ฝัง" ตอน build → ต้องส่ง BACKEND_URL เป็น build ARG ด้วย (ดู Dockerfile/compose)
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND}/api/:path*` },
      { source: '/uploads/:path*', destination: `${BACKEND}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
