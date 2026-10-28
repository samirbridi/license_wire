FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/tuya && /opt/tuya/bin/pip install --no-cache-dir tinytuya==1.20.0
WORKDIR /workspace
COPY --chown=1000:1000 workspace/ /workspace/
RUN cd /workspace/targets/tuya_smartlife/reconstructed/mizin-portal && npm ci --omit=dev --ignore-scripts && npm cache clean --force
RUN node -e "const fs=require('fs');for(const p of ['/workspace','/workspace/targets','/workspace/targets/tuya_smartlife/reconstructed/mizin-portal']){const s=fs.statSync(p);console.log('CODE_DIRECTORY',p,s.uid,s.gid,(s.mode&511).toString(8));}" \
 && chown -R 1000:1000 /workspace && chmod -R u=rwX,go= /workspace \
 && chmod 500 /workspace/targets/xiaomi_home/reconstructed/mizin-cameras/bridge/go2rtc-linux-amd64
ENV MIZIN_WORKSPACE=/workspace MIZIN_MANAGED=1 MIZIN_PYTHON=/opt/tuya/bin/python MIZIN_CAMERAS_FFMPEG=ffmpeg MIZIN_FFPROBE=ffprobe
USER 1000:1000
RUN node -e "const fs=require('fs'),crypto=require('crypto');for(const p of ['server.mjs','deploy/auth-boot.mjs','camera-archive-runner.mjs','r2-sync-runner.mjs'])fs.accessSync('/workspace/targets/tuya_smartlife/reconstructed/mizin-portal/'+p,fs.constants.R_OK);const root='/workspace/targets/xiaomi_home/reconstructed/mizin-cameras/bridge/',receipt=JSON.parse(fs.readFileSync(root+'sha256.json'));fs.accessSync(root+receipt.file,fs.constants.X_OK);if(crypto.createHash('sha256').update(fs.readFileSync(root+receipt.file)).digest('hex')!==receipt.sha256)throw new Error('Bridge integrity failed');import('file:///workspace/targets/tuya_smartlife/reconstructed/mizin-portal/portal-identity.mjs').then(()=>console.log('RUNTIME_USER_CODE_ACCESS_AND_BRIDGE_INTEGRITY_OK'));"
CMD ["node","targets/tuya_smartlife/reconstructed/mizin-portal/server.mjs"]
