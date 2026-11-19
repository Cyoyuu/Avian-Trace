/** Compact supporting DOM only: no chart, data, or filter policy. */
export function prepareCompactFrame({ root, elements, prefix }) {
  const document = root.ownerDocument;
  const plot = root.querySelector("[data-plot]");
  if (!plot) throw new Error("Compact view requires a plot element");
  const dialogs = [];
  const portals = [];
  const header = document.createElement("div");
  header.className = "visualization-compact__header";
  const title = plot.parentElement.querySelector("h2") || root.querySelector("h2");
  if (title) header.append(title);
  const controls = document.createElement("div");
  controls.className = "visualization-compact__controls";
  header.append(controls);

  function overlay(label, content) {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.textContent = label;
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-haspopup", "dialog");
    const dialog = document.createElement("dialog");
    dialog.className = "visualization-overlay " + root.className;
    dialog.classList.remove("visualization-view");
    dialog.id = prefix + "overlay-" + dialogs.length;
    trigger.setAttribute("aria-controls", dialog.id);
    dialog.setAttribute("aria-label", label);
    const close = document.createElement("button");
    close.type = "button"; close.textContent = "Close " + label.toLowerCase();
    close.className = "visualization-overlay__close";
    dialog.append(close, content);
    document.body.append(dialog);
    trigger.addEventListener("click", () => {
      if (dialog.open) dialog.close();
      else { dialog.showModal(); trigger.setAttribute("aria-expanded", "true"); close.focus(); }
    });
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      trigger.setAttribute("aria-expanded", "false");
      if (trigger.isConnected) trigger.focus();
    });
    dialogs.push(dialog);
    return { trigger, dialog };
  }

  const status = root.querySelector('[role="status"]');
  if (status) status.classList.add("visualization-compact__status");
  const total = elements["overlap-total"];
  if (total) total.classList.add("visualization-compact__total");
  const pickerSection = elements["hotspot-picker"]?.closest("section");
  let picker;
  if (pickerSection) {
    const content = document.createElement("div");
    const notice = document.createElement("p");
    notice.textContent = "eBird hotspot status does not guarantee public access. Check current rules and obtain any required permission before visiting.";
    content.append(notice, pickerSection);
    picker = overlay("Hotspots", content);
    const access = document.createElement("span"); access.className="visualization-compact__access";
    access.textContent="Access varies"; access.title=notice.textContent; access.setAttribute("role","note"); access.setAttribute("aria-label",notice.textContent);
    header.append(access,picker.trigger);
  }
  // Tooltips escape transformed/overflow-clipped chart cards; retain their existing classes/roles.
  root.querySelectorAll('[role="tooltip"]').forEach(tooltip => {
    document.body.append(tooltip); tooltip.style.zIndex = "10000"; portals.push(tooltip);
  });
  const notes = document.createElement("div");
  const keep = new Set([header, status, total, plot]);
  if (status) status.remove();
  if (total) total.remove();
  plot.remove();
  [...root.childNodes].forEach(node => { if (!keep.has(node)) notes.append(node); });
  const help = overlay("Details", notes); header.append(help.trigger);
  const pages = elements["previous-combinations"]?.parentElement;
  if (pages) pages.remove();
  root.replaceChildren(header);
  if (total) {
    const metadata = document.createElement("div"); metadata.className="visualization-compact__metadata";
    metadata.append(total); if(status)metadata.append(status); root.append(metadata);
  } else if (status) root.append(status);
  root.append(plot);
  if (pages) { pages.classList.add("visualization-compact__pages"); root.append(pages); }
  const statusObserver = new MutationObserver(() => { if (status) status.title = status.textContent; });
  if (status) statusObserver.observe(status, {childList:true,subtree:true,characterData:true});
  return {
    controls, pickerTrigger: picker?.trigger,
    destroy() {
      statusObserver.disconnect();
      dialogs.forEach(dialog => { if (dialog.open) dialog.close(); dialog.remove(); });
      portals.forEach(node => node.remove());
    }
  };
}
