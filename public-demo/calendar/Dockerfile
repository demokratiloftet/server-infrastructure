FROM node:22-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2
RUN apt-get update && apt-get install -y --no-install-recommends iptables util-linux && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --omit=dev --ignore-scripts && mkdir -p /data/auth && chown node:node /data/auth
COPY src ./src
COPY public ./public
COPY infra ./infra
ENTRYPOINT ["sh", "/app/infra/entrypoint.sh"]
