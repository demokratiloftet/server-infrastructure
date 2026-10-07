// Defense in depth for browser-side requests. CSP also covers XHR and media.
const request = globalThis.fetch.bind(globalThis);
const pds = "https://" + process.env.EXPO_PUBLIC_LOCAL_PDS;
const allowed = new Set([location.origin, pds]);
globalThis.fetch = (input, init = {}) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
    location.href,
  );
  if (!allowed.has(url.origin))
    return Promise.reject(
      new Error("External services are disabled in this demo"),
    );
  return request(input, { ...init, credentials: "include", redirect: "error" });
};

export {};
