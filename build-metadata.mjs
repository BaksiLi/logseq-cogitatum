import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FORMAT_VERSION } from "@cogitatum/core";

const root = new URL("./", import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));
export const manifest = json("package.json");
if (manifest.name !== "@cogitatum/logseq" || manifest.logseq?.id !== "cogitatum" || manifest.main !== "dist/index.html" || manifest.logseq?.main) {
  throw new Error("Keep the standalone Logseq plugin identity and top-level HTML entry consistent.");
}
if (!/^[a-f0-9]{40}$/.test(manifest.cogitatumSource?.ref ?? "")) {
  throw new Error("Pin the full public Core/View source commit in cogitatumSource.ref.");
}
const require = createRequire(import.meta.url);
const installed = name => JSON.parse(readFileSync(join(dirname(require.resolve(name)), "../package.json"), "utf8"));
const packages = {};
for (const name of ["core", "view"]) {
  const dependency = manifest.dependencies[`@cogitatum/${name}`];
  if (!/^file:vendor\/[^/]+\.tgz$/.test(dependency ?? "")) throw new Error(`@cogitatum/${name} needs a portable vendor archive.`);
  const archive = readFileSync(new URL(dependency.slice(5), root));
  if (manifest.cogitatumSource.sha256?.[name] !== createHash("sha256").update(archive).digest("hex")) {
    throw new Error(`@cogitatum/${name} archive differs from its pinned SHA-256.`);
  }
  packages[name] = installed(`@cogitatum/${name}`);
  if (dependency !== `file:vendor/cogitatum-${name}-${packages[name].version}.tgz`) throw new Error("Installed package version differs from the pinned archive; run npm ci.");
  const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
  for (const path of ["package-lock.json", "node_modules/.package-lock.json"]) {
    if (json(path).packages?.[`node_modules/@cogitatum/${name}`]?.integrity !== integrity) throw new Error(`${path} differs from the pinned archive; run npm ci.`);
  }
}
let revision = "source archive";
try {
  const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  // An archive extracted inside another checkout must not borrow its revision.
  if (top === fileURLToPath(root).replace(/\/$/, "")) {
    revision = execFileSync("git", ["describe", "--always", "--dirty"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  }
} catch { /* Source archives need no Git checkout to build. */ }
export const version = {
  label: `Core ${packages.core.version}`,
  detail: `Core ${packages.core.version}\nView ${packages.view.version}\nFormat ${FORMAT_VERSION}\nLogseq plugin ${manifest.version}\nPublic source ${manifest.cogitatumSource.ref}\nHost build ${revision}`
};
const logo = "data:image/svg+xml," + encodeURIComponent(readFileSync(new URL("assets/cogitatum.svg", root), "utf8"));
export const versionDefine = { __COGITATUM_VERSION__: JSON.stringify(version) };
export const buildDefine = { ...versionDefine, __COGITATUM_LOGO__: JSON.stringify(logo) };
