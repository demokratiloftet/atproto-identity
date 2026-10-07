import type { Fetch } from "./types.ts";
import http from "node:http";
// Every SDK/discovery request must match an operator-configured origin. Local
// rewrites preserve Host and the original issuer/DPoP URL, with no redirects.
export function restrictedFetch(
  routes: Record<string, string>,
  fetchImpl: Fetch = fetch,
): Fetch {
  const allowed = new Map(Object.entries(routes));
  return async (input, init = {}) => {
    const original = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    const target = allowed.get(original.origin);
    if (!target || original.username || original.password)
      throw new Error("Auth network destination is not allowed");
    const destination = new URL(original.pathname + original.search, target),
      request = new Request(input, init);
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(10000),
    ]);
    if (destination.origin === original.origin)
      return fetchImpl(request, { redirect: "error", signal });
    if (original.protocol !== "http:" || destination.protocol !== "http:")
      throw new Error(
        "Origin rewriting is only supported for isolated HTTP development",
      );
    const body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : Buffer.from(await request.arrayBuffer());
    return new Promise<Response>((resolve, reject) => {
      const headers = Object.fromEntries(request.headers);
      headers.host = original.host;
      if (body) headers["content-length"] = String(body.length);
      const outgoing = http.request(
        destination,
        { method: request.method, headers, signal },
        (incoming) => {
          const status = incoming.statusCode ?? 502;
          if (status >= 300 && status < 400) {
            incoming.resume();
            reject(new Error("Auth redirects are forbidden"));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          incoming.on("data", (chunk) => {
            size += chunk.length;
            if (size > 2 * 1024 * 1024) {
              outgoing.destroy(new Error("Auth response too large"));
              return;
            }
            chunks.push(chunk);
          });
          incoming.on("error", reject);
          incoming.on("end", () => {
            const responseHeaders = new Headers();
            for (const [name, value] of Object.entries(incoming.headers))
              for (const v of Array.isArray(value) ? value : [value])
                if (v !== undefined) responseHeaders.append(name, v);
            resolve(
              new Response(
                [204, 205, 304].includes(status) ? null : Buffer.concat(chunks),
                { status, headers: responseHeaders },
              ),
            );
          });
        },
      );
      outgoing.on("error", reject);
      outgoing.end(body);
    });
  };
}
