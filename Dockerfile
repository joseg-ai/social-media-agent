# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Builder
# Installs ALL dependencies (including devDeps needed for the build) and
# compiles the Next.js application.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first for better layer caching.
COPY package.json package-lock.json ./

# Install all deps (devDeps are needed for `next build` and `tsx`).
RUN npm ci

# Copy the full source tree.
COPY . .

# Build Next.js. SKIP_ENV_VALIDATION=1 because runtime env vars are injected
# by Azure App Service — not available at build time.
ENV SKIP_ENV_VALIDATION=1
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Runtime
# Lean production image: only what is needed to run the app.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Security hardening: run as a non-root user.
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

WORKDIR /app

# Copy only the artifacts required at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules   ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next          ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public         ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json   ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/scripts        ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src/db/migrations ./src/db/migrations
# tsconfig is required by tsx at runtime for path-alias resolution (@/*).
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json  ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/src            ./src

USER nextjs

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Azure App Service sets $PORT; start:prod reads process.env.PORT.
CMD ["npm", "run", "start:prod"]
