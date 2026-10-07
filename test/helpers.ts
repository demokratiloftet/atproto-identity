import assert from "node:assert/strict";
import type { AuthResponse, AtprotoSession } from "../packages/auth/types.ts";
import type { SQLOutputValue } from "node:sqlite";

export class TestResponse implements AuthResponse {
  headers: Record<string, string[]> = {};
  getHeader(name: string) {
    return this.headers[name];
  }
  setHeader(name: string, value: string | number | readonly string[]) {
    this.headers[name] =
      typeof value === "string" || typeof value === "number"
        ? [String(value)]
        : [...value];
  }
}
export function required<T>(value: T | null | undefined): T {
  assert(value !== null && value !== undefined, "Expected a test value");
  return value;
}
export function sqlString(
  row: Record<string, SQLOutputValue> | undefined,
  column: string,
) {
  const value = required(row)[column];
  assert.equal(typeof value, "string");
  assert(typeof value === "string");
  return value;
}
export function formBody(init: RequestInit) {
  assert(typeof init.body === "string" || init.body instanceof URLSearchParams);
  return new URLSearchParams(init.body);
}

export function testSession(did: string): AtprotoSession {
  return {
    did,
    signOut: async () => {},
    fetchHandler: async () => {
      throw Error("No PDS fetch expected in this test");
    },
    getTokenInfo: async () => {
      throw Error("No token lookup expected in this test");
    },
  };
}
