// Cross-realm harness: the adapter runs in a plugin iframe through the real @logseq/libs Experiments
// dispatch, while a host page owns React 19 and the DOM, as in Logseq. The host side is a fake of the
// documented renderer contracts; it is not a running Logseq app.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const here = fileURLToPath(new URL("..", import.meta.url));
const bundle = async contents => (await build({
  stdin: { contents, resolveDir: here, loader: "ts" }, bundle: true, write: false, format: "iife",
  platform: "browser", loader: { ".css": "text" }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent"
})).outputFiles[0].text;

const host = await bundle(`
import * as React from "react"; import { flushSync } from "react-dom"; import { createRoot } from "react-dom/client";
window.React = React;
const fenced = new Map(), blocks = new Map(), log = window.hostLog = { blockPresses: 0, keys: [], unregistered: 0, registrations: [] };
// 2.x shape: Experiments resolve through logseq.sdk.experiments; the host reads opts fields by name.
window.logseq = { api: {}, sdk: { experiments: {
  register_fenced_code_renderer(pid, lang, opts) { log.registrations.push({ pid, lang, keys: Object.keys(opts) }); fenced.set(lang, opts); return () => log.unregistered++; },
  register_block_renderer(pid, key, opts) { log.registrations.push({ pid, key, keys: Object.keys(opts) }); blocks.set(key, opts); return () => log.unregistered++; }
} } };
document.addEventListener("keydown", event => log.keys.push(event.key));
let root;
window.nativeEditorLog = { toggles: 0, selections: [] };
function HostFence({ opts, content }) {
  const [value, setValue] = React.useState(content), [active, setActive] = React.useState(false);
  React.useEffect(() => setValue(content), [content]);
  const input = React.useRef(null);
  return React.createElement("div", { className: "ui-fenced-code-wrap" + (active ? " is-active" : "") },
    React.createElement("div", { className: "ui-fenced-code-editor" }, React.createElement("div", { className: "CodeMirror", ref: node => {
      if (node) node.CodeMirror = { getValue: () => input.current.value, refresh() {}, focus: () => input.current.focus(),
        setSelection: (from, to) => window.nativeEditorLog.selections.push({ from, to }) };
    } }, React.createElement("textarea", { ref: input, "aria-label": "Native source", value, onChange: event => setValue(event.target.value) }))),
    React.createElement("div", { className: "ui-fenced-code-result", onMouseDown: event => { if (opts.edit === false) { event.preventDefault(); event.stopPropagation(); } } },
      React.createElement("span", { className: "actions" },
        React.createElement("button", { title: "Host source", onClick: () => { window.nativeEditorLog.toggles++; setActive(!active); } }, "<>"),
        React.createElement("button", { title: "Host edit" }, "E")), React.createElement(opts.render, { content: value })));
}
window.hostMount = () => {
  const block = document.createElement("div"); block.className = "block-content";
  // Stand-in for Logseq's block-content press handler, which enters editing mode.
  for (const type of ["pointerdown", "mousedown"]) block.addEventListener(type, () => log.blockPresses++);
  document.querySelector("#graph").replaceChildren(block); root = createRoot(block);
};
window.hostRender = (kind, props) => flushSync(() => {
  if (kind === "fenced") {
    const opts = fenced.get(props.lang);
    root.render(React.createElement(HostFence, { opts, content: props.content }));
  } else root.render(React.createElement(blocks.get("cogitatum-code").render, props));
});
window.hostMatches = props => blocks.get("cogitatum-code").when(props);
window.hostUnmount = () => flushSync(() => root.unmount());
const frame = document.createElement("iframe"); frame.src = "/plugin.html"; frame.hidden = true; document.body.append(frame);
`);
const plugin = await bundle(`
import "@logseq/libs";
import viewStyle from "@cogitatum/view/style.css";
import logseqStyle from "./src/logseq.css";
import { registerCogitatum } from "./src/register.ts";
// ready() would fill baseInfo after the host handshake; the Experiments dispatch below is the real SDK's.
logseq.baseInfo.id = "cogitatum";
let unload;
const api = {
  Experiments: logseq.Experiments,
  provideStyle({ key, style }) { const element = top.document.createElement("style"); element.dataset.key = key; element.textContent = style; top.document.head.append(element); },
  beforeunload(callback) { unload = callback; }
};
top.pluginStatus = registerCogitatum(api, viewStyle + "\\n" + logseqStyle);
top.pluginUnload = () => unload();
`);

const files = {
  "/host.html": ["text/html", `<!doctype html><style>:root{--ls-primary-text-color:rgb(1, 2, 3)} body{margin:16px;font:15px/1.5 sans-serif} svg{pointer-events:none} #graph{width:800px;max-width:100%} .ui-fenced-code-wrap:not(.is-active) .ui-fenced-code-editor{display:none!important} .ui-fenced-code-result{position:relative} textarea{width:100%;min-height:200px} .actions{position:absolute;top:8px;right:4px;z-index:2;display:flex} .actions button{box-sizing:border-box;width:28px;height:28px}</style><div id="graph"></div><script src="/host.js"></script>`],
  "/host.js": ["text/javascript", host],
  "/plugin.html": ["text/html", `<!doctype html><script src="/plugin.js"></script>`],
  "/plugin.js": ["text/javascript", plugin],
  "/dist/index.html": ["text/html", readFileSync(new URL("../dist/index.html", import.meta.url), "utf8")],
  "/dist/main.js": ["text/javascript", readFileSync(new URL("../dist/main.js", import.meta.url), "utf8")]
};
const reading = readFileSync(new URL("./fixtures/api-timeout.cog.md", import.meta.url), "utf8");
const linked = readFileSync(new URL("./fixtures/linked.cog.md", import.meta.url), "utf8");
const broken = "- [C] Fine.\n- [Z] Broken mark.\n- [. use @nowhere] Dangling.\n";
const screenshotDir = process.env.COGITATUM_SCREENSHOT_DIR;
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.on("pageerror", error => { errors.push(error.message); process.stderr.write(`Browser error: ${error.message}\n`); });
  await page.route("http://logseq.test/**", route => {
    const file = files[new URL(route.request().url()).pathname];
    return file ? route.fulfill({ contentType: `${file[0]}; charset=utf-8`, body: file[1] }) : route.fulfill({ status: 404 });
  });
  await page.goto("http://logseq.test/host.html");
  await page.waitForFunction(() => window.pluginStatus);
  const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  // Registration through the real SDK dispatch.
  assert.deepEqual(await page.evaluate(() => window.pluginStatus), { fencedLanguages: ["cog", "cogitatum"], blockRenderer: true, unsupported: [] });
  assert.deepEqual(await page.evaluate(() => window.hostLog.registrations), [
    { pid: "cogitatum", lang: "cog", keys: ["render"] },
    { pid: "cogitatum", lang: "cogitatum", keys: ["render"] },
    { pid: "cogitatum", key: "cogitatum-code", keys: ["when", "render"] }
  ]);
  assert.equal(await page.locator('style[data-key="cogitatum-reading"]').count(), 1);

  // Fenced block: plugin-realm view code renders into the host document and follows the host theme.
  await page.evaluate(([content]) => { window.hostMount(); window.hostRender("fenced", { lang: "cog", content }); }, [reading]);
  const rows = page.locator(".cog-logseq .cog-reading-row[data-occurrence]");
  await rows.first().waitFor();
  const rowCount = await rows.count();
  assert.ok(rowCount >= 10, `expected occurrence rows, got ${rowCount}`);
  assert.equal(await rows.first().evaluate(element => getComputedStyle(element).animationName), "cog-reading-enter");
  assert.equal(await page.locator(".cog-reading").evaluate(element => getComputedStyle(element).getPropertyValue("--cog-ink-resolved").trim()), "rgb(1, 2, 3)");
  await frames();
  assert.equal(await page.locator(".cog-reading").getAttribute("data-compact"), "false");
  // The view's ResizeObserver comes from the plugin realm but observes a host element.
  await page.evaluate(() => { document.querySelector("#graph").style.width = "480px"; });
  await frames(); await frames();
  assert.equal(await page.locator(".cog-reading").getAttribute("data-compact"), "true", "cross-realm resize did not repaint");

  // A press selects and focuses a row, keeps its default action, and never reaches the block editor.
  await page.evaluate(() => document.addEventListener("pointerdown", event => { window.press = event; }, { capture: true, once: true }));
  const second = rows.nth(1);
  await second.click();
  assert.equal(await second.getAttribute("aria-pressed"), "true");
  assert.equal(await second.evaluate(element => document.activeElement === element), true);
  assert.equal(await page.evaluate(() => window.hostLog.blockPresses), 0);
  // Read after dispatch has finished, so every listener in the path has had its chance to prevent it.
  assert.equal(await page.evaluate(() => window.press.defaultPrevented), false);
  // Text inside the view stays selectable.
  const text = second.locator(".cog-reading-text");
  const box = await text.boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2); await page.mouse.up();
  assert.ok((await page.evaluate(() => getSelection().toString())).length > 5, "text selection was blocked");
  await page.evaluate(() => getSelection().removeAllRanges());

  // Keys the view consumes stay inside it; other keys still reach host shortcuts.
  await second.focus();
  await page.evaluate(() => { window.hostLog.keys = []; });
  await page.keyboard.press("ArrowDown");
  assert.equal(await rows.nth(2).evaluate(element => document.activeElement === element), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('.cog-reading-row[aria-pressed="true"]').count(), 0);
  await page.keyboard.press("k");
  await page.keyboard.press("Escape"); // nothing selected now: the host owns Escape again
  assert.deepEqual(await page.evaluate(() => window.hostLog.keys), ["k", "Escape"]);

  // View switching keeps the exact local use, rather than jumping to its shared declaration.
  const localUse = page.locator('.cog-reading-row[data-line="11"]');
  await localUse.click();
  // Selecting a reused Ground keeps direct objections to its steps visible, without following their replies.
  assert.equal(await page.locator('.cog-reading-row[data-line="16"]').getAttribute("data-related"), "true");
  assert.equal(await page.locator('.cog-reading-row[data-line="14"]').getAttribute("data-related"), "false");
  await page.getByRole("button", { name: "Edit alongside", exact: true }).click();
  await page.waitForSelector('[data-cog-editing="true"]');
  assert.equal(await page.getByRole('textbox', { name: 'Native source' }).inputValue(), reading);
  assert.equal(await page.evaluate(() => window.nativeEditorLog.selections.at(-1).from.line), 10);
  await page.getByRole("button", { name: "Edit alongside", exact: true }).click();
  assert.equal(await page.evaluate(() => window.nativeEditorLog.toggles), 1);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await frames();
  assert.equal(await page.locator('.cog-graph').evaluate(element => getComputedStyle(element).pointerEvents), 'auto', "Logseq's global SVG rule disabled the Map");
  const mapNode = page.locator('.cog-graph .cog-node[aria-pressed="true"]');
  assert.equal(await mapNode.count(), 1);
  assert.equal(await page.locator('.cog-graph .point[aria-label*="Slow upstream calls"]').getAttribute("data-related"), "true");
  assert.equal(await page.locator('.cog-graph .point[aria-label*="A leak would keep"]').getAttribute("data-related"), "false");
  assert.match(await page.locator(".cog-logseq-detail-text").textContent(), /Between 02:00 and 03:00/);
  await page.getByRole("button", { name: "Read passage", exact: true }).click();
  assert.equal(await localUse.getAttribute("aria-pressed"), "true");
  assert.equal(await localUse.evaluate(element => document.activeElement === element), true);

  await page.getByRole("button", { name: "Map", exact: true }).click();
  const firstMark = page.locator(".cog-graph .cog-node.point").first();
  const position = await firstMark.getAttribute("transform");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await frames();
  assert.notEqual(await firstMark.getAttribute("transform"), position);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await frames();
  assert.equal(await page.evaluate(() => window.hostLog.blockPresses), 0);

  // A real pointer selects a glyph, independently of keyboard/programmatic selection.
  const mark = firstMark.locator(".cog-glyph-shape");
  await mark.click();
  assert.equal(await firstMark.getAttribute("aria-pressed"), "true");

  // Expanded mode uses the same DOM and selection; native modal focus stays inside it.
  const graphElement = await page.locator(".cog-graph").elementHandle();
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  assert.equal(await page.locator("dialog[open] .cog-logseq").count(), 1);
  assert.equal(await graphElement.evaluate(element => element.isConnected), true);
  assert.equal(await mapNode.count(), 1);
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.querySelector("dialog").contains(document.activeElement)), true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog"));
  assert.equal(await page.locator("#graph .cog-logseq").count(), 1);
  assert.equal(await page.getByRole("button", { name: "Expand", exact: true }).evaluate(element => element === document.activeElement), true);

  // Enter opens the same native buffer without replacing the Map.
  await firstMark.focus(); await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Native source');
  assert.equal(await page.getByRole("button", { name: "Map", exact: true }).getAttribute("aria-pressed"), "true");

  // Source edits update the same view instance in place; compiler diagnostics stay visible.
  const mounted = await page.locator(".cog-logseq").elementHandle();
  await page.getByRole('textbox', { name: 'Native source' }).fill(broken);
  await frames();
  assert.equal(await page.getByRole("button", { name: "Map", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".cog-logseq").count(), 1);
  assert.equal(await mounted.evaluate(element => element.isConnected), true);
  assert.equal(await rows.count(), 3);
  assert.match(await page.locator(".cog-reading-diagnostics summary").textContent(), /error/);
  assert.equal(await page.locator('.cog-reading-row[data-line="3"] .cog-reading-diagnostic').textContent(), "UNKNOWN_POINT_REFERENCE");
  assert.equal(await page.locator(".cog-logseq-issues").isVisible(), true);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  assert.equal(await page.locator('.cog-logseq-detail').isHidden(), true, "stale selection survived a source edit");
  await page.locator(".cog-logseq-issues").click();
  assert.equal(await page.locator(".cog-reading-diagnostics").isVisible(), true);

  // Unmount while expanded releases both views and the modal outside the host component.
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await page.evaluate(() => window.hostUnmount());
  assert.equal(await page.locator(".cog-logseq").count(), 0);
  assert.equal(await page.locator(".cog-logseq-dialog").count(), 0);

  // DB code block: the host-side predicate matches only Cogitatum code blocks.
  const props = lang => ({ blockId: "b1", uuid: "b1", content: "- [C] From a DB code block.", properties: { "logseq.property.node/display-type": "code", "logseq.property.code/lang": lang } });
  assert.deepEqual(await page.evaluate(([cog, js]) => [window.hostMatches(cog), window.hostMatches(js)], [props("cog"), props("js")]), [true, false]);
  await page.evaluate(([value]) => { window.hostMount(); window.hostRender("block", value); }, [props("cog")]);
  await rows.first().waitFor();
  assert.equal(await rows.first().locator(".cog-reading-text").textContent(), "From a DB code block.");
  // A host contract violation shows a plain error panel instead of throwing into the host renderer.
  await page.evaluate(([value]) => window.hostRender("block", { ...value, content: 42 }), [props("cog")]);
  assert.match(await page.locator('.cog-logseq-error[role="alert"]').textContent(), /^Cogitatum could not render this block: /);
  assert.equal(await page.locator(".cog-logseq-body").isHidden(), true);
  await page.evaluate(() => window.hostUnmount());

  // CJK linked topology, small screens and host-theme changes use the same production view and CSS.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.evaluate(content => { document.querySelector("#graph").style.width = "800px"; window.hostMount(); window.hostRender("fenced", { lang: "cogitatum", content }); }, linked);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  await frames();
  assert.equal(await page.locator('.cog-graph .cog-junction-node').count(), 1);
  assert.equal(await page.locator('.cog-graph .point').count(), 3);
  const ground = page.locator('.cog-graph .point').nth(1);
  // Use the middle of the two-line wording: the space between lines belongs to the node too.
  const labelCenter = async () => {
    const box = await ground.locator('.cog-text').boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const groundClick = await labelCenter();
  assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.cog-node')?.getAttribute('data-node'), groundClick), await ground.getAttribute('data-node'));
  await page.mouse.click(groundClick.x, groundClick.y);
  assert.equal(await ground.getAttribute('aria-pressed'), 'true', 'CJK wording did not select its Ground');
  assert.match(await page.locator('.cog-logseq-detail-text').textContent(), /正因數只有 1 和自身的自然數/);

  const dragGround = async (reduced = false) => {
    const at = await labelCenter(), before = await ground.getAttribute('transform');
    const claim = page.locator('.cog-graph .point').first(), claimBefore = await claim.getAttribute('transform');
    await page.mouse.move(at.x, at.y); await page.mouse.down();
    await page.mouse.move(at.x + 64, at.y - 32, { steps: 8 });
    assert.equal(await page.locator('.cog-graph').getAttribute('data-dragging'), 'node', 'label drag panned the camera');
    await page.mouse.up(); await frames();
    assert.notEqual(await ground.getAttribute('transform'), before, 'dragging wording did not move its node');
    if (reduced) assert.equal(await claim.getAttribute('transform'), claimBefore, 'Reduced motion moved a neighbour');
  };
  const samplePositions = () => page.evaluate(() => new Promise(resolve => {
    const positions = [], start = performance.now();
    const sample = now => {
      positions.push([...document.querySelectorAll('.cog-graph .point')].map(node => node.getAttribute('transform')).join('|'));
      if (now - start < 500) requestAnimationFrame(sample); else resolve(positions);
    };
    requestAnimationFrame(sample);
  }));
  await dragGround();
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  const animated = await samplePositions();
  assert.ok(new Set(animated).size > 2, 'Arrange did not interpolate the displaced nodes');

  // Reduced motion keeps direct manipulation but restores the layout without interpolation.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await dragGround(true);
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  const immediate = await samplePositions();
  assert.equal(new Set(immediate).size, 1, 'Arrange animated despite reduced motion');
  assert.equal(immediate[0], animated.at(-1), 'Arrange did not restore the original layout');

  // Empty space pans the camera without selecting a node or opening the host block editor.
  const mapBox = await page.locator('.cog-graph').boundingBox();
  const beforePan = await ground.getAttribute('transform');
  await page.mouse.move(mapBox.x + 24, mapBox.y + 24); await page.mouse.down();
  await page.mouse.move(mapBox.x + 64, mapBox.y + 48, { steps: 6 });
  assert.equal(await page.locator('.cog-graph').getAttribute('data-dragging'), 'camera');
  await page.mouse.up(); await frames();
  assert.notEqual(await ground.getAttribute('transform'), beforePan);
  assert.equal(await ground.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => window.hostLog.blockPresses), 0);
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await frames();
  // A delayed host edit may arrive while the pointer still holds an old revision.
  const interrupted = await labelCenter();
  await page.mouse.move(interrupted.x, interrupted.y); await page.mouse.down();
  await page.mouse.move(interrupted.x + 40, interrupted.y, { steps: 4 });
  await page.evaluate(() => window.hostRender('fenced', { lang: 'cogitatum', content: '- [C] Replacement.' }));
  await frames();
  assert.equal(await page.locator('.cog-graph').getAttribute('data-dragging'), null);
  await page.mouse.move(interrupted.x + 60, interrupted.y); await page.mouse.up();
  await page.evaluate(content => window.hostRender('fenced', { lang: 'cogitatum', content }), linked);
  await frames();
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/map-desktop.png` });
  await page.evaluate(() => {
    for (const [key, value] of Object.entries({ "primary-text-color": "#e5e7eb", "secondary-text-color": "#a1a9b2", "primary-background-color": "#182027", "secondary-background-color": "#202b34", "border-color": "#3c4b57", "link-text-color": "#75c5ba" })) document.documentElement.style.setProperty(`--ls-${key}`, value);
  });
  assert.equal(await page.locator(".cog-logseq").evaluate(element => getComputedStyle(element).color), "rgb(229, 231, 235)");
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/map-dark.png` });
  await page.setViewportSize({ width: 360, height: 780 });
  await frames();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "the mobile card overflows the viewport");
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/map-mobile.png` });
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await frames();
  assert.equal(await page.locator("dialog[open]").count(), 1);
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/map-mobile-expanded.png` });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog"));
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await frames();
  assert.equal(await rows.first().evaluate(element => getComputedStyle(element).animationName), "none");
  assert.match(await rows.first().textContent(), /9 不是素數/);
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/reading-mobile.png` });
  await page.evaluate(() => window.hostUnmount());

  // Unload releases each returned unregister function exactly once.
  await page.evaluate(async () => { await window.pluginUnload(); await window.pluginUnload(); });
  assert.equal(await page.evaluate(() => window.hostLog.unregistered), 3);

  // The shipped bundle loads in a plugin iframe without throwing before the host handshake.
  await page.evaluate(() => new Promise(resolve => {
    const frame = document.createElement("iframe"); frame.src = "/dist/index.html"; frame.onload = resolve; document.body.append(frame);
  }));
  await page.waitForTimeout(300);
  assert.deepEqual(errors, []);
  process.stdout.write("Logseq host harness passed.\n");
} finally {
  await browser.close();
}
