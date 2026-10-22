FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS typescript
WORKDIR /source
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY public-demo ./public-demo
COPY spaces-demo ./spaces-demo
COPY scripts ./scripts
RUN npm run build

FROM node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS social-build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git init && git remote add origin https://github.com/eurosky-social/social-app.git && git fetch --depth=1 origin 97788ff94232ae9da0b5cd2a5411474f9f2805fd && git checkout --detach FETCH_HEAD
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn yarn install --frozen-lockfile --ignore-scripts --network-timeout 600000
COPY --from=typescript /source/dist/public-demo/patch-social.js /tmp/patch-social.mjs
COPY --from=typescript /source/public-demo/browser-runtime.ts /tmp/browser-runtime.ts
RUN node /tmp/patch-social.mjs /src && yarn patch-package
ARG PDS_HOST
ARG DEMO_BASE_DOMAIN
ARG FEED_OWNER_DID
ENV EXPO_PUBLIC_LOCAL_PDS=$PDS_HOST EXPO_PUBLIC_APPVIEW_DOMAIN=$PDS_HOST EXPO_PUBLIC_PUBLIC_APPVIEW_DOMAIN=$PDS_HOST EXPO_PUBLIC_BLUESKY_PROXY_DID=did:web:bsky.$DEMO_BASE_DOMAIN EXPO_PUBLIC_FEED_OWNER_DID=$FEED_OWNER_DID EXPO_PUBLIC_ENV=production
RUN test -n "$PDS_HOST" && test -n "$DEMO_BASE_DOMAIN" && yarn intl:compile && yarn build-web

FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
RUN apt-get update && apt-get install -y --no-install-recommends iptables util-linux && rm -rf /var/lib/apt/lists/*
WORKDIR /demo
COPY package.json ./
COPY --from=typescript /source/dist/public-demo ./dist
COPY public-demo/entrypoint.sh ./entrypoint.sh
COPY --from=social-build /src/web-build /social/web-build
ENTRYPOINT ["sh","/demo/entrypoint.sh"]
