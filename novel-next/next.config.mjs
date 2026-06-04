/** @type {import('next').NextConfig} */

// Backend เดิม (Bun/Elysia server.ts) รันที่นี่ — proxy ทุก /api และ /uploads ไปหามัน
// เลี่ยงปัญหา CORS: ฝั่ง browser เรียก path เดียวกัน (same-origin) Next ค่อย rewrite ไป backend
const BACKEND = process.env.BACKEND_URL ?? 'http://127.0.0.1:3000';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND}/api/:path*` },
      { source: '/uploads/:path*', destination: `${BACKEND}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
