# novel backend (Bun + Elysia) — API ล้วน :3000 — จูนสำหรับ VPS 3GB
# multi-stage: ลง prod deps แยก layer, image สุดท้ายไม่มี devDeps

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p uploads
EXPOSE 3000
# health = ping mongo ผ่าน /api/health (ใช้ bun ยิงเอง ไม่ต้องลง curl/wget)
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "server.ts"]
