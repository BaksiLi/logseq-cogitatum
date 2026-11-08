import { describe, expect, it, vi } from "vitest";
import { registerCogitatum, STYLE_KEY, type LogseqApi } from "./register.js";

const React = { createElement: vi.fn(), useRef: vi.fn(), useEffect: vi.fn() };

/** A host shaped like the SDK dispatch: `logseq.api.exper_*` (0.10.x) and/or `logseq.sdk.experiments.*` (2.x). */
function fakeLogseq(host: { api?: string[]; sdk?: string[]; react?: unknown } = {}) {
  const fn = () => () => undefined;
  const scope = { logseq: {
    api: Object.fromEntries((host.api ?? []).map(name => [`exper_${name}`, fn])),
    sdk: host.sdk ? { experiments: Object.fromEntries(host.sdk.map(name => [name, fn])) } : undefined
  } };
  const unregister = { fenced: vi.fn() };
  let unload: (() => Promise<void>) | undefined;
  const logseq = {
    Experiments: {
      React: "react" in host ? host.react : React,
      ensureHostScope: () => scope,
      registerFencedCodeRenderer: vi.fn<LogseqApi["Experiments"]["registerFencedCodeRenderer"]>(() => unregister.fenced)
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
    expect(status).toEqual({ fencedLanguages: ["cog", "cogitatum"], unsupported: [] });
    expect(logseq.Experiments.registerFencedCodeRenderer.mock.calls.map(([lang]) => lang)).toEqual(["cog", "cogitatum"]);
    for (const [, opts] of logseq.Experiments.registerFencedCodeRenderer.mock.calls) {
      expect(Object.keys(opts)).toEqual(["render"]); // no `edit`, so the host never stops presses on the result
      expect(typeof opts.render).toBe("function");
    }
    expect(logseq.provideStyle).toHaveBeenCalledWith({ key: STYLE_KEY, style: ".cog-reading{}" });
  });

  it("reports missing host APIs instead of calling them", () => {
    const bare = fakeLogseq();
    expect(registerCogitatum(bare.logseq, "").unsupported).toEqual(["registerFencedCodeRenderer"]);
    expect(bare.logseq.Experiments.registerFencedCodeRenderer).not.toHaveBeenCalled();

    const noReact = fakeLogseq({ api: ["register_fenced_code_renderer"], react: undefined });
    expect(registerCogitatum(noReact.logseq, "")).toEqual({ fencedLanguages: [], unsupported: ["Experiments.React"] });
    expect(noReact.logseq.provideStyle).not.toHaveBeenCalled();
    expect(noReact.logseq.beforeunload).not.toHaveBeenCalled();

    const crossOrigin = fakeLogseq();
    crossOrigin.logseq.Experiments.ensureHostScope = () => { throw new DOMException("Blocked", "SecurityError"); };
    expect(registerCogitatum(crossOrigin.logseq, "").unsupported).toEqual(["registerFencedCodeRenderer"]);
  });

  it("releases every returned unregister function once on unload", async () => {
    const { logseq, unregister, unload } = fakeLogseq({ sdk: ["register_fenced_code_renderer"] });
    registerCogitatum(logseq, "");
    await unload(); await unload();
    expect(unregister.fenced).toHaveBeenCalledTimes(2); // one per language
  });
});
