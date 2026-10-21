import { explainSource } from "@cogitatum/core";
import { createReadingView, projectReading } from "@cogitatum/view";

export type CogBlock = {
  /** Recompile only when the source changed; the view instance and its listeners are reused. */
  update(content: string): void;
  destroy(): void;
};

/** Host-neutral Reading mount for one code block. It reads the source and never writes it back. */
export function mountCogBlock(container: HTMLElement, content: string): CogBlock {
  const doc = container.ownerDocument;
  const root = doc.createElement("div");
  root.className = "cog-logseq";
  const failure = doc.createElement("p");
  failure.className = "cog-logseq-error";
  failure.setAttribute("role", "alert");
  failure.hidden = true;
  const surface = doc.createElement("div");
  root.append(failure, surface);
  container.append(root);

  const view = createReadingView(surface);
  const abort = new AbortController(), on = { signal: abort.signal };
  // Logseq starts block editing on any press inside block content. Reading needs that press for
  // focus, selection and text selection, so it stops here without preventing the default action.
  root.addEventListener("pointerdown", event => event.stopPropagation(), on);
  root.addEventListener("mousedown", event => event.stopPropagation(), on);
  // A key the view consumed (it calls preventDefault) must not also drive a host shortcut.
  root.addEventListener("keydown", event => { if (event.defaultPrevented) event.stopPropagation(); }, on);

  let current: string | undefined, destroyed = false;
  const block: CogBlock = {
    update(next) {
      if (destroyed) throw new Error("This Cogitatum block has been destroyed.");
      if (next === current) return;
      current = next;
      try {
        view.update(projectReading(next, explainSource(next, "document")));
        failure.hidden = true; surface.hidden = false;
      } catch (error) {
        // Compiler diagnostics render inside the view; only unexpected failures reach this panel.
        // A stale reading is hidden rather than presented as the current source.
        failure.textContent = `Cogitatum could not render this block: ${error instanceof Error ? error.message : String(error)}`;
        failure.hidden = false; surface.hidden = true;
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; abort.abort(); view.destroy(); root.remove();
    }
  };
  block.update(content);
  return block;
}
