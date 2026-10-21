// Cross-realm harness: the adapter runs in a plugin iframe through the real @logseq/libs Experiments
// dispatch, while a host page owns React 19 and the DOM, as in Logseq. The host side is a fake of the
// documented renderer contracts; it is not a running Logseq app.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
window.hostMount = () => {
  const block = document.createElement("div"); block.className = "block-content";
  // Stand-in for Logseq's block-content press handler, which enters editing mode.
  for (const type of ["pointerdown", "mousedown"]) block.addEventListener(type, () => log.blockPresses++);
  document.querySelector("#graph").replaceChildren(block); root = createRoot(block);
};
window.hostRender = (kind, props) => flushSync(() => {
  if (kind === "fenced") {
    const opts = fenced.get(props.lang);
    // Mirrors hook-ui-fenced-code: presses are stopped only when edit is false.
    root.render(React.createElement("div", { className: "ui-fenced-code-result", onPointerDown: event => { if (opts.edit === false) { event.preventDefault(); event.stopPropagation(); } } },
      React.createElement(opts.render, { content: props.content })));
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
  "/host.html": ["text/html", `<!doctype html><style>:root{--ls-primary-text-color:rgb(1, 2, 3)} #graph{width:800px}</style><div id="graph"></div><script src="/host.js"></script>`],
  "/host.js": ["text/javascript", host],
  "/plugin.html": ["text/html", `<!doctype html><script src="/plugin.js"></script>`],
  "/plugin.js": ["text/javascript", plugin],
  "/dist/index.html": ["text/html", readFileSync(new URL("../dist/index.html", import.meta.url), "utf8")],
  "/dist/main.js": ["text/javascript", readFileSync(new URL("../dist/main.js", import.meta.url), "utf8")]
};
const reading = readFileSync(new URL("./fixtures/api-timeout.cog.md", import.meta.url), "utf8");
const broken = "- [C] Fine.\n- [Z] Broken mark.\n- [. use @nowhere] Dangling.\n";

const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://logseq.test/**", route => {
    const file = files[new URL(route.request().url()).pathname];
    return file ? route.fulfill({ contentType: file[0], body: file[1] }) : route.fulfill({ status: 404 });
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

  // Source edits update the same view instance in place; compiler diagnostics stay visible.
  const mounted = await page.locator(".cog-logseq").elementHandle();
  await page.evaluate(([content]) => window.hostRender("fenced", { lang: "cog", content }), [broken]);
  await frames();
  assert.equal(await page.locator(".cog-logseq").count(), 1);
  assert.equal(await mounted.evaluate(element => element.isConnected), true);
  assert.equal(await rows.count(), 3);
  assert.match(await page.locator(".cog-reading-diagnostics summary").textContent(), /error/);
  assert.equal(await page.locator('.cog-reading-row[data-line="3"] .cog-reading-diagnostic').textContent(), "UNKNOWN_POINT_REFERENCE");

  // Unmount releases the view and its DOM.
  await page.evaluate(() => window.hostUnmount());
  assert.equal(await page.locator(".cog-logseq").count(), 0);

  // DB code block: the host-side predicate matches only Cogitatum code blocks.
  const props = lang => ({ blockId: "b1", uuid: "b1", content: "- [C] From a DB code block.", properties: { "logseq.property.node/display-type": "code", "logseq.property.code/lang": lang } });
  assert.deepEqual(await page.evaluate(([cog, js]) => [window.hostMatches(cog), window.hostMatches(js)], [props("cog"), props("js")]), [true, false]);
  await page.evaluate(([value]) => { window.hostMount(); window.hostRender("block", value); }, [props("cog")]);
  await rows.first().waitFor();
  assert.equal(await rows.first().locator(".cog-reading-text").textContent(), "From a DB code block.");
  // A host contract violation shows a plain error panel instead of throwing into the host renderer.
  await page.evaluate(([value]) => window.hostRender("block", { ...value, content: 42 }), [props("cog")]);
  assert.match(await page.locator('.cog-logseq-error[role="alert"]').textContent(), /^Cogitatum could not render this block: /);
  assert.equal(await page.locator(".cog-logseq-error + div").isHidden(), true);
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
