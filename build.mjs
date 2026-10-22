import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { manifest, versionDefine } from "./build-metadata.mjs";

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
  define: versionDefine,
  sourcemap: false,
  logLevel: "info",
  minify: process.argv.includes("--production")
});
// The installable plugin has no development dependencies or paths outside its directory.
const { name, version, description, logseq } = manifest;
writeFileSync("dist/package.json", JSON.stringify({ name, version, description, main: "index.html", logseq }, null, 2) + "\n");
process.stdout.write("Built a self-contained Logseq plugin in dist/.\n");
