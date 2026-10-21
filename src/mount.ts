import { explainSource, type BearingTarget, type GraphIR } from "@cogitatum/core";
import { bearingMark, createGraphView, createReadingView, pointMark, projectReading, type GraphNode, type GraphView } from "@cogitatum/view";

export type CogBlock = {
  update(content: string): void;
  destroy(): void;
};
type Mode = "reading" | "map" | "source";

/** The host owns the frame and temporary controls; Core/View own the source and its representation. */
export function mountCogBlock(container: HTMLElement, content: string): CogBlock {
  const doc = container.ownerDocument;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement) => {
    const node = doc.createElement(tag);
    node.className = className;
    parent?.append(node);
    return node;
  };
  const abort = new AbortController(), on = { signal: abort.signal };
  const button = (parent: HTMLElement, label: string, action: () => void, title = label) => {
    const node = element("button", "cog-logseq-button", parent);
    node.type = "button"; node.textContent = label; node.title = title;
    node.addEventListener("click", action, on);
    return node;
  };
  const root = element("section", "cog-logseq", container);
  root.setAttribute("aria-label", "Cogitatum");
  const toolbar = element("div", "cog-logseq-toolbar", root);
  element("span", "cog-logseq-title", toolbar).textContent = "Cogitatum";
  const modes = element("div", "cog-logseq-modes", toolbar);
  modes.setAttribute("role", "group"); modes.setAttribute("aria-label", "View");
  const modeButtons = new Map<Mode, HTMLButtonElement>();
  for (const [mode, label] of [["reading", "Reading"], ["map", "Map"], ["source", "Source"]] as const) {
    modeButtons.set(mode, button(modes, label, () => showMode(mode)));
  }
  const issues = button(toolbar, "", () => showMode("reading"));
  issues.classList.add("cog-logseq-issues"); issues.hidden = true;
  const expand = button(toolbar, "Expand", () => toggleExpanded());
  expand.classList.add("cog-logseq-expand"); expand.setAttribute("aria-haspopup", "dialog");
  const failure = element("p", "cog-logseq-error", root);
  failure.setAttribute("role", "alert"); failure.hidden = true;
  const body = element("div", "cog-logseq-body", root);
  const readingSurface = element("div", "cog-logseq-reading", body);
  const mapPanel = element("div", "cog-logseq-map-panel", body);
  mapPanel.hidden = true;
  const mapToolbar = element("div", "cog-logseq-map-toolbar", mapPanel);
  mapToolbar.setAttribute("role", "group"); mapToolbar.setAttribute("aria-label", "Map controls");
  button(mapToolbar, "Fit", () => map?.fit(), "Fit the whole map");
  button(mapToolbar, "-", () => map?.zoom(1 / 1.25), "Zoom out").setAttribute("aria-label", "Zoom out");
  button(mapToolbar, "+", () => map?.zoom(1.25), "Zoom in").setAttribute("aria-label", "Zoom in");
  button(mapToolbar, "Arrange", () => map?.resetLayout(), "Restore automatic arrangement");
  const mapSurface = element("div", "cog-logseq-map", mapPanel);
  const detail = element("div", "cog-logseq-detail", mapPanel);
  detail.hidden = true;
  const detailText = element("p", "cog-logseq-detail-text", detail);
  detailText.setAttribute("aria-live", "polite");
  button(detail, "Read passage", () => { showMode("reading"); focusReading(); });
  element("p", "cog-logseq-hint", mapPanel).textContent = "Select a mark or its text for the full wording. Drag to arrange or pan; Ctrl / Cmd + scroll to zoom.";
  const source = element("pre", "cog-logseq-source", body);
  source.setAttribute("aria-label", "Cogitatum source (read only)"); source.tabIndex = 0; source.hidden = true;

  let mode: Mode = "reading", current: string | undefined, graph: GraphIR | undefined, map: GraphView | undefined;
  let selected: BearingTarget | undefined, syncing = false, destroyed = false;
  let dialog: HTMLDialogElement | undefined;
  const sync = (action: () => void) => {
    syncing = true;
    try { action(); } finally { syncing = false; }
  };
  const reading = createReadingView(readingSurface, {
    onSelect(selection) {
      selected = selection.ref;
      sync(() => { if (selected) map?.select(selected); else map?.clear(); });
    },
    onClear() {
      selected = undefined; detail.hidden = true;
      if (!syncing) sync(() => map?.clear());
    }
  });
  function selectNode(node: GraphNode) {
    selected = node.ref;
    const name = node.ref.kind === "point" ? pointMark(node.label).name : bearingMark(node.label).name;
    detailText.textContent = `${name}${node.name ? ` @${node.name}` : ""}${node.text !== node.label ? `: ${node.text}` : ""}`;
    detail.hidden = false;
    if (!syncing) reading.select(node.ref);
  }
  function focusReading() {
    readingSurface.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }
  function showMode(next: Mode) {
    mode = next; root.dataset.mode = mode;
    for (const [key, node] of modeButtons) node.setAttribute("aria-pressed", String(key === mode));
    readingSurface.hidden = mode !== "reading";
    mapPanel.hidden = mode !== "map"; source.hidden = mode !== "source";
    // Mount at the actual size; switching views preserves the camera and the local reading occurrence.
    if (mode === "map" && !map && graph) {
      try {
        map = createGraphView(mapSurface, {
          onSelect: selectNode,
          onClear() {
            detail.hidden = true;
            if (!syncing) { selected = undefined; reading.clear(); }
          },
          onNavigate() { showMode("reading"); focusReading(); }
        });
        sync(() => { map!.update(graph!, "code-block"); if (selected) map!.select(selected); });
      } catch (error) { showFailure(error); }
    }
  }
  function toggleExpanded() {
    if (dialog?.open) { dialog.close(); return; }
    dialog = element("dialog", "cog-logseq-dialog", doc.body);
    dialog.setAttribute("aria-label", "Cogitatum expanded view");
    dialog.addEventListener("cancel", event => event.stopPropagation(), on);
    dialog.addEventListener("close", () => {
      container.append(root); container.style.minHeight = "";
      root.removeAttribute("data-expanded");
      expand.textContent = "Expand"; expand.title = "Expand"; expand.setAttribute("aria-label", "Expand");
      dialog?.remove(); dialog = undefined; expand.focus({ preventScroll: true });
    }, on);
    // Move the same views into the top layer, keeping selection, camera, and listeners intact.
    container.style.minHeight = `${root.getBoundingClientRect().height}px`;
    dialog.append(root); root.dataset.expanded = "true";
    expand.textContent = "Close"; expand.title = "Close expanded view"; expand.setAttribute("aria-label", "Close expanded view");
    dialog.showModal(); expand.focus({ preventScroll: true });
  }
  function showFailure(error: unknown) {
    failure.textContent = `Cogitatum could not render this block: ${error instanceof Error ? error.message : String(error)}`;
    failure.hidden = false; body.hidden = true;
  }
  // Logseq starts editing on a press in block content; keep default focus and text selection inside the view.
  root.addEventListener("pointerdown", event => event.stopPropagation(), on);
  root.addEventListener("mousedown", event => event.stopPropagation(), on);
  root.addEventListener("click", event => event.stopPropagation(), on);
  root.addEventListener("keydown", event => {
    if (event.key === "Escape" && dialog?.open) { event.preventDefault(); event.stopPropagation(); dialog.close(); }
    else if (event.defaultPrevented) event.stopPropagation();
  }, on);

  const block: CogBlock = {
    update(next) {
      if (destroyed) throw new Error("This Cogitatum block has been destroyed.");
      if (next === current) return;
      current = next;
      try {
        const explained = explainSource(next, "document");
        graph = explained.graphs[0];
        selected = undefined; detail.hidden = true;
        source.textContent = next;
        // No generated key or occurrence is carried to a different source revision.
        sync(() => { reading.update(projectReading(next, explained)); map?.clear(); if (graph) map?.update(graph, "code-block"); });
        const empty = !graph || (!graph.points.length && !graph.bearings.length);
        modeButtons.get("map")!.disabled = empty;
        if (empty && mode === "map") showMode("reading");
        issues.textContent = `${explained.diagnostics.length} issue${explained.diagnostics.length === 1 ? "" : "s"}`;
        issues.hidden = !explained.diagnostics.length;
        failure.hidden = true; body.hidden = false;
      } catch (error) { showFailure(error); }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; abort.abort();
      dialog?.close(); dialog?.remove(); dialog = undefined;
      container.style.minHeight = "";
      map?.destroy(); reading.destroy(); root.remove();
    }
  };
  showMode("reading"); block.update(content);
  return block;
}
