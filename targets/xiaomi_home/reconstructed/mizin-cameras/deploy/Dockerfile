FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node server.mjs sd-bridge.mjs package.json ./
COPY --chown=node:node public ./public
COPY --chown=node:node deploy ./deploy
ENV MIZIN_CAMERAS_TARGET=/data MIZIN_CAMERAS_FFMPEG=/usr/bin/ffmpeg
USER node
CMD ["node","deploy/boot.mjs"]
