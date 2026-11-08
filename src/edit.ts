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
 * While editing beside the preview, the editor wraps, is highlighted, and leads the preview with its cursor;
 * all three are released together.
 */
export function createSourceEditor(container: HTMLElement, onCursor: (line: number) => void) {
  let parallel: { wrap: HTMLElement; editor: NativeEditor; original: boolean; release?: () => void } | undefined;
  const normal = (text: string) => text.replace(/\r\n/g, "\n").replace(/\n$/, "");
  function restoreParallelEditing() {
    if (!parallel) return;
    const previous = parallel;
    parallel = undefined;
    // React may detach the preview before cleanup while its host fence remains mounted.
    delete previous.wrap.dataset.cogEditing;
    previous.release?.();
    previous.editor.setOption("lineWrapping", previous.original);
  }
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
      const win = container.ownerDocument.defaultView!;
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
      if (parallel?.editor !== editor || parallel.wrap !== wrap) {
        restoreParallelEditing();
        if (!validateTarget()) return;
        const original = editor.getOption("lineWrapping");
        if (!validateTarget()) return;
        parallel = { wrap, editor, original };
        editor.setOption("lineWrapping", true);
        if (!validateTarget()) return;
        parallel.release = assistEditor(editor, onCursor);
        if (!validateTarget()) return;
      }
      wrap.dataset.cogEditing = "true";
      // Native callbacks can cancel the render, replace its editor, or change its buffer.
      editor.refresh();
      if (!validateTarget()) return;
      if (span) editor.setSelection(
        { line: span.startLine - 1, ch: span.startColumn - 1 },
        { line: span.endLine - 1, ch: span.endColumn - 1 }
      );
      if (!validateTarget()) return;
      editor.focus();
    },
    destroy: restoreParallelEditing
  };
}
