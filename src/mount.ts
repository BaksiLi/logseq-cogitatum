import { createBlockView } from "@cogitatum/view/block";
import { createSourceEditor } from "./edit.js";

declare const __COGITATUM_VERSION__: { label: string; detail: string };
declare const __COGITATUM_LOGO__: string;

export type CogBlock = { update(content: string): void; destroy(): void };

export function mountCogBlock(container: HTMLElement, content: string): CogBlock {
  const editor = createSourceEditor(container, line => block.reveal(line));
  const block = createBlockView(container, {
    onEdit: editor.edit,
    logo: __COGITATUM_LOGO__,
    version: __COGITATUM_VERSION__
  });
  block.element.classList.add("cog-logseq");
  const abort = new AbortController(), on = { signal: abort.signal };
  // Logseq starts block editing on a press. Preserve default focus and text selection in the preview.
  for (const name of ["pointerdown", "mousedown", "click"]) {
    block.element.addEventListener(name, event => event.stopPropagation(), on);
  }
  block.element.addEventListener("keydown", event => { if (event.defaultPrevented) event.stopPropagation(); }, on);
  block.update(content);
  return {
    update: block.update,
    destroy() {
      abort.abort(); block.destroy();
      editor.destroy();
    }
  };
}
