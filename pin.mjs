// Verifies a Cogitatum host's pin on Core and View; `node pin.mjs` checks the host containing it.
// The public repository's scripts/vendor-hosts.mjs writes the pin and copies this file into each host as pin.mjs,
// so every host checks the same contract without a checkout of the public source.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Returns the host manifest and installed Core/View manifests, or throws naming the broken link of the pin. */
export function verifyPin(root = new URL("./", import.meta.url)) {
  const json = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));
  const manifest = json("package.json");
  if (!/^[a-f0-9]{40}$/.test(manifest.cogitatumSource?.ref ?? "")) {
    throw new Error("Pin the full public Core/View source commit in cogitatumSource.ref.");
  }
  const require = createRequire(new URL("package.json", root));
  const packages = {};
  for (const name of ["core", "view"]) {
    const dependency = manifest.dependencies?.[`@cogitatum/${name}`];
    if (!/^file:vendor\/[^/]+\.tgz$/.test(dependency ?? "")) throw new Error(`@cogitatum/${name} must use a portable vendor tarball.`);
    const archive = readFileSync(new URL(dependency.slice(5), root));
    if (manifest.cogitatumSource.sha256?.[name] !== createHash("sha256").update(archive).digest("hex")) {
      throw new Error(`@cogitatum/${name} tarball does not match its pinned SHA-256.`);
    }
    packages[name] = JSON.parse(readFileSync(join(dirname(require.resolve(`@cogitatum/${name}`)), "../package.json"), "utf8"));
    if (dependency !== `file:vendor/cogitatum-${name}-${packages[name].version}.tgz`) {
      throw new Error(`Installed @cogitatum/${name} differs from its pinned tarball; run npm ci.`);
    }
    const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
    for (const lock of ["package-lock.json", "node_modules/.package-lock.json"]) {
      if (json(lock).packages?.[`node_modules/@cogitatum/${name}`]?.integrity !== integrity) {
        throw new Error(`${lock} does not match the pinned @cogitatum/${name} tarball; run npm ci.`);
      }
    }
  }
  return { manifest, packages };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { manifest, packages } = verifyPin();
  process.stdout.write(`Core ${packages.core.version} and View ${packages.view.version} match ${manifest.cogitatumSource.ref}.\n`);
}
