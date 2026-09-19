FROM node:22-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2 AS social-build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git init && git remote add origin https://github.com/eurosky-social/social-app.git && git fetch --depth=1 origin 97788ff94232ae9da0b5cd2a5411474f9f2805fd && git checkout --detach FETCH_HEAD
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn yarn install --frozen-lockfile --ignore-scripts --network-timeout 600000
COPY patch-social.mjs /tmp/
RUN node /tmp/patch-social.mjs /src && yarn patch-package
ARG PDS_HOST
ARG DEMO_BASE_DOMAIN
ARG FEED_OWNER_DID
ENV EXPO_PUBLIC_LOCAL_PDS=$PDS_HOST EXPO_PUBLIC_APPVIEW_DOMAIN=$PDS_HOST EXPO_PUBLIC_PUBLIC_APPVIEW_DOMAIN=$PDS_HOST EXPO_PUBLIC_BLUESKY_PROXY_DID=did:web:bsky.$DEMO_BASE_DOMAIN EXPO_PUBLIC_FEED_OWNER_DID=$FEED_OWNER_DID EXPO_PUBLIC_ENV=production
RUN test -n "$PDS_HOST" && test -n "$DEMO_BASE_DOMAIN" && yarn intl:compile && yarn build-web

FROM node:22-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2
RUN apt-get update && apt-get install -y --no-install-recommends iptables util-linux && rm -rf /var/lib/apt/lists/*
WORKDIR /demo
COPY gateway.mjs policy.mjs dns.mjs entrypoint.sh ./
COPY --from=social-build /src/web-build /social/web-build
ENTRYPOINT ["sh","/demo/entrypoint.sh"]
