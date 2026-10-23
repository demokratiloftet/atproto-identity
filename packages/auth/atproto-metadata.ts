import {
  buildAtprotoLoopbackClientMetadata,
  type NodeOAuthClientOptions,
} from "@atproto/oauth-client-node";

export interface AtprotoMetadataOptions {
  origin: string;
  clientName?: string;
  scope?: string;
}

/** Public metadata served by the host app at /auth/client-metadata.json. */
export function atprotoClientMetadata({
  origin,
  clientName = "AT Protocol app",
  scope = "atproto",
}: AtprotoMetadataOptions): NodeOAuthClientOptions["clientMetadata"] {
  const url = new URL(origin);
  const loopback =
    url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (!loopback && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("App origin must be HTTPS or an HTTP loopback origin");
  if (!scope.split(/\s+/).includes("atproto"))
    throw new Error("OAuth scope must include atproto");

  const redirect = `${url.origin}/auth/atproto/callback`;
  if (loopback)
    return buildAtprotoLoopbackClientMetadata({
      scope,
      redirect_uris: [redirect],
    });
  return {
    client_id: `${url.origin}/auth/client-metadata.json`,
    client_name: clientName,
    client_uri: url.origin,
    redirect_uris: [redirect],
    scope,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: "web",
    dpop_bound_access_tokens: true,
  };
}
