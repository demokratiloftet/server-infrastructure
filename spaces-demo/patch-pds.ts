import { readFileSync, writeFileSync } from "node:fs";
// This PDS only needs our PLC, not the calendar OAuth or AppView exceptions.
// Keep SSRF protection enabled for every other request, and fail on source drift.
const path = "/app/packages/pds/dist/context.js";
let source = readFileSync(path, "utf8");
function replace(before: string, after: string) {
  if (source.split(before).length !== 2)
    throw new Error("Pinned Spaces PDS source changed");
  source = source.replace(before, after);
}
replace(
  "const safeFetch = safeFetchWrap({",
  "const strictFetch = safeFetchWrap({",
);
replace(
  "        const idResolver = new IdResolver({",
  `        if (cfg.service.devMode || cfg.fetch.disableSsrfProtection || cfg.identity.plcUrl !== 'http://plc:3000') throw new Error('Spaces demo requires the private PLC and SSRF protection');
        const safeFetch = async (input, init) => {
            const req = new Request(input, init), url = new URL(req.url);
            if (req.method === 'GET' && url.origin === 'http://plc:3000' && !url.username && !url.password && !url.search && /^\\/did:plc:[a-z2-7]{24}$/.test(url.pathname)) {
                return fetch(req, {redirect: 'error', signal: AbortSignal.timeout(8000)});
            }
            return strictFetch(input, init);
        };
        const idResolver = new IdResolver({`,
);
writeFileSync(path, source);
