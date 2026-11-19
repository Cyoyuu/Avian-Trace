import { prepareCompactFrame } from "./compact-frame.js";

/** Own only this view's supporting DOM and instance-specific accessibility IDs. */
let nextFrameId = 0;
export function createVisualizationFrame({ container, html, className, presentation = "standalone" }) {
  if (!container?.append) throw new Error("A visualization container is required");
  if (!["standalone", "compact"].includes(presentation)) throw new Error("Invalid presentation");
  const document = container.ownerDocument;
  const root = document.createElement("div");
  root.className = "visualization-view " + className;
  root.dataset.presentation = presentation;
  root.innerHTML = html;
  const elements = {};
  const prefix = "visualization-" + (++nextFrameId) + "-";
  root.querySelectorAll("[id]").forEach(element => {
    const key = element.id;
    elements[key] = element;
    element.dataset.role = key;
    element.id = prefix + key;
  });
  root.querySelectorAll("[for],[aria-labelledby],[aria-describedby]").forEach(element => {
    for (const attribute of ["for", "aria-labelledby", "aria-describedby"]) {
      if (!element.hasAttribute(attribute)) continue;
      element.setAttribute(attribute, element.getAttribute(attribute).split(/\s+/).map(id => elements[id]?.id || id).join(" "));
    }
  });
  container.append(root);
  const compact = presentation === "compact" ? prepareCompactFrame({ root, elements, prefix }) : null;
  return { root, elements, controls: compact?.controls, pickerTrigger: compact?.pickerTrigger, destroy() { compact?.destroy(); root.remove(); } };
}
