import { describe, expect, it, vi } from "vitest";
import { BLOCK_RENDERER_KEY, isCogCodeBlock, registerCogitatum, STYLE_KEY, type LogseqApi } from "./register.js";

const React = { createElement: vi.fn(), useRef: vi.fn(), useEffect: vi.fn() };

/** A host shaped like the SDK dispatch: `logseq.api.exper_*` (0.10.x) and/or `logseq.sdk.experiments.*` (2.x). */
function fakeLogseq(host: { api?: string[]; sdk?: string[]; react?: unknown } = {}) {
  const fn = () => () => undefined;
  const scope = { logseq: {
    api: Object.fromEntries((host.api ?? []).map(name => [`exper_${name}`, fn])),
    sdk: host.sdk ? { experiments: Object.fromEntries(host.sdk.map(name => [name, fn])) } : undefined
  } };
  const unregister = { fenced: vi.fn(), block: vi.fn() };
  let unload: (() => Promise<void>) | undefined;
  const logseq = {
    Experiments: {
      React: "react" in host ? host.react : React,
      ensureHostScope: () => scope,
      registerFencedCodeRenderer: vi.fn<LogseqApi["Experiments"]["registerFencedCodeRenderer"]>(() => unregister.fenced),
      registerBlockRenderer: vi.fn<LogseqApi["Experiments"]["registerBlockRenderer"]>(() => unregister.block)
    },
    provideStyle: vi.fn(),
    beforeunload: vi.fn((callback: () => Promise<void>) => { unload = callback; })
  } satisfies LogseqApi;
  return { logseq, unregister, unload: () => unload!() };
}

describe("registerCogitatum", () => {
  it("registers Reading for both fence languages without disabling pointer interaction", () => {
    const { logseq } = fakeLogseq({ api: ["register_fenced_code_renderer"] });
    const status = registerCogitatum(logseq, ".cog-reading{}");
    expect(status).toEqual({ fencedLanguages: ["cog", "cogitatum"], blockRenderer: false, unsupported: ["registerBlockRenderer"] });
    expect(logseq.Experiments.registerFencedCodeRenderer.mock.calls.map(([lang]) => lang)).toEqual(["cog", "cogitatum"]);
    for (const [, opts] of logseq.Experiments.registerFencedCodeRenderer.mock.calls) {
      expect(Object.keys(opts)).toEqual(["render"]); // no `edit`, so the host never stops presses on the result
      expect(typeof opts.render).toBe("function");
    }
    expect(logseq.Experiments.registerBlockRenderer).not.toHaveBeenCalled();
    expect(logseq.provideStyle).toHaveBeenCalledWith({ key: STYLE_KEY, style: ".cog-reading{}" });
  });

  it("adds the DB code-block renderer only when the host provides it", () => {
    const { logseq } = fakeLogseq({ sdk: ["register_fenced_code_renderer", "register_block_renderer"] });
    expect(registerCogitatum(logseq, "")).toEqual({ fencedLanguages: ["cog", "cogitatum"], blockRenderer: true, unsupported: [] });
    const [key, opts] = logseq.Experiments.registerBlockRenderer.mock.calls[0];
    expect(key).toBe(BLOCK_RENDERER_KEY);
    expect(opts.when).toBe(isCogCodeBlock);
    expect(opts.render).toBe(logseq.Experiments.registerFencedCodeRenderer.mock.calls[0][1].render);
  });

  it("reports missing host APIs instead of calling them", () => {
    const bare = fakeLogseq();
    expect(registerCogitatum(bare.logseq, "").unsupported).toEqual(["registerFencedCodeRenderer", "registerBlockRenderer"]);
    expect(bare.logseq.Experiments.registerFencedCodeRenderer).not.toHaveBeenCalled();

    const noReact = fakeLogseq({ api: ["register_fenced_code_renderer"], react: undefined });
    expect(registerCogitatum(noReact.logseq, "")).toEqual({ fencedLanguages: [], blockRenderer: false, unsupported: ["Experiments.React", "registerBlockRenderer"] });
    expect(noReact.logseq.provideStyle).not.toHaveBeenCalled();
    expect(noReact.logseq.beforeunload).not.toHaveBeenCalled();

    const crossOrigin = fakeLogseq();
    crossOrigin.logseq.Experiments.ensureHostScope = () => { throw new DOMException("Blocked", "SecurityError"); };
    expect(registerCogitatum(crossOrigin.logseq, "").unsupported).toEqual(["registerFencedCodeRenderer", "registerBlockRenderer"]);
  });

  it("releases every returned unregister function once on unload", async () => {
    const { logseq, unregister, unload } = fakeLogseq({ sdk: ["register_fenced_code_renderer", "register_block_renderer"] });
    registerCogitatum(logseq, "");
    await unload(); await unload();
    expect(unregister.fenced).toHaveBeenCalledTimes(2); // one per language
    expect(unregister.block).toHaveBeenCalledTimes(1);
  });
});

describe("isCogCodeBlock", () => {
  const block = (display: unknown, lang: unknown) => ({ properties: { "logseq.property.node/display-type": display, "logseq.property.code/lang": lang } });
  it("matches DB code blocks in a Cogitatum language, as serialized by the host", () => {
    expect(isCogCodeBlock(block("code", "cog"))).toBe(true);
    expect(isCogCodeBlock(block(":code", " Cogitatum "))).toBe(true);
  });
  it("ignores other blocks", () => {
    expect(isCogCodeBlock(block("code", "javascript"))).toBe(false);
    expect(isCogCodeBlock(block("quote", "cog"))).toBe(false);
    expect(isCogCodeBlock(block("code", undefined))).toBe(false);
    expect(isCogCodeBlock({ properties: {} })).toBe(false);
    expect(isCogCodeBlock(undefined)).toBe(false);
  });
});
