// Executes inside our private PDS, using operator-only JSON stdin.
let input = "";
for await (const chunk of process.stdin) {
  input += String(chunk);
  if (input.length > 4096) throw new Error("Configuration too large");
}
const value: unknown = JSON.parse(input);
if (
  !value ||
  typeof value !== "object" ||
  !("password" in value) ||
  typeof value.password !== "string" ||
  !("host" in value) ||
  typeof value.host !== "string" ||
  !/^pds\.[a-z0-9.-]+$/.test(value.host)
)
  throw new Error("Invalid relay configuration");
const response = await fetch("http://relay:3000/admin/pds/requestCrawl", {
  method: "POST",
  headers: {
    authorization:
      "Basic " + Buffer.from("admin:" + value.password).toString("base64"),
    "content-type": "application/json",
  },
  body: JSON.stringify({ hostname: value.host }),
  signal: AbortSignal.timeout(15_000),
  redirect: "error",
});
if (!response.ok)
  throw new Error("Private relay registration failed: HTTP " + response.status);
console.log("Registered own PDS with own private relay.");
export {};
