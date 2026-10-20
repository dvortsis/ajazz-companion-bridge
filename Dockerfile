# Ajazz / Mirabox Companion Bridge - headless container (Linux / Unraid)
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends libudev1 libusb-1.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js supervisor.js config.js log.js devices.js parser.js protocol.js layout.js satellite.js session.js \
     manager.js worker-client.js image-worker.js tray.js startup.js lock.js probe.js LICENSE ./
COPY AKP05_icon.png ./

# Settings come from environment variables (no .env needed). Logs and the lock live in /config.
ENV BRIDGE_NO_TRAY=1 \
    LOG_DIR=/config \
    COMPANION_HOST=127.0.0.1 \
    COMPANION_PORT=16622
VOLUME /config

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s CMD node -e "process.exit(require('fs').existsSync('/app/package.json')?0:1)"
CMD ["node", "index.js"]
