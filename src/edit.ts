import type { BlockEditRequest } from "@cogitatum/view/block";
import { assistEditor, type AssistedEditor } from "./assist.js";

type NativeEditor = AssistedEditor & {
  getValue(): string;
  getOption(name: "lineWrapping"): boolean;
  setOption(name: "lineWrapping", value: boolean): void;
  refresh(): void;
  focus(): void;
  setSelection(from: { line: number; ch: number }, to: { line: number; ch: number }): void;
};

/**
 * Logseq's fenced renderer exposes only content, so reuse its existing editor and toggle.
 * Whenever the host shows that editor beside the preview, however it was opened, the editor wraps,
 * is highlighted, and leads the preview with its cursor; all three are released together when it closes.
 */
export function createSourceEditor(container: HTMLElement, onCursor: (line: number) => void) {
  let parallel: { wrap: HTMLElement; editor: NativeEditor; original: boolean; release?: () => void } | undefined;
  let destroyed = false, frame = 0;
  const win = container.ownerDocument.defaultView!;
  const host = container.closest<HTMLElement>(".ui-fenced-code-wrap");
  const normal = (text: string) => text.replace(/\r\n/g, "\n").replace(/\n$/, "");
  const editorIn = (wrap: HTMLElement) =>
    (wrap.querySelector(".CodeMirror") as (HTMLElement & { CodeMirror?: NativeEditor }) | null)?.CodeMirror;
  function restoreParallelEditing() {
    if (!parallel) return;
    const previous = parallel;
    parallel = undefined;
    // React may detach the preview before cleanup while its host fence remains mounted.
    delete previous.wrap.dataset.cogEditing;
    previous.release?.();
    previous.editor.setOption("lineWrapping", previous.original);
  }
  /** Adopt the host's open editor. `valid` is rechecked after each native call, which may close or replace it. */
  function attach(wrap: HTMLElement, editor: NativeEditor, valid: () => boolean): boolean {
    if (parallel?.wrap === wrap && parallel.editor === editor) return true;
    restoreParallelEditing();
    if (!valid()) return false;
    const original = editor.getOption("lineWrapping");
    if (!valid()) return false;
    const session: NonNullable<typeof parallel> = parallel = { wrap, editor, original };
    editor.setOption("lineWrapping", true);
    if (!valid() || parallel !== session) return false;
    session.release = assistEditor(editor, onCursor);
    if (!valid() || parallel !== session) return false;
    wrap.dataset.cogEditing = "true";
    // The editor column just narrowed and began wrapping.
    editor.refresh();
    return valid();
  }
  const open = (wrap: HTMLElement) => !destroyed && container.closest(".ui-fenced-code-wrap") === wrap && wrap.classList.contains("is-active");
  /** Follow the host toggle: Logseq may create its editor a frame or two after the fence opens. */
  function track() {
    win.cancelAnimationFrame(frame);
    if (!host || !open(host)) { restoreParallelEditing(); return; }
    frame = win.requestAnimationFrame(() => { frame = win.requestAnimationFrame(() => {
      const editor = editorIn(host);
      if (editor && open(host)) attach(host, editor, () => open(host) && editorIn(host) === editor);
    }); });
  }
  const observer = host ? new win.MutationObserver(track) : undefined;
  if (host) { observer!.observe(host, { attributes: true, attributeFilter: ["class"] }); track(); }
  return {
    /** The one-based cursor line, while editing beside the preview and only if the editor holds `source`. */
    cursorLine(source: string): number | undefined {
      if (!parallel?.wrap.classList.contains("is-active") || normal(parallel.editor.getValue()) !== normal(source)) return;
      return parallel.editor.getCursor().line + 1;
    },
    async edit({ source, sourceSpan: span, signal }: BlockEditRequest): Promise<void> {
      if (signal.aborted || !container.isConnected) return;
      const wrap = container.closest<HTMLElement>(".ui-fenced-code-wrap");
      const toggle = wrap?.querySelector<HTMLElement>(".ui-fenced-code-result > .actions > :first-child");
      if (!wrap || !toggle) throw new Error("This Logseq renderer does not expose a parallel editor. Use the block's native Edit action.");
      if (!wrap.classList.contains("is-active")) toggle.click();
      if (signal.aborted || !container.isConnected) return;
      await new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
      if (signal.aborted || !container.isConnected) return;
      const native = wrap.querySelector(".CodeMirror") as (HTMLElement & { CodeMirror?: NativeEditor }) | null;
      const editor = native?.CodeMirror;
      if (!editor) throw new Error("Logseq could not open its code editor. Use the block's native Edit action.");
      const validateTarget = () => {
        if (signal.aborted || !container.isConnected) return false;
        if (container.closest(".ui-fenced-code-wrap") !== wrap || !wrap.classList.contains("is-active")
          || wrap.querySelector(".CodeMirror") !== native || native?.CodeMirror !== editor) {
          throw new Error("Logseq could not keep the requested native editor open. Select the passage again in the updated preview.");
        }
        if (normal(editor.getValue()) !== normal(source)) throw new Error("The source changed. Select the passage again in the updated preview.");
        return true;
      };
      if (!validateTarget()) return;
      // Usually the toggle tracker attached already; attaching again is a no-op.
      if (!attach(wrap, editor, validateTarget) || !validateTarget()) return;
      if (span) editor.setSelection(
        { line: span.startLine - 1, ch: span.startColumn - 1 },
        { line: span.endLine - 1, ch: span.endColumn - 1 }
      );
      if (!validateTarget()) return;
      editor.focus();
    },
    destroy() {
      destroyed = true;
      observer?.disconnect(); win.cancelAnimationFrame(frame);
      restoreParallelEditing();
    }
  };
}
