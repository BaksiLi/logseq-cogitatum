# Cogitatum for Logseq

This local alpha shows `cog` and `cogitatum` code blocks as a Cogitatum Reading.
It compiles the block source in the app with `@cogitatum/core` and renders it with `@cogitatum/view`.
It never writes to the graph; the source stays reachable through Logseq's own code-block controls.
It does not infer structure from ordinary outline blocks.

## Project boundary

This standalone local project owns the Logseq adapter, its tests and its installable plugin.
The adapter was extracted from private consumer commit `911ea3b` and consumes packed Core/View from public commit `5249594080fb00782d160ccf7ee0de3074174777`.
The two archives in `vendor/` retain the unpublished 0.5.0 candidate; no sibling source checkout or parent workspace is required.
This is a local experiment, not a submitted or published plugin.

## Build and load

From this directory:

```sh
npm ci
npm test
npm run check
npm run build -- --production
```

In Logseq, enable Developer mode, open Plugins, choose "Load unpacked plugin", and select `dist/`.
That directory contains its own `package.json`, `index.html` and bundled `main.js`.
It can be copied elsewhere without this source project or `node_modules`.
The root manifest also supports loading the source project directly through `dist/index.html`.
No real Logseq installation has been tested yet.

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
the SDK would otherwise drop the call silently.

## Limits

- Both renderers are Experiments APIs.
  Logseq marks them as subject to change and possibly unsupported on the Marketplace.
- The bundle uses `@logseq/libs` 0.3.4 (the `next` tag, released for 2.x).
  Its startup handshake with a 0.10.x host has not been checked.
- The view code runs in the plugin iframe but renders into the host document through the host React.
  It relies on the iframe's `ResizeObserver` and `requestAnimationFrame` working across that boundary.
  Chromium does this in the harness below; it has not been observed in a running Logseq app.
- Presses inside the Reading stop propagating (without preventing their default),
  so clicking or selecting text does not enter block editing.
  As a side effect, Logseq's window-level press handlers, such as closing an open context menu, do not see those presses.
  Keys the Reading consumes (arrows, Home, End, Enter, Space, Escape while selected) also stay inside it.
- The fence renderer is registered without `edit`.
  `edit: false` would make the host stop every press on the result, which would disable focus and text selection.
- Fence renderers receive only the source text, not the block identity.
  Enter selects the passage; opening its source uses the host's code toggle or edit button on the block.
- DB graphs: the renderer is skipped while editing and in the sidebar, property, and table views, as the host decides.
  Whether the code-language picker accepts a custom `cog` language is unverified;
  imported Markdown keeps the fence language.
- There is no Map view and no write-back.

## Verification

`src/register.test.ts` checks registration, feature detection, and unload against a fake API.
`tests/host.browser.mjs` runs the adapter in a plugin iframe through the real `@logseq/libs` Experiments dispatch,
against a host page that fakes the renderer contracts with React 19.
Neither is a running Logseq app.

## Sources

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
