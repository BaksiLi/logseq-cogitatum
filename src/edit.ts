import type { BlockEditRequest } from "@cogitatum/view/block";

type NativeEditor = {
  getValue(): string;
  getOption(name: "lineWrapping"): boolean;
  setOption(name: "lineWrapping", value: boolean): void;
  refresh(): void;
  focus(): void;
  setSelection(from: { line: number; ch: number }, to: { line: number; ch: number }): void;
};

/** Logseq's fenced renderer exposes only content, so reuse its existing editor and toggle. */
export function createSourceEditor(container: HTMLElement) {
  let parallel: { wrap: HTMLElement; editor: NativeEditor; original: boolean } | undefined;
  function restoreParallelEditing() {
    if (!parallel) return;
    parallel.editor.setOption("lineWrapping", parallel.original);
    // React may detach the preview before cleanup while its host fence remains mounted.
    delete parallel.wrap.dataset.cogEditing;
    parallel = undefined;
  }
  return {
    async edit({ source, sourceSpan: span, signal }: BlockEditRequest): Promise<void> {
      if (signal.aborted) return;
      const wrap = container.closest<HTMLElement>(".ui-fenced-code-wrap");
      const toggle = wrap?.querySelector<HTMLElement>(".ui-fenced-code-result > .actions > :first-child");
      if (!wrap || !toggle) throw new Error("This Logseq renderer does not expose a parallel editor. Use the block's native Edit action.");
      if (!wrap.classList.contains("is-active")) toggle.click();
      const win = container.ownerDocument.defaultView!;
      await new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
      if (signal.aborted || !container.isConnected) return;
      const editor = (wrap.querySelector(".CodeMirror") as (HTMLElement & { CodeMirror?: NativeEditor }) | null)?.CodeMirror;
      if (!editor || !wrap.classList.contains("is-active")) throw new Error("Logseq could not open its code editor. Use the block's native Edit action.");
      const normal = (text: string) => text.replace(/\r\n/g, "\n").replace(/\n$/, "");
      if (normal(editor.getValue()) !== normal(source)) throw new Error("The source changed. Select the passage again in the updated preview.");
      if (parallel?.editor !== editor || parallel.wrap !== wrap) {
        restoreParallelEditing();
        parallel = { wrap, editor, original: editor.getOption("lineWrapping") };
        editor.setOption("lineWrapping", true);
      }
      wrap.dataset.cogEditing = "true";
      editor.refresh();
      if (span) editor.setSelection(
        { line: span.startLine - 1, ch: span.startColumn - 1 },
        { line: span.endLine - 1, ch: span.endColumn - 1 }
      );
      editor.focus();
    },
    destroy: restoreParallelEditing
  };
}
