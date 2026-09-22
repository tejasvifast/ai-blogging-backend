# syntax=docker/dockerfile:1

# ── Base ───────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
# openssl + libc6-compat are needed by Prisma's query engine on Alpine.
RUN apk add --no-cache libc6-compat openssl

# ── Builder: install deps, generate Prisma client, compile TS ──
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ── Runner: minimal, non-root ──────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4000

# Run as an unprivileged user.
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# node_modules is copied whole (includes the Prisma CLI so the entrypoint can
# run `migrate deploy`, and the generated client under .prisma).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh && chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 4000

# Liveness probe hits the dependency-free endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
