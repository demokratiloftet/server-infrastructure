export type DispatchMethod =
  "dispatch" | "request" | "stream" | "pipeline" | "connect" | "upgrade";
export interface DispatchOptions {
  origin: string | URL;
  path: string;
  method: string;
}
export type DispatchCall = (
  options: DispatchOptions,
  ...args: unknown[]
) => unknown;
export type Dispatcher = Record<DispatchMethod, DispatchCall> & {
  close: () => Promise<void>;
  destroy: () => Promise<void>;
};
// These exceptions are operator-selected local services, not user-selected URLs.
export function privateFetch(
  strict: typeof fetch,
  plain: typeof fetch,
  config: { calendar: string; plc: string },
): typeof fetch {
  const metadata =
    new URL(config.calendar).origin + "/auth/client-metadata.json";
  const plc = new URL(config.plc).origin;
  return async (input, init = {}) => {
    const r = new Request(input, init),
      u = new URL(r.url);
    const isMetadata = u.href === metadata;
    const isDid =
      u.origin === plc &&
      /^\/did(?::|%3A)plc(?::|%3A)[a-z2-7]{24}$/.test(u.pathname) &&
      !u.search;
    if (
      r.method !== "GET" ||
      u.username ||
      u.password ||
      !(isMetadata || isDid)
    )
      return strict(input, init);
    const result = await plain(r, {
      redirect: "error",
      signal: AbortSignal.any([r.signal, AbortSignal.timeout(8000)]),
    });
    // Bound these small JSON documents before returning them to the provider.
    if (!result.ok) return result;
    if (!result.body) throw new Error("Missing private metadata body");
    const reader = result.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 65536) throw new Error("Private metadata too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return new Response(Buffer.concat(chunks), {
      status: result.status,
      headers: result.headers,
    });
  };
}
export function privateProxy(
  strict: Dispatcher,
  local: Dispatcher,
  appviewOrigin: string,
) {
  const origin = new URL(appviewOrigin).origin;
  const call =
    (method: DispatchMethod): DispatchCall =>
    (options, ...args) => {
      const u = new URL(String(options.origin));
      const allowed =
        u.origin === origin &&
        u.pathname === "/" &&
        !u.search &&
        !u.username &&
        !u.password &&
        /^\/xrpc\/app\.bsky\.[A-Za-z.]+(?:\?|$)/.test(options.path) &&
        ["GET", "HEAD", "POST"].includes(options.method);
      return (allowed ? local : strict)[method](options, ...args);
    };
  const result: Dispatcher = {
    dispatch: call("dispatch"),
    request: call("request"),
    stream: call("stream"),
    pipeline: call("pipeline"),
    connect: call("connect"),
    upgrade: call("upgrade"),
    close: async () => {
      await Promise.all([strict.close(), local.close()]);
    },
    destroy: async () => {
      await Promise.all([strict.destroy(), local.destroy()]);
    },
  };
  return result;
}
