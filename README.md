# Server infrastructure

Our deployment configuration for [Eurosky](https://github.com/eurosky-social/u-at-proto), included unchanged as a Git submodule in `upstream/`.

We use **Vercel DNS**, so our overrides adapt the DNS script and Traefik configuration. All container images are **pinned by digest** to keep versions consistent between deployments.
