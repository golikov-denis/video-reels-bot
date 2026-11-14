FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY worker/package.json ./worker/package.json
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY worker/tsconfig.json ./worker/tsconfig.json
COPY worker/src ./worker/src

ENV NODE_ENV=production
USER node
CMD ["npm", "run", "start", "--workspace", "@video-reels-bot/worker"]
