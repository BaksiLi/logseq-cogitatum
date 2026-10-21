import { mountCogBlock, type CogBlock } from "./mount.js";

export const COG_LANGUAGES = ["cog", "cogitatum"] as const;
export const STYLE_KEY = "cogitatum-reading";
export const BLOCK_RENDERER_KEY = "cogitatum-code";

type HostReact = {
  createElement(type: string, props: Record<string, unknown>): unknown;
  useRef<T>(initial: T): { current: T };
  useEffect(effect: () => void | (() => void), deps: unknown[]): void;
};
export type BlockRendererProps = { blockId?: string; uuid?: string; content?: string; properties?: Record<string, unknown> };
/** The subset of the Logseq plugin user API this adapter relies on. */
export type LogseqApi = {
  Experiments: {
    readonly React: unknown;
    ensureHostScope(): unknown;
    registerFencedCodeRenderer(lang: string, opts: { render: (props: { content: string }) => unknown }): unknown;
    registerBlockRenderer(key: string, opts: { when?: (props: BlockRendererProps) => boolean; render: (props: BlockRendererProps) => unknown }): unknown;
  };
  provideStyle(style: { key?: string; style: string }): unknown;
  beforeunload(callback: () => Promise<void>): void;
};
export type RegistrationStatus = { fencedLanguages: string[]; blockRenderer: boolean; unsupported: string[] };

/**
 * The SDK forwards Experiments calls to `logseq.api.exper_<name>` or `logseq.sdk.experiments.<name>`
 * in the host window and silently returns undefined when neither exists, so support is probed there.
 */
function hostSupports(logseq: LogseqApi, name: string): boolean {
  try {
    const host = logseq.Experiments.ensureHostScope() as { logseq?: { api?: Record<string, unknown>; sdk?: { experiments?: Record<string, unknown> } } } | undefined;
    return typeof host?.logseq?.api?.[`exper_${name}`] === "function" || typeof host?.logseq?.sdk?.experiments?.[name] === "function";
  } catch {
    return false; // a cross-origin host scope is unreachable, which also means no Experiments
  }
}

function hostReact(logseq: LogseqApi): HostReact | undefined {
  try {
    const react = logseq.Experiments.React as Partial<HostReact> | undefined;
    return typeof react?.createElement === "function" && typeof react.useRef === "function" && typeof react.useEffect === "function" ? react as HostReact : undefined;
  } catch {
    return undefined;
  }
}

/** DB graphs keep code as a block whose display type is code and whose language is a property. */
export function isCogCodeBlock(props: BlockRendererProps | undefined): boolean {
  const properties = props?.properties ?? {};
  const display = properties["logseq.property.node/display-type"], lang = properties["logseq.property.code/lang"];
  return (display === "code" || display === ":code") && typeof lang === "string" &&
    (COG_LANGUAGES as readonly string[]).includes(lang.trim().toLowerCase());
}

/** A component for the host React: one Reading view per mounted block, updated in place. */
export function readingComponent(React: HostReact) {
  return function CogitatumReading({ content }: { content?: string }) {
    const container = React.useRef<HTMLDivElement | null>(null), block = React.useRef<CogBlock | null>(null);
    React.useEffect(() => {
      block.current = mountCogBlock(container.current!, content ?? "");
      return () => { block.current?.destroy(); block.current = null; };
    }, []);
    React.useEffect(() => { block.current?.update(content ?? ""); }, [content]);
    return React.createElement("div", { ref: container, className: "cog-logseq-host" });
  };
}

/** `style` is the complete stylesheet for the host document (view vocabulary plus Logseq theme mapping). */
export function registerCogitatum(logseq: LogseqApi, style: string): RegistrationStatus {
  const status: RegistrationStatus = { fencedLanguages: [], blockRenderer: false, unsupported: [] };
  const React = hostReact(logseq);
  if (!React) status.unsupported.push("Experiments.React");
  if (!hostSupports(logseq, "register_fenced_code_renderer")) status.unsupported.push("registerFencedCodeRenderer");
  if (!hostSupports(logseq, "register_block_renderer")) status.unsupported.push("registerBlockRenderer");
  if (!React) return status;

  const Reading = readingComponent(React), cleanups: Array<() => void> = [];
  const keep = (result: unknown) => { if (typeof result === "function") cleanups.push(result as () => void); };
  logseq.provideStyle({ key: STYLE_KEY, style });
  if (!status.unsupported.includes("registerFencedCodeRenderer")) {
    // `edit` is deliberately omitted: `edit: false` makes the host stop every press on the result,
    // which would disable focus and text selection inside Reading.
    for (const lang of COG_LANGUAGES) {
      keep(logseq.Experiments.registerFencedCodeRenderer(lang, { render: Reading }));
      status.fencedLanguages.push(lang);
    }
  }
  if (!status.unsupported.includes("registerBlockRenderer")) {
    keep(logseq.Experiments.registerBlockRenderer(BLOCK_RENDERER_KEY, { when: isCogCodeBlock, render: Reading }));
    status.blockRenderer = true;
  }
  // The host also releases plugin resources on unload; releasing here keeps a reload from stacking renderers.
  logseq.beforeunload(async () => { for (const cleanup of cleanups.splice(0)) cleanup(); });
  return status;
}
