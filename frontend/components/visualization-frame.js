/** Own only this view's supporting DOM and instance-specific accessibility IDs. */
let nextFrameId = 0;
export function createVisualizationFrame({ container, html, className }) {
  if (!container?.append) throw new Error("A visualization container is required");
  const document = container.ownerDocument;
  const root = document.createElement("div");
  root.className = "visualization-view " + className;
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
  return { root, elements, destroy() { root.remove(); } };
}
