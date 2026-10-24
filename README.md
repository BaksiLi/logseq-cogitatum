# Cogitatum for Logseq

This standalone alpha renders explicit `cog` and `cogitatum` code blocks with the shared Cogitatum Reading and Map.
It does not infer structure from ordinary outline blocks.
Logseq owns source editing, input methods, undo and saving; the adapter never writes graph contents.

## Build and install

Requires Node.js 22.12 or newer and the `zip` command.
No sibling checkout or private workspace is needed.

```sh
npm ci
npm run check
npm test
npm exec -- playwright install chromium
npm run package
```

`package` runs source checks, unit tests, a production build and the browser harness.
It creates `dist/cogitatum-logseq-0.1.0-alpha.2.zip` with `index.html`, `main.js`, `package.json`, `cog-plugin-icon.png` and `LICENSE` at its root.
The same five files in `dist/` form a portable unpacked plugin; no development dependencies are needed at runtime.
In Logseq Developer mode, open Plugins, load the unpacked `dist/` directory and reload Cogitatum after replacing its files.
If an existing block still shows an older build, leave and reopen its page to remount it.
These commands do not install or publish the plugin.

The adapter version is `0.1.0-alpha.2`; Core, View and Format remain `0.5.0`.
`package.json` records the full reviewed public source commit and both vendored archive SHA-256 digests.
Checks validate those archives and the installed lockfile integrity, so unchanged package versions cannot silently select a different source build.
Commit before the final production build: the information disclosure shows the public pin and clean adapter revision.
Source archives without their own Git root report `source archive`, including when extracted inside another checkout.
Retain the ZIP digest to identify the exact tested artifact.

CI uses locked installs on Node 22 and 24.
Node 22 runs source checks, tests and production build; Node 24 installs Chromium once and runs the full package command before uploading the ZIP.

## Reading and editing

Reading preserves source order, unmarked body text, local occurrences and literal note subtrees.
It currently presents Markdown wording as plain text; native rich Markdown rendering is not implemented by this adapter.
Map shows compiled relations with Fit, zoom, Arrange, selection and passage navigation.
Selecting an occurrence and pressing Enter, or choosing a diagnostic's Source action, selects its exact span in the native code editor.
Edit reuses that editor beside the preview on wide blocks and above it on narrow blocks.
Source changes update the preview; replaced or destroyed views cancel pending navigation.
The native bridge checks current source and editor identity before selecting or focusing.
Expand moves the same view into a modal; source navigation closes it before native focus.
Map positions and view selections are temporary and are never written to the graph.

The shared Block owns Reading, Map, diagnostics and expansion.
The adapter owns host theme variables, event isolation, lifecycle and native source navigation.

## Mark assets

The approved Cog mark in `assets/cog-mark.svg` is the single local source for the Reading/Map toolbar mark.
`build-metadata.mjs` selects this asset and embeds it as a data URL; `src/mount.ts` passes it to shared Block.
Shared Block renders a decorative, filled mask in the host's current ink, including dark themes and narrow panes.
Keep the SVG's `viewBox` and `fill="currentColor"`; do not turn it into a stroked toolbar glyph or hard-code a colour.
`package.json` selects `assets/cog-plugin-icon.png` through Logseq's `icon` field for the plugin listing.
Build copies that designer-supplied PNG to the portable plugin root and rewrites the packaged icon path; the ZIP includes it too.
Builds read only these local snapshots and need no website checkout, private version script or runtime setting.

To sync newly approved designer exports, set the source directory and copy both files without altering them:

```sh
COG_BRAND_DIR=/path/to/approved/brand
cp "$COG_BRAND_DIR/cog-mark.svg" assets/cog-mark.svg
cp "$COG_BRAND_DIR/cog-plugin-icon.png" assets/cog-plugin-icon.png
npm run package
```

Commit the assets with any integration changes, then run `npm run package` again to identify the clean host revision in the final artifact.

## Compatibility and verification

The desktop compatibility target is Logseq 0.10.15 with Markdown graphs.
Startup probes the host's Experiments APIs and reports unavailable registration methods in the developer console.
Markdown fences use `Experiments.registerFencedCodeRenderer`.
2.x DB code blocks can use `Experiments.registerBlockRenderer` when available, but native parallel editing on DB graphs is unverified.
Both APIs are experimental and may change; Marketplace compatibility and publication remain separate decisions.

The fence renderer supplies text without block identity.
`src/edit.ts` isolates the bridge to the existing fenced-code toggle and CodeMirror instance.
Changed or missing host controls produce an explicit message directing the user to native Edit.
The adapter temporarily enables line wrapping and restores it on preview cleanup, including when the host retains its native editor.
Presses consumed by Reading stay inside it so Logseq does not enter block editing; unrelated host shortcuts remain host-owned.

Unit tests exercise registration, API detection and unload.
The cross-realm browser harness uses real Core/View and the Logseq SDK with a React stand-in for host registration, rendering and native editing.
It covers exact source spans, stale/cancelled navigation, lifecycle cleanup, diagnostics, Map controls, pointer gestures, themes, reduced motion, narrow panes, and production bundle loading.
It is not the running Logseq app and cannot establish native desktop, mobile or DB-graph compatibility.
Set `COGITATUM_SCREENSHOT_DIR` to retain browser screenshots.
Record native checks and exact artifact hashes outside tracked source, such as ignored `artifacts/`, so recording evidence does not change the build identity.

## License

MIT; see `LICENSE`.
The installable directory and ZIP retain the notice used by the adapter and its MIT-licensed Core/View dependencies.
