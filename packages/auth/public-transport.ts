import { safeFetchWrap } from "@atproto-labs/fetch-node";
import type { Fetch } from "./types.ts";

// Use the SDK ecosystem's connection-time DNS/IP checks, including redirects.
// Keep this separate from restrictedFetch, which protects isolated deployments.
const request = safeFetchWrap({
  ssrfProtection: true,
  allowHttp: false,
  allowCustomPort: true,
  responseMaxSize: 2 * 1024 * 1024,
  timeout: 10000,
});

export const publicFetch: Fetch = (input, init) =>
  request(input, { redirect: "error", ...init });
