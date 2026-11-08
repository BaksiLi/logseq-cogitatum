import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FORMAT_VERSION } from "@cogitatum/core";
import { verifyPin } from "./pin.mjs";

const root = new URL("./", import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));
export const manifest = json("package.json");
if (manifest.name !== "@cogitatum/logseq" || manifest.logseq?.id !== "cogitatum" || manifest.main !== "dist/index.html" || manifest.logseq?.main) {
  throw new Error("Keep the standalone Logseq plugin identity and top-level HTML entry consistent.");
}
const { packages } = verifyPin();

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
export const logo = "data:image/svg+xml," + encodeURIComponent(readFileSync(new URL("assets/cog-mark.svg", root), "utf8"));
export const versionDefine = { __COGITATUM_VERSION__: JSON.stringify(version) };
export const buildDefine = { ...versionDefine, __COGITATUM_LOGO__: JSON.stringify(logo) };
