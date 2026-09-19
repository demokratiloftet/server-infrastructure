# Calendar demo constraints

- Preserve local sandbox isolation. No public accounts, relays, PLC registration,
  tunnels, unrestricted egress or broad host-port bindings.
- Run `npm test`, `npm run test:integration` and `npm run verify` after trust or
  infrastructure changes. Tests use new disposable accounts; never reset PDS data.
- Keep demo data synthetic and clearly labelled. No implied NIF verification.
- Issuer authority comes from the configured repository DID and trusted PDS,
  never an issuer field in a subject-controlled record. Fail closed on outages.
- Never claim independent signature verification, OAuth, identity linkage or
  historical authorization until implemented and tested.
- Do not deploy to the VPS without an actual deployment request. Keep credentials
  out of source, browser responses, logs and screenshots.
