import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const pkgPath = join(import.meta.dirname!, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

const [major, minor, patch] = pkg.version.split(".").map(Number);
pkg.version = `${major}.${minor}.${patch + 1}`;

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const run = (cmd: string) => execSync(cmd, { stdio: "inherit", cwd: join(import.meta.dirname!, "..") });

run(`git add package.json`);
run(`git commit -m "v${pkg.version}"`);
run(`git tag v${pkg.version}`);
run(`npm publish`);

console.log(`Published v${pkg.version}`);
