# Stage 1: Build Multiplayer Activity Client
FROM node:22-slim AS client-builder
WORKDIR /app/activity-client
COPY activity-client/package*.json ./
RUN npm install
COPY activity-client/ ./
RUN npm run build

# Stage 2: Production Discord Bot + Socket.io Multiplayer Server
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=client-builder /app/activity-client/dist ./activity-client/dist

WORKDIR /app/bot
COPY bot/package*.json ./
RUN npm install --omit=dev
COPY bot/ ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/index.js"]
