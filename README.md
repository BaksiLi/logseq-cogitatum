# Cogitatum for Logseq

This local alpha shows `cog` and `cogitatum` code blocks as a Cogitatum Reading or Map.
It compiles the block source in the app with `@cogitatum/core` and renders it with `@cogitatum/view`.
It never writes to the graph; the source stays reachable through Logseq's own code-block controls.
It does not infer structure from ordinary outline blocks.

## Project boundary

This standalone local project owns the Logseq adapter, its tests and its installable plugin.
The adapter was extracted from private consumer commit `911ea3b` and consumes packed Core/View from public commit `5ed2581740782b38a5cc380f8260f736f09c60b7`.
The two archives in `vendor/` retain the unpublished 0.5.0 candidate; no sibling source checkout or parent workspace is required.
Their SHA-256 checksums are:

```text
6615a2d879e18b72ce3b8f6e3105b98908c45067b13dd510492043df49f2b215  cogitatum-core-0.5.0.tgz
81eb15b6d752d868048c6f99ee50ca9711208219851b53c067591b0bc6e64acc  cogitatum-view-0.5.0.tgz
```

This candidate includes bounded focus on directly related Bearings, measured label hit areas, and respects reduced motion in the shared stylesheet.
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
If an already rendered block still shows the previous interface, toggle its native code display to remount it.

Reading preserves the complete source wording and its local occurrences.
Map shows the compiled relations and supports pan, zoom, Fit and Arrange.
Selecting a mark or its wording shows the full text; Read passage returns to the corresponding Reading occurrence.
Drag a mark or its wording to arrange it, or drag empty space to pan.
Arrange restores the automatic layout, with motion only when the system permits it.
Source displays the exact block text, read only; editing remains with Logseq's code-block controls.
Expand opens the same view in a larger modal; Close or Escape restores it to the note.
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
  Reading's Enter selects the passage; Map's Enter returns to that passage in Reading.
  Source displays the exact text read only; editing uses the host's code toggle or edit button on the block.
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
It also covers source-preserving view switches, local-use selection, Map controls, native modal focus/cleanup,
diagnostics after edits, bounded visibility of objections to a selected Point's steps,
both motion preferences, the host's overlapping source controls, CJK labels, theme variables and a 360px viewport.
Set `COGITATUM_SCREENSHOT_DIR` when running it to retain visual checks.
Neither is a running Logseq app.
The user loaded the unpacked plugin into Logseq `0.10.15`.
The `note/cogitatum-showcase` page was observed rendering a conclusion, a linked step and two grounds in Reading and Map.
View switching, keyboard mark selection with full wording, Read passage focus, Map Fit, read-only Source, expansion and Escape return
were checked in that running app without editing the block source.
After restoring Map pointer events, coordinate-based clicks on Chinese wording, node dragging,
background panning and Arrange restoration were also checked in that app.
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
