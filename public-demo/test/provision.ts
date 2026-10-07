// Executed inside the private staging PDS; credentials arrive only on stdin.
let input = "";
for await (const chunk of process.stdin) {
  input += String(chunk);
  if (input.length > 32_768) throw new Error("Configuration too large");
}
const value: unknown = JSON.parse(input);
if (!value || typeof value !== "object" || Array.isArray(value))
  throw new Error("Invalid configuration");
const config = value as Record<string, unknown>;
const accounts: Record<string, string> = {};
for (const role of ["ISSUER", "ORGANISER"] as const) {
  const handle = config["DEMO_" + role + "_HANDLE"];
  const password = config["DEMO_" + role + "_PASSWORD"];
  if (typeof handle !== "string" || typeof password !== "string")
    throw new Error("Missing staging credentials");
  let response = await fetch(
    "http://127.0.0.1:3000/xrpc/com.atproto.server.createAccount",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        handle,
        password,
        email: role.toLowerCase() + "@example.invalid",
      }),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    },
  );
  if (!response.ok)
    response = await fetch(
      "http://127.0.0.1:3000/xrpc/com.atproto.server.createSession",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: handle, password }),
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      },
    );
  if (!response.ok) throw new Error("Could not provision staging account");
  const account: unknown = await response.json();
  if (
    !account ||
    typeof account !== "object" ||
    !("did" in account) ||
    typeof account.did !== "string" ||
    !/^did:plc:[a-z2-7]{24}$/.test(account.did)
  )
    throw new Error("Invalid staging account response");
  accounts[role] = account.did;
}
console.log(JSON.stringify(accounts));
export {};
