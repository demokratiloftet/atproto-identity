import type { IncomingHttpHeaders, OutgoingHttpHeader } from "node:http";
import type { NodeOAuthClient } from "@atproto/oauth-client-node";

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
export interface AuthRequest {
  headers: IncomingHttpHeaders;
}
export interface AuthResponse {
  getHeader(name: string): OutgoingHttpHeader | undefined;
  setHeader(name: string, value: string | number | readonly string[]): unknown;
}
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  linkedAt?: string;
  displayName?: string;
  acr?: string;
}
export interface ProviderDefinition {
  id: string;
  label: string;
  issuer: string;
  clientId: string;
  clientSecret?: string;
  clientAuth?: string;
  scopes: string;
  idTokenAlgorithm?: string;
  market?: string;
  acrValues?: string;
  requiredAcr?: string;
  demo?: boolean;
}
export interface OidcFlow {
  state: string;
  verifier: string;
  nonce: string;
}
export interface IdentityProvider {
  definition: Pick<ProviderDefinition, "id" | "label"> &
    Partial<ProviderDefinition>;
  start(
    state: string,
  ): Promise<{ url: string; verifier: string; nonce: string }>;
  callback(url: URL, flow: OidcFlow): Promise<VerifiedIdentity>;
}
// A narrow client contract also allows deterministic adapters in host tests.
export interface AtprotoSession {
  did: string;
  signOut(): Promise<void>;
  fetchHandler: Awaited<ReturnType<NodeOAuthClient["restore"]>>["fetchHandler"];
  getTokenInfo: Awaited<ReturnType<NodeOAuthClient["restore"]>>["getTokenInfo"];
}
export interface AtprotoProvider {
  client: {
    authorize(
      handle: string,
      options: { state: string; prompt: "login" },
    ): Promise<URL>;
    callback(params: URLSearchParams): Promise<{
      session: Pick<AtprotoSession, "did" | "signOut">;
      state?: string | null;
    }>;
    restore(did: string): Promise<AtprotoSession>;
    revoke(did: string): Promise<void>;
  };
}
export interface Onboarding {
  provider: string;
  identity: VerifiedIdentity;
  expectedDid?: string;
  candidateDid?: string;
  suggestions?: Array<{ domain: string; handle: string }>;
  expires: number;
}
export interface BrowserSession {
  did?: string;
  loginAt?: number;
  epoch?: string;
  onboarding?: Onboarding;
}
export interface AuthenticatedSession extends BrowserSession {
  did: string;
  loginAt: number;
  epoch: string;
  key: string;
}
export interface StoredFlow {
  browser: string;
  purpose: "login" | "link" | "identity-login";
  expectedDid?: string;
  did?: string;
  provider?: string;
  state?: string;
  verifier?: string;
  nonce?: string;
}
export interface StoredRecords {
  browser: BrowserSession;
  flow: StoredFlow;
  epoch: { value: string };
  pending: { did: string; provider: string; identity: VerifiedIdentity };
  "at-state": { appState?: string };
  "at-session": object;
  "identity-signup": {
    status: "creating" | "created" | "needs-review";
    handle: string;
    did?: string;
  };
  "identity-handle": { identityKey: string };
  meta: { ok: boolean };
}
