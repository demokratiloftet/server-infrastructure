# Server infrastructure
Deployment overlays for [Eurosky](https://github.com/eurosky-social/u-at-proto), kept unchanged in the `upstream/` Git submodule.
We use Vercel DNS, so we altered the DNS update script and Traefik configuration to replace Cloudflare.
All container images are pinned by SHA-256 digest in `compose.override.yaml` for reproducible deployments.
Initialize with `git submodule update --init --recursive`, copy `.env.example` to `.env` and configure it, then run `docker compose up -d --wait` (validated with Compose 5.5.1).
