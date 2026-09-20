# Server infrastructure

Our deployment configuration for [Eurosky](https://github.com/eurosky-social/u-at-proto), included unchanged as a Git submodule in `upstream/`.

We use **Vercel DNS**, so our overrides adapt the DNS script and Traefik configuration. All container images are **pinned by digest** to keep versions consistent between deployments.

The opt-in [public demo deployment](public-demo/README.md) supports open signup
for both apps while keeping federation inside the VPS. It defaults to loopback
HTTPS. Production public access has not been enabled.

See [the original audit](PUBLIC-DEMO-PLAN.md) for the problems this addresses.

An optional [Spaces private-group demo](spaces-demo/README.md) adds a small
members-only noticeboard at the calendar host's `/spaces/` path. It uses a separate
alpha PDS and volume; the existing stack is unchanged until explicitly enabled.
