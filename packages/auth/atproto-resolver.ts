import {
  isResolvedHandle,
  type HandleResolver,
} from "@atproto/oauth-client-node";
import type { Fetch } from "./types.ts";
import { publicFetch } from "./public-transport.ts";

/** Opt-in resolution through one PDS, for example an isolated .test sandbox. */
export function createPdsHandleResolver(
  pdsOrigin: string,
  fetch: Fetch = publicFetch,
): HandleResolver {
  return {
    async resolve(handle, options) {
      const url = new URL(
        "/xrpc/com.atproto.identity.resolveHandle",
        pdsOrigin,
      );
      url.searchParams.set("handle", handle);
      const response = await fetch(url, {
        signal: options?.signal,
        redirect: "error",
      });
      if (!response.ok) throw new Error("PDS could not resolve handle");
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("did" in result) ||
        typeof result.did !== "string" ||
        !isResolvedHandle(result.did)
      )
        throw new Error("Invalid resolved DID");
      // The SDK still verifies that the DID document claims this handle.
      return result.did;
    },
  };
}
