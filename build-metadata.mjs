import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
export const manifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
// Package exports omit package.json; resolve the installed dist entry to find its manifest.
const installed = name => JSON.parse(readFileSync(join(dirname(require.resolve(name)), "../package.json"), "utf8"));
const core = installed("@cogitatum/core"), view = installed("@cogitatum/view");
let hostRevision = "unavailable";
try {
  hostRevision = execFileSync("git", ["describe", "--always", "--dirty"], {
    cwd: new URL(".", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
  }).trim();
} catch { /* Source archives may not contain Git metadata. */ }
export const version = {
  label: `Core ${core.version}`,
  detail: `Core ${core.version}\nView ${view.version}\nLogseq plugin ${manifest.version}\nHost build ${hostRevision}\nSource ${manifest.cogitatumSource.ref}`
};
export const versionDefine = { __COGITATUM_VERSION__: JSON.stringify(version) };
