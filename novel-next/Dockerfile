# novel-next (Next.js 15) — multi-stage standalone, จูนสำหรับ VPS 3GB
# build ด้วย bun, runtime ด้วย node (server.js ของ standalone) → image เล็ก + RAM น้อย

# ---- deps: ลง node_modules แยก layer ใช้ cache ----
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile

# ---- build: สร้าง .next/standalone ----
FROM oven/bun:1 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# คุมหน่วยความจำ V8 ตอน build กัน OOM บนเครื่อง RAM น้อย (+ swap)
ENV NODE_OPTIONS=--max-old-space-size=1536
# ⚠️ BACKEND_URL ถูกฝังลง rewrites ตอน build → ต้องเป็นชื่อ service จริงใน network ("novel")
ARG BACKEND_URL=http://novel:3000
ENV BACKEND_URL=$BACKEND_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# ---- runner: รันด้วย node แบบ non-root ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# standalone bundle (server.js + node_modules ที่ trace มาเท่าที่ใช้จริง) + static + public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER nextjs
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
