import type { SourceSpan } from "@cogitatum/core";

type NativeEditor = {
  getValue(): string;
  refresh(): void;
  focus(): void;
  setSelection(from: { line: number; ch: number }, to: { line: number; ch: number }): void;
};

/** Logseq's fenced renderer exposes only content, so reuse its existing editor and toggle. */
export async function editAlongside(container: HTMLElement, source: string, span?: SourceSpan): Promise<void> {
  const wrap = container.closest<HTMLElement>(".ui-fenced-code-wrap");
  const toggle = wrap?.querySelector<HTMLElement>(".ui-fenced-code-result > .actions > :first-child");
  if (!wrap || !toggle) throw new Error("This Logseq renderer does not expose a parallel editor. Use the block's native Edit action.");
  if (!wrap.classList.contains("is-active")) toggle.click();
  const win = container.ownerDocument.defaultView!;
  await new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)));
  if (!container.isConnected) return;
  const editor = (wrap.querySelector(".CodeMirror") as (HTMLElement & { CodeMirror?: NativeEditor }) | null)?.CodeMirror;
  if (!editor || !wrap.classList.contains("is-active")) throw new Error("Logseq could not open its code editor. Use the block's native Edit action.");
  const normal = (text: string) => text.replace(/\r\n/g, "\n").replace(/\n$/, "");
  if (normal(editor.getValue()) !== normal(source)) throw new Error("The source changed. Select the passage again in the updated preview.");
  wrap.dataset.cogEditing = "true";
  editor.refresh();
  if (span) editor.setSelection(
    { line: span.startLine - 1, ch: span.startColumn - 1 },
    { line: span.endLine - 1, ch: span.endColumn - 1 }
  );
  editor.focus();
}
