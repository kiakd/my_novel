# novel-next frontend (Next.js 15 + Bun) :3001 — proxy /api,/uploads ไป backend ผ่าน BACKEND_URL
FROM oven/bun:1
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json bun.lock* bun.lockb* ./
RUN bun install

COPY . .
RUN bun run build

ENV PORT=3001
EXPOSE 3001
# start = next start -p 3001 (อ่าน BACKEND_URL ตอน runtime สำหรับ rewrites)
CMD ["bun", "run", "start"]
