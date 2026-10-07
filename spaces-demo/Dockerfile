FROM node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532 AS typescript
WORKDIR /source
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY public-demo ./public-demo
COPY spaces-demo ./spaces-demo
COPY scripts ./scripts
RUN npm run build

FROM node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532
WORKDIR /demo
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=typescript /source/dist/spaces-demo ./dist
USER node
CMD ["node", "dist/server.js"]
