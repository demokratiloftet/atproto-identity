import {
  AtprotoHandleResolverNode,
  NodeOAuthClient,
  requestLocalLock,
  type NodeOAuthClientOptions,
  type NodeSavedState,
  type NodeSavedSession,
} from "@atproto/oauth-client-node";
import type { AuthStore } from "./store.ts";
import type { Fetch } from "./types.ts";
import { atprotoClientMetadata } from "./atproto-metadata.ts";
import { publicFetch } from "./public-transport.ts";

export { atprotoClientMetadata } from "./atproto-metadata.ts";
export type { AtprotoMetadataOptions } from "./atproto-metadata.ts";
export { createPdsHandleResolver } from "./atproto-resolver.ts";

export interface AtprotoProviderOptions {
  origin: string;
  store: Pick<AuthStore, "adapter">;
  clientName?: string;
  scope?: string;
  /** Overrides outbound transport. The caller owns its network policy. */
  fetch?: Fetch;
  /** Defaults to the public PLC directory. did:web resolves independently. */
  plcUrl?: string;
  handleResolver?: NodeOAuthClientOptions["handleResolver"];
  /** Isolated development only; requires an explicit restricted fetch. */
  allowHttp?: boolean;
}

/** Compose the official SDK with private storage and standard account discovery. */
export function createAtprotoProvider({
  origin,
  store,
  clientName,
  scope,
  fetch,
  plcUrl,
  handleResolver,
  allowHttp = false,
}: AtprotoProviderOptions) {
  if (allowHttp && !fetch)
    throw new Error("HTTP development requires an explicit restricted fetch");

  const request = fetch ?? publicFetch;
  const client = new NodeOAuthClient({
    clientMetadata: atprotoClientMetadata({
      origin,
      clientName,
      scope,
    }),
    allowHttp,
    fetch: request,
    plcDirectoryUrl: plcUrl,
    requestLock: requestLocalLock,
    stateStore: store.adapter<NodeSavedState>("at-state", 10 * 60000),
    sessionStore: store.adapter<NodeSavedSession>("at-session"),
    handleResolver:
      handleResolver ??
      new AtprotoHandleResolverNode({
        // Its built-in guard must wrap the raw fetch only once.
        fetch: fetch === publicFetch ? undefined : fetch,
      }),
    // The Node resolver provides its own guarded fetch for DNS/HTTPS handles;
    // publicFetch protects DID, OAuth discovery, tokens and session requests.
  });
  return { client, metadata: client.clientMetadata };
}
