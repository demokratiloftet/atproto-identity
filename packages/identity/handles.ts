import type {
  AccountInput,
  Namespace,
  ProvisionContext,
  Provisioner,
} from "./types.ts";
import { randomBytes } from "node:crypto";

const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const forbidden = new Set([
  "alt",
  "arpa",
  "example",
  "internal",
  "invalid",
  "local",
  "localhost",
  "onion",
]);
const reserved = new Set([
  "admin",
  "www",
  "mail",
  "api",
  "support",
  "root",
  "moderator",
]);
const fail = (message: string) =>
  Object.assign(new Error(message), { status: 400 });

// Domain ownership and DNS/PDS setup are operator responsibilities. This class
// authorizes names; it never interprets an OIDC login as proof of domain control.
export class HandleProvisioner implements Provisioner {
  namespaces: Array<{
    domain: string;
    providers: Set<string>;
    adapter: Provisioner;
  }>;
  constructor({
    namespaces,
    allowTest = false,
  }: {
    namespaces: Namespace[];
    allowTest?: boolean;
  }) {
    const seen = new Set();
    this.namespaces = namespaces.map(({ domain, providers, adapter }) => {
      if (typeof domain !== "string") throw fail("Domain required");
      domain = domain.toLowerCase();
      const labels = domain.split("."),
        tld = labels.at(-1) ?? "";
      if (
        !labels.every((part) => label.test(part)) ||
        !/^[a-z]/.test(tld) ||
        forbidden.has(tld) ||
        (tld === "test" && !allowTest) ||
        (labels.length < 2 && !(allowTest && domain === "test")) ||
        domain.length > 180 ||
        seen.has(domain)
      )
        throw fail("Invalid or duplicate handle domain");
      if (
        !Array.isArray(providers) ||
        !providers.length ||
        providers.some((p) => typeof p !== "string" || !p)
      )
        throw fail("Explicit providers required");
      if (
        typeof adapter?.validate !== "function" ||
        typeof adapter?.create !== "function"
      )
        throw fail("Provisioning adapter required");
      seen.add(domain);
      return { domain, providers: new Set(providers), adapter };
    });
  }
  choices({ provider }: ProvisionContext) {
    return this.namespaces
      .filter((n) => n.providers.has(provider))
      .map((n) => ({ domain: n.domain }));
  }
  namespace(handle: unknown, { provider }: Partial<ProvisionContext> = {}) {
    if (typeof handle !== "string") throw fail("Velg et brukernavn.");
    const normalized = handle.toLowerCase(),
      dot = normalized.indexOf(".");
    const name = normalized.slice(0, dot),
      domain = normalized.slice(dot + 1);
    const ns = this.namespaces.find(
      (n) => n.domain === domain && n.providers.has(provider ?? ""),
    );
    if (
      dot < 1 ||
      !label.test(name) ||
      reserved.has(name) ||
      normalized.length > 244 ||
      !ns
    )
      throw fail(
        "Brukernavnet eller domenet er ikke tillatt for denne innloggingen.",
      );
    return ns;
  }
  suggest({ provider }: ProvisionContext) {
    // No names, email addresses or organisation identifiers in public handles.
    return this.choices({ provider }).map(({ domain }) => ({
      domain,
      handle: `enroll-${randomBytes(5).toString("hex")}.${domain}`,
    }));
  }
  validate(input: unknown, context?: ProvisionContext): void {
    if (
      !input ||
      typeof input !== "object" ||
      !("handle" in input) ||
      typeof input.handle !== "string"
    )
      throw fail("Velg et brukernavn.");
    const ns = this.namespace(input.handle, context);
    ns.adapter.validate({ ...input, handle: input.handle.toLowerCase() });
  }
  async create(input: AccountInput, context?: ProvisionContext) {
    this.validate(input, context);
    const ns = this.namespace(input.handle, context);
    return ns.adapter.create({ ...input, handle: input.handle.toLowerCase() });
  }
}
