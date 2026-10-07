// Install outside this workspace: catches accidental source-tree dependencies.
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
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
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...packages,
      "typescript@7.0.2",
      "@types/node@24.19.1",
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  writeFileSync(
    join(consumer, "consumer.ts"),
    `
import { AuthStore, createAtprotoProvider } from '@loftet/auth';
import { IdentityGateway, HandleProvisioner } from '@loftet/identity';
import { sandboxPdsProvisioner } from '@loftet/identity/sandbox';
const store = new AuthStore('./private-test-data');
const atproto = createAtprotoProvider({origin:'https://app.invalid',store,fetch,plcUrl:'https://plc.invalid',pdsOrigin:'https://pds.invalid'});
const gateway = new IdentityGateway({store,atproto,origin:'https://app.invalid'});
const session = await gateway.oauthSession({headers:{}});
const response: Response = await session.fetchHandler('/xrpc/example');
const provisioner = new HandleProvisioner({allowTest:true,namespaces:[{domain:'test',providers:['demo'],adapter:sandboxPdsProvisioner()}]});
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
    import {sandboxPdsProvisioner} from '@loftet/identity/sandbox';
    for (const value of [AuthStore,AuthService,OidcProvider,createAtprotoProvider,restrictedFetch,IdentityGateway,HandleProvisioner]) assert.equal(typeof value,'function');
    const handles=new HandleProvisioner({allowTest:true,namespaces:[{domain:'test',providers:['demo'],adapter:sandboxPdsProvisioner()}]});
    assert.equal(handles.choices({provider:'demo'})[0].domain,'test');
    console.log('PASS independent consumer imports packed packages without calendar or workspace source');
  `,
    ],
    { cwd: consumer, stdio: "inherit" },
  );
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
