FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/tuya && /opt/tuya/bin/pip install --no-cache-dir tinytuya==1.20.0
WORKDIR /workspace
COPY --chown=1000:1000 workspace/ /workspace/
ENV MIZIN_WORKSPACE=/workspace MIZIN_MANAGED=1 MIZIN_PYTHON=/opt/tuya/bin/python MIZIN_CAMERAS_FFMPEG=ffmpeg MIZIN_FFPROBE=ffprobe
USER 1000:1000
CMD ["node","targets/tuya_smartlife/reconstructed/mizin-portal/server.mjs"]
