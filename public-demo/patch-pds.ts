import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
const req = createRequire("/app/index.js"),
  root = dirname(req.resolve("@atproto/pds"));
const file = join(root, "context.js");
let s = readFileSync(file, "utf8");
function replace(a: string, b: string) {
  if (s.split(a).length !== 2)
    throw new Error("Pinned PDS source changed: " + a);
  s = s.replace(a, b);
}
replace(
  "import { safeFetchWrap } from '@atproto-labs/fetch-node';",
  "import { safeFetchWrap } from '@atproto-labs/fetch-node';\nimport {privateFetch, privateProxy} from './loftet-boundary.mjs';",
);
replace(
  "const safeFetch = safeFetchWrap({",
  "const strictFetch = safeFetchWrap({",
);
replace(
  "        const plcClient = new plc.Client(cfg.identity.plcUrl);",
  "        const plcClient = new plc.Client(cfg.identity.plcUrl);",
);
// Insert before the first consumer, not after idResolver construction.
replace(
  "        const idResolver = new IdResolver({",
  `        if (!process.env.DEMO_CALENDAR_ORIGIN || cfg.fetch.disableSsrfProtection || cfg.service.devMode) throw new Error('Private demo requires SSRF protection and production mode');
        const safeFetch = privateFetch(strictFetch, globalThis.fetch, {calendar: process.env.DEMO_CALENDAR_ORIGIN, plc: cfg.identity.plcUrl});
        const idResolver = new IdResolver({`,
);
replace(
  "const proxyAgent = buildProxyAgent(cfg.proxy);",
  `const proxyAgent = privateProxy(buildProxyAgent(cfg.proxy), buildProxyAgent({...cfg.proxy, disableSsrfProtection:true}), cfg.bskyAppView.url);`,
);
writeFileSync(file, s);
copyFileSync("/tmp/pds-boundary.mjs", join(root, "loftet-boundary.mjs"));
