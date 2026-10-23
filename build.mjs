import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { buildDefine, manifest } from "./build-metadata.mjs";

// Logseq loads package.json's top-level `main` (an HTML page) in a plugin iframe; styles are injected into the host
// with provideStyle, so the bundle carries the view CSS as text instead of shipping a stylesheet.
if (manifest.main !== "dist/index.html" || manifest.logseq?.main) throw new Error("Logseq requires the top-level main entry to point to dist/index.html.");
mkdirSync("dist", { recursive: true });
copyFileSync("index.html", "dist/index.html");
await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  loader: { ".css": "text" },
  define: buildDefine,
  sourcemap: false,
  logLevel: "info",
  minify: process.argv.includes("--production")
});
// The installable plugin has no development dependencies or paths outside its directory.
const { name, version, description, license, logseq } = manifest;
writeFileSync("dist/package.json", JSON.stringify({ name, version, description, license, main: "index.html", logseq }, null, 2) + "\n");
copyFileSync("LICENSE", "dist/LICENSE");
if (process.argv.includes("--zip")) {
  const path = `dist/${name.replace(/^@/, "").replace("/", "-")}-${version}.zip`;
  const root = fileURLToPath(new URL("./", import.meta.url));
  const output = join(root, path);
  const stage = mkdtempSync(join(tmpdir(), "cogitatum-logseq-release-"));
  try {
    const timestamp = new Date("1980-01-01T00:00:00Z");
    for (const file of ["index.html", "main.js", "package.json", "LICENSE"]) {
      copyFileSync(`dist/${file}`, join(stage, file));
      utimesSync(join(stage, file), timestamp, timestamp);
    }
    rmSync(output, { force: true });
    execFileSync("zip", ["-q", "-X", output, "index.html", "main.js", "package.json", "LICENSE"], {
      cwd: stage, env: { ...process.env, TZ: "UTC" }
    });
    process.stdout.write(`Built release ZIP in ${path}.\n`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
process.stdout.write("Built a self-contained Logseq plugin in dist/.\n");
