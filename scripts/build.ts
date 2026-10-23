// Clean emitted files so branch-specific modules cannot leak into an archive.
import { rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const name of ["auth", "identity"]) {
  rmSync(new URL(`../packages/${name}/dist/`, import.meta.url), {
    recursive: true,
    force: true,
  });
  execFileSync("tsc", ["-p", `packages/${name}`], {
    cwd: root,
    stdio: "inherit",
  });
}
