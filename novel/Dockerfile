# novel backend (Bun + Elysia) — API ล้วน :3000
FROM oven/bun:1
WORKDIR /app

# install เฉพาะ manifest ก่อน เพื่อใช้ layer cache (lockfile มีหรือไม่มีก็ได้)
COPY package.json bun.lock* bun.lockb* ./
RUN bun install

COPY . .

ENV PORT=3000
EXPOSE 3000
CMD ["bun", "server.ts"]
