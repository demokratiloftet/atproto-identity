import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
for (const name of ["auth", "identity"]) {
  execFileSync(
    "pnpm",
    [
      "--filter",
      `@loftet/${name}`,
      "pack",
      "--pack-destination",
      root + "dist",
    ],
    { cwd: root, stdio: "inherit" },
  );
}
