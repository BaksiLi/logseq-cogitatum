# Cogitatum for Logseq

This local alpha shows `cog` and `cogitatum` code blocks as a Cogitatum Reading or Map.
It compiles the block source in the app with `@cogitatum/core` and renders it with `@cogitatum/view`.
It never writes to the graph; the source stays reachable through Logseq's own code-block controls.
It does not infer structure from ordinary outline blocks.

## Project boundary

This standalone local project owns the Logseq adapter, its tests and its installable plugin.
The adapter was extracted from private consumer commit `911ea3b` and consumes packed Core/View from public commit `be5c30e1439253fc83a280b8742cfd3d76edf23f`.
The two archives in `vendor/` retain Core 0.5.0 and the private View snapshot; no sibling source checkout or parent workspace is required.
Every archived file was compared byte-for-byte with that checkout's source and built output (43 Core files, 37 View files).
Their SHA-256 checksums are:

```text
abf55db9e112d175e2b62f1bfd09492c3db4cb711b0685e8abf5a37b76f74fd9  cogitatum-core-0.5.0.tgz
3196f0a29dd92a7fd20ddc3c18f9346e81debb749fc42863548ddc6fccb15847  cogitatum-view-0.5.0.tgz
```

This candidate includes bounded focus on directly related Bearings, measured label hit areas, and respects reduced motion in the shared stylesheet.
The collapsed footer shows the installed Core version.
Open it to inspect Core, View, Logseq plugin, host build revision and the full reviewed source commit.
Build metadata comes from the installed package manifests and this project's manifest; no version is hardcoded in the adapter.
Host build uses this repository's `git describe --always --dirty`, without a timestamp.
It reports `unavailable` when Git metadata cannot be read, so source archives can still build.
Rebuild after committing so the bundle identifies the final adapter commit instead of the preceding dirty revision.
This is a local experiment, not a submitted or published plugin.

## Build and load

From this directory:

```sh
npm ci
npm test
npm run check
npm run build -- --production
npm run test:browser
```

In Logseq, enable Developer mode, open Plugins, choose "Load unpacked plugin", and select `dist/`.
That directory contains its own `package.json`, `index.html` and bundled `main.js`.
It can be copied elsewhere without this source project or `node_modules`.
The root manifest also supports loading the source project directly through `dist/index.html`.
After rebuilding, reload Cogitatum in Logseq's Plugins screen to load the updated bundle.
If an already rendered block still shows the previous interface, navigate away and reopen the page to remount it.

Reading preserves the complete source wording and its local occurrences.
Map shows the compiled relations and supports pan, zoom, Fit and Arrange.
Selecting a mark or its wording shows the full text; Read passage returns to the corresponding Reading occurrence.
Drag a mark or its wording to arrange it, or drag empty space to pan.
Arrange restores the automatic layout, with motion only when the system permits it.
Edit opens the existing native code editor beside the preview when space permits, or above it in narrow blocks.
Enter on a Reading occurrence or Map mark selects its exact source range; repeated actions reuse the same editor.
Logseq owns the source buffer, input methods, saving and undo.
Parallel editing enables native line wrapping for narrow columns and restores the previous setting when the preview is destroyed.
The shared `@cogitatum/view/block` shell owns controls, diagnostics, selection, expansion and responsive preview layout.
The adapter maps host theme tokens, isolates Logseq block events and opens its native editor.
Source replacement and unmount cancel pending navigation; editing from Expand reattaches the preview before focusing the native editor.
The adapter validates the live text before selecting a range and never writes source itself.
Expand opens the same view in a larger modal; Close or Escape restores it to the note.
Dragging gently attracts and repels unheld nodes in the connected component, including across joint Bearings.
Motion stops within 900 ms of the last movement; earlier placements and unrelated fragments stay fixed.
View, selection, zoom and arrangement are temporary and never saved to the graph.

For a future public project, the candidate archives should be replaced by released Core/View dependencies after their contracts are chosen.
View is currently private; publishing the plugin requires an explicit distribution decision for that shared renderer.
Marketplace submission also needs real host evidence, a public repository and license, a release ZIP and a usage screenshot.
The current Experiments API choice still needs review for that purpose.

## Host support

| Host | Block | Mechanism |
| --- | --- | --- |
| 0.10.x | Markdown fence ` ```cog ` | `Experiments.registerFencedCodeRenderer` |
| 2.x | Markdown fence ` ```cog `, where the host renders Markdown fences | `Experiments.registerFencedCodeRenderer` |
| 2.x DB graphs | code block whose language is `cog` or `cogitatum` | `Experiments.registerBlockRenderer` |

Support is probed in the host scope at startup.
A missing API is reported in the developer console instead of being called;
the SDK lowercases and underscores the method name, then drops the call silently when neither host target exists.
Logseq 0.10.15 exports `logseq.api.exper_register_fenced_code_renderer`.
That release does not export a block renderer.

## Limits

- Both renderers are Experiments APIs.
  Logseq marks them as subject to change and possibly unsupported on the Marketplace.
- The bundle uses `@logseq/libs` 0.3.4 (the `next` tag, released for 2.x).
  Basic loading and Reading have been observed in the user's Logseq 0.10.15 installation.
  The installed host allows the iframe four seconds to answer.
- A second Logseq process does not isolate plugins.
  The installed `0.10.15` continued using the user's `~/.logseq` in attempts to override `HOME`.
  `--user-data-dir` isolates only Electron user data; it still scans and checks updates for plugins installed in the user's `~/.logseq`.
  A disposable graph and that flag alone do not establish an isolated test environment.
- The view code runs in the plugin iframe but renders into the host document through the host React.
  It relies on the iframe's `ResizeObserver` and `requestAnimationFrame` working across that boundary.
  Chromium does this in the harness below; Reading has also been observed in the running Logseq app.
- Presses inside the Reading stop propagating (without preventing their default),
  so clicking or selecting text does not enter block editing.
  As a side effect, Logseq's window-level press handlers, such as closing an open context menu, do not see those presses.
  Keys the Reading consumes (arrows, Home, End, Enter, Space, Escape while selected) also stay inside it.
- The fence renderer is registered without `edit`.
  `edit: false` would make the host stop every press on the result, which would disable focus and text selection.
- Fence renderers receive only the source text, not the block identity.
  Parallel editing bridges the installed 0.10.15 host's fenced-code toggle and CodeMirror editor.
  This DOM bridge is isolated in `src/edit.ts`; missing or changed host controls produce an explicit message.
  DB code renderers without that editor still require the host's native Edit action; parallel editing on 2.x DB graphs is unverified.
- DB graphs: the renderer is skipped while editing and in the sidebar, property, and table views, as the host decides.
  Whether the code-language picker accepts a custom `cog` language is unverified;
  imported Markdown keeps the fence language.
- There is no write-back.
  Map layout and glyphs come from the shared View package; this adapter only supplies the frame and controls.

## Verification

`src/register.test.ts` checks registration, feature detection, and unload against a fake API.
`tests/host.browser.mjs` runs the adapter in a plugin iframe through the real `@logseq/libs` Experiments dispatch,
against a host page that fakes the renderer contracts with React 19.
It reproduces Logseq's global `svg { pointer-events: none }` rule and checks real pointer selection,
CJK wording hit areas, node dragging versus camera panning, and frame-by-frame Arrange behavior under both motion preferences.
It also covers native editor reuse and source-to-Map updates, stale source identities, source changes during a captured drag, local-use selection, Map controls, native modal focus/cleanup,
diagnostics after edits, bounded visibility of objections to a selected Point's steps,
preview-only unmount with a retained native wrapper/editor (including while expanded),
both motion preferences, the host's overlapping source controls, CJK labels, theme variables and a 360px viewport.
It also checks the version footer against build metadata, native disclosure open/close, and narrow-screen overflow.
Set `COGITATUM_SCREENSHOT_DIR` when running it to retain visual checks.
Neither is a running Logseq app.
The final right-alignment and information-icon changes use public commit `be5c30e1439253fc83a280b8742cfd3d76edf23f` and were rebuilt without another native test round.
The native evidence below belongs to the earlier bundles identified by their hashes.
The following native results were reported from Logseq `0.10.15`, with Core/View pinned to
public commit `3a8052bb5ae81b5c12ef346a0bf26ae2130dce95`.
The integration bundle whose `dist/main.js` SHA-256 is
`628a7bdf686122c1ad6eda8fcb4239ef58e797107c81036d2ec2cdd252eb0c8d`
passed plugin reload, Enter selecting the exact Ground passage at line 4, native typing updating the preview,
and Map selection followed by Expand and Edit preserving the exact native selection.
Additional native checks with `use`, emoji and U+2028 preserved the exact local occurrence;
Bearing selection followed by Map, Expand and Edit also passed.
After native fixture restoration, `cmp` confirmed the fixture was byte-for-byte identical to its baseline.
Cmd+Z restored the source byte-for-byte but navigated to Journals; smooth undo navigation is not claimed.

The final cleanup bundle whose `dist/main.js` SHA-256 is
`7da403cd92f1e0a81e2eac2c2317809643debf706bd7cc5abbe1f0cdf5cd9273`
passed native reload, leaving and returning to `note/cogitatum-showcase` to remount the preview,
Enter selecting the exact native passage at line 4, and Map expansion.
The final Expanded Edit step was interrupted by user interaction and was not completed;
the earlier bundle's passing result does not establish that step for the final bundle.
The specific cleanup order in which React removes only the preview while retaining the host wrapper and editor
is covered by the browser harness, including while expanded; that order has not been verified in the native app.

Earlier native observations follow.
The `note/cogitatum-showcase` page was observed rendering a conclusion, a linked step and two grounds in Reading and Map.
Native checks cover Reading/Map switching, Chinese wording selection and dragging,
connected-node response, background panning, Arrange, Fit, expansion and Escape return.
Edit alongside, exact source-range navigation and live source-to-Map updates were also checked.
The source was restored byte-for-byte after the edit test.
Dark theme, reduced motion and narrow viewport checks use the browser harness;
the macOS motion preference was not changed for the real-host check.
This is not comprehensive host compatibility.

## Sources

- Mermaid references: [Fenced Code Plus renderer](https://github.com/xyhp915/logseq-fenced-code-plus/blob/main/src/mermaid.tsx)
  and [Diagram Blocks](https://github.com/nanodeath/logseq-diagram-blocks) for embedded diagrams, expansion and zoom controls.
- SDK: [`@logseq/libs`](https://www.npmjs.com/package/@logseq/libs) 0.3.4,
  [`LSPlugin.Experiments.ts`](https://github.com/logseq/logseq/blob/2.0.2/libs/src/modules/LSPlugin.Experiments.ts),
  [Experiments guide](https://github.com/logseq/logseq/blob/2.0.2/libs/guides/experiments_api_guide.md).
- 2.0.2 host:
  [SDK experiments](https://github.com/logseq/logseq/blob/2.0.2/src/main/logseq/sdk/experiments.cljs#L17),
  [fence hook](https://github.com/logseq/logseq/blob/2.0.2/src/main/frontend/components/block.cljs#L4976),
  [block renderer props](https://github.com/logseq/logseq/blob/2.0.2/src/main/frontend/components/block.cljs#L3997),
  [property serialization](https://github.com/logseq/logseq/blob/2.0.2/src/main/frontend/handler/plugin.cljs#L780),
  [fenced result and `edit`](https://github.com/logseq/logseq/blob/2.0.2/src/main/frontend/components/plugins.cljs#L1557),
  [theme variables](https://github.com/logseq/logseq/blob/2.0.2/src/main/frontend/shui/vars-classic.css).
- 0.10.15 host:
  [API](https://github.com/logseq/logseq/blob/0.10.15/src/main/logseq/api.cljs#L936),
  [registration](https://github.com/logseq/logseq/blob/0.10.15/src/main/frontend/handler/plugin.cljs#L391),
  [fence hook](https://github.com/logseq/logseq/blob/0.10.15/src/main/frontend/components/block.cljs#L3346),
  [fenced result and `edit`](https://github.com/logseq/logseq/blob/0.10.15/src/main/frontend/components/plugins.cljs#L1145),
  [theme variables](https://github.com/logseq/logseq/blob/0.10.15/packages/ui/src/vars-classic.css).
