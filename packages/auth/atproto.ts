import type { AuthStore } from "./store.ts";
import type { Fetch } from "./types.ts";
import type {
  NodeOAuthClientOptions,
  NodeSavedState,
  NodeSavedSession,
} from "@atproto/oauth-client-node";
import {
  NodeOAuthClient,
  isResolvedHandle,
  buildAtprotoLoopbackClientMetadata,
  requestLocalLock,
} from "@atproto/oauth-client-node";
export function createAtprotoProvider({
  origin,
  store,
  fetch,
  plcUrl,
  pdsOrigin,
  allowHttp = false,
  scope = "atproto transition:generic",
}: {
  origin: string;
  store: AuthStore;
  fetch: Fetch;
  plcUrl: string;
  pdsOrigin: string;
  allowHttp?: boolean;
  scope?: string;
}) {
  const redirect = `${origin}/auth/atproto/callback`;
  const clientMetadata: NodeOAuthClientOptions["clientMetadata"] =
    origin.startsWith("http://127.0.0.1:")
      ? buildAtprotoLoopbackClientMetadata({ scope, redirect_uris: [redirect] })
      : {
          client_id: `${origin}/auth/client-metadata.json`,
          client_name: "Loftet",
          client_uri: origin,
          redirect_uris: [redirect],
          scope,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
          application_type: "web",
          dpop_bound_access_tokens: true,
        };
  const client = new NodeOAuthClient({
    clientMetadata,
    allowHttp,
    fetch,
    plcDirectoryUrl: plcUrl,
    requestLock: requestLocalLock,
    stateStore: store.adapter<NodeSavedState>("at-state", 10 * 60000),
    sessionStore: store.adapter<NodeSavedSession>("at-session"),
    handleResolver: {
      async resolve(handle) {
        // Sandbox handles are resolved exclusively by the configured PDS; the SDK
        // still checks the DID document/handle relationship through the local PLC.
        const url = new URL(
          "/xrpc/com.atproto.identity.resolveHandle",
          pdsOrigin,
        );
        url.searchParams.set("handle", handle);
        const r = await fetch(url);
        if (!r.ok) throw new Error("Unknown sandbox handle");
        const result: unknown = await r.json();
        if (
          !result ||
          typeof result !== "object" ||
          !("did" in result) ||
          typeof result.did !== "string" ||
          !isResolvedHandle(result.did)
        )
          throw new Error("Invalid resolved DID");
        return result.did;
      },
    },
  });
  return { client, metadata: client.clientMetadata };
}
