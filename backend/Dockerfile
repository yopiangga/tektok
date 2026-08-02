# Build context is the repository root (see docker-compose.yml).
FROM node:22-alpine AS build
WORKDIR /app

COPY backend/package.json ./
RUN npm install --no-audit --fund=false

COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY backend/package.json ./
RUN npm install --omit=dev --no-audit --fund=false && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY db ./db

RUN mkdir -p /app/uploads \
    && addgroup -S tocs && adduser -S tocs -G tocs \
    && chown -R tocs:tocs /app
USER tocs

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
