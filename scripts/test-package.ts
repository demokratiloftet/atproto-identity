// Install outside this workspace: catches accidental source-tree dependencies.
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync("pnpm", ["run", "build"], { cwd: root, stdio: "inherit" });
for (const [name, files] of [
  ["auth", ["vipps.js"]],
  ["identity", ["managed-pds.js", "sandbox-pds.js"]],
] as const) {
  for (const file of files) {
    if (existsSync(join(root, "packages", name, "dist", file)))
      throw new Error(
        `Instance-only module leaked into generic build: ${file}`,
      );
  }
}
execFileSync(process.execPath, ["scripts/pack.ts"], {
  cwd: root,
  stdio: "inherit",
});
const consumer = mkdtempSync(join(tmpdir(), "identity-consumer-"));
try {
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  const packages = ["auth", "identity"].map((name) => {
    const { version } = JSON.parse(
      readFileSync(join(root, "packages", name, "package.json"), "utf8"),
    );
    return join(root, "dist", `loftet-${name}-${version}.tgz`);
  });
  execFileSync(
    "pnpm",
    [
      "add",
      "--ignore-scripts",
      ...packages,
      "typescript@7.0.2",
      "@types/node@24.19.1",
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  writeFileSync(
    join(consumer, "consumer.ts"),
    `
import { AuthStore } from '@loftet/auth/store';
import { createAtprotoProvider, atprotoClientMetadata, createPdsHandleResolver, type AtprotoProviderOptions } from '@loftet/auth/atproto';
import { AuthService } from '@loftet/auth/session';
import { OidcProvider } from '@loftet/auth/oidc';
import { publicFetch, restrictedFetch } from '@loftet/auth/transport';
import { IdentityGateway as GatewayBlock } from '@loftet/identity/gateway';
import { HandleProvisioner as HandleBlock } from '@loftet/identity/handles';
import { IdentityGateway, HandleProvisioner } from '@loftet/identity';
const store = new AuthStore('./private-test-data');
const options: AtprotoProviderOptions = {origin:'https://app.invalid',store};
const atproto = createAtprotoProvider(options);
const metadata = atprotoClientMetadata({origin: options.origin});
const resolver = createPdsHandleResolver('https://pds.invalid', restrictedFetch({}));
// @ts-expect-error Public declarations must reject non-string scopes.
createAtprotoProvider({...options, scope: 42});
void AuthService; void OidcProvider; void publicFetch; void GatewayBlock; void HandleBlock; void metadata; void resolver;
const gateway = new IdentityGateway({store,atproto,origin:'https://app.invalid'});
const session = await gateway.oauthSession({headers:{}});
const response: Response = await session.fetchHandler('/xrpc/example');
const provisioner = new HandleProvisioner({allowTest:true,namespaces:[{domain:'test',providers:['demo'],adapter:{validate() {}, async create({handle}) {return {did:'did:web:account.example',handle}}}}]});
const choices: Array<{domain:string}> = provisioner.choices({provider:'demo'});
// @ts-expect-error Public declarations must reject invalid provider context.
provisioner.choices({provider:42});
// @ts-expect-error Known storage namespaces must enforce their value schema.
store.set('epoch','did:plc:synthetic',{value:42});
void response; void choices;
`,
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2023",
        module: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["consumer.ts"],
    }),
  );
  execFileSync(
    process.execPath,
    ["node_modules/typescript/bin/tsc", "--project", "tsconfig.json"],
    { cwd: consumer, stdio: "inherit" },
  );
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import {AuthStore, AuthService, OidcProvider, createAtprotoProvider, restrictedFetch} from '@loftet/auth';
    import {IdentityGateway, HandleProvisioner} from '@loftet/identity';
    import * as at from '@loftet/auth/atproto';
    import * as sessions from '@loftet/auth/session';
    import * as storage from '@loftet/auth/store';
    import * as oidc from '@loftet/auth/oidc';
    import * as transport from '@loftet/auth/transport';
    import * as gateway from '@loftet/identity/gateway';
    import * as domains from '@loftet/identity/handles';
    for (const block of [at.createAtprotoProvider, at.atprotoClientMetadata, at.createPdsHandleResolver, sessions.AuthService, storage.AuthStore, oidc.OidcProvider, transport.publicFetch, transport.restrictedFetch, gateway.IdentityGateway, domains.HandleProvisioner]) assert.equal(typeof block,'function');
    const store = new storage.AuthStore('./private-test-data');
    const provider = at.createAtprotoProvider({origin:'https://app.invalid',store});
    assert.equal(provider.metadata.scope,'atproto');
    assert.equal(provider.metadata.client_id,'https://app.invalid/auth/client-metadata.json');
    store.close();
    for (const value of [AuthStore,AuthService,OidcProvider,createAtprotoProvider,restrictedFetch,IdentityGateway,HandleProvisioner]) assert.equal(typeof value,'function');
    const handles=new HandleProvisioner({allowTest:true,namespaces:[{domain:'test',providers:['demo'],adapter:{validate() {}, async create({handle}) {return {did:'did:web:account.example',handle}}}}]});
    assert.equal(handles.choices({provider:'demo'})[0].domain,'test');
    for (const name of ['@loftet/identity/sandbox','@loftet/identity/managed']) {
      await assert.rejects(import(name), {code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
    }
    console.log('PASS independent consumer imports generic blocks; instance-only exports are absent');
  `,
    ],
    { cwd: consumer, stdio: "inherit" },
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
