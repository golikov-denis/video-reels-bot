FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m pip install --no-cache-dir --break-system-packages faster-whisper==1.2.1 argostranslate==1.11.0 \
  && python3 -c 'from huggingface_hub import snapshot_download; snapshot_download("Systran/faster-whisper-tiny", local_dir="/opt/whisper-model")'

ENV ARGOS_PACKAGES_DIR=/opt/argos-models
RUN mkdir -p /opt/argos-models \
  && python3 -c 'import urllib.request; urllib.request.urlretrieve("https://argos-net.com/v1/translate-en_ru-1_9.argosmodel", "/tmp/translate-en_ru.argosmodel")' \
  && python3 -c 'from argostranslate import package; package.install_from_path("/tmp/translate-en_ru.argosmodel")' \
  && python3 -c 'import urllib.request; urllib.request.urlretrieve("https://argos-net.com/v1/translate-ru_en-1_9.argosmodel", "/tmp/translate-ru_en.argosmodel")' \
  && python3 -c 'from argostranslate import package; package.install_from_path("/tmp/translate-ru_en.argosmodel")' \
  && rm -f /tmp/translate-en_ru.argosmodel /tmp/translate-ru_en.argosmodel \
  && chmod -R a+r /opt/whisper-model /opt/argos-models

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
ENV ARGOS_DEVICE_TYPE=cpu
ENV ARGOS_COMPUTE_TYPE=int8
ENV ARGOS_INTER_THREADS=1
ENV ARGOS_INTRA_THREADS=2
ENV ARGOS_BEAM_SIZE=1
USER node
CMD ["npm", "run", "start", "--workspace", "@video-reels-bot/worker"]
