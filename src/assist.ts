import { tokenizeSource, type SourceTokenKind } from "@cogitatum/core";

type Position = { line: number; ch: number };
/** The CodeMirror 5 calls Logseq's fence editor needs for highlighting, following and keeping its own history. */
export type AssistedEditor = {
  getValue(): string;
  getCursor(): Position;
  getWrapperElement(): HTMLElement;
  markText(from: Position, to: Position, options: { className: string }): { clear(): void };
  operation<T>(work: () => T): T;
  on(event: "changes" | "cursorActivity", handler: () => void): void;
  off(event: "changes" | "cursorActivity", handler: () => void): void;
};

/** Core owns the lexical classes; the host theme colors them through CodeMirror's own token classes. */
const HOST_CLASSES: Record<SourceTokenKind, string> = {
  bullet: "cm-punctuation", mark: "cm-keyword", role: "cm-tag", name: "cm-property", operator: "cm-operator",
  relation: "cm-operator", punct: "cm-punctuation", code: "cm-string", note: "cm-comment", retired: "cm-error"
};

/**
 * Color the fence editor's source and report the cursor's one-based line while the author edits beside the preview.
 * The editor holds only the fence's content, so Core's document-mode lines are its lines. Returns the release.
 *
 * Logseq 0.10 binds undo and redo on its window, even for keys typed in its code editor. CodeMirror has already
 * undone the edit by then, and the host would also pop its graph history, which saves this editor only on blur,
 * and navigate to the page its last transaction was made on. Inside this buffer, history keys stop at the editor.
 */
export function assistEditor(editor: AssistedEditor, onCursor: (line: number) => void): () => void {
  let marks: Array<{ clear(): void }> = [];
  const clear = () => { for (const mark of marks.splice(0)) mark.clear(); };
  const highlight = () => editor.operation(() => {
    clear();
    tokenizeSource(editor.getValue()).forEach((line, index) => {
      let ch = 0;
      for (const token of line.tokens) {
        const end = ch + token.text.length;
        if (token.kind && end > ch) {
          const role = token.kind === "role" ? ` cog-role-${token.text[0]}` : "";
          marks.push(editor.markText({ line: index, ch }, { line: index, ch: end }, { className: `cog-token cog-token-${token.kind} ${HOST_CLASSES[token.kind]}${role}` }));
        }
        ch = end;
      }
    });
  });
  const follow = () => onCursor(editor.getCursor().line + 1);
  const keepHistory = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && /^[zy]$/i.test(event.key)) event.stopPropagation();
  };
  const wrapper = editor.getWrapperElement();
  highlight();
  editor.on("changes", highlight);
  editor.on("cursorActivity", follow);
  wrapper.addEventListener("keydown", keepHistory);
  return () => {
    editor.off("changes", highlight);
    editor.off("cursorActivity", follow);
    wrapper.removeEventListener("keydown", keepHistory);
    editor.operation(clear);
  };
}
