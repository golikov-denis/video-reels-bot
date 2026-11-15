FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m pip install --no-cache-dir --break-system-packages faster-whisper==1.2.1 \
  && python3 -c 'from huggingface_hub import snapshot_download; snapshot_download("Systran/faster-whisper-tiny", local_dir="/opt/whisper-model")' \
  && chmod -R a+r /opt/whisper-model

WORKDIR /app
COPY package.json package-lock.json ./
COPY worker/package.json ./worker/package.json
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY worker/tsconfig.json ./worker/tsconfig.json
COPY worker/src ./worker/src

ENV NODE_ENV=production
ENV WHISPER_MODEL=/opt/whisper-model
USER node
CMD ["npm", "run", "start", "--workspace", "@video-reels-bot/worker"]
