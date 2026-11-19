import { MAX_CANDIDATES } from "../charts/location-combinations-data.js";

let nextPickerId = 0;

/** A T4 control bound to the injected store, independent of the bar renderer. */
export function createHotspotPicker({ container, store, loadLocations, maxCandidates = MAX_CANDIDATES }) {
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > MAX_CANDIDATES) throw new Error("Invalid candidate limit");
  const form = document.createElement("form");
  form.className = "hotspot-picker";
  form.innerHTML = '<label for="hotspot-search">Find candidate hotspots by name or ID</label><div class="hotspot-picker__search"><input id="hotspot-search" type="search" maxlength="100" autocomplete="off"><button type="submit">Search</button></div><p class="hotspot-picker__status" role="status"></p><ul class="hotspot-picker__selected" aria-label="Selected candidate hotspots"></ul><div class="hotspot-picker__results" aria-label="Hotspot search results"></div><div class="hotspot-picker__pages"><button type="button" data-action="previous">Previous locations</button><span></span><button type="button" data-action="next">Next locations</button></div>';
  const inputId = "hotspot-search-" + (++nextPickerId);
  form.querySelector("input").id = inputId;
  form.querySelector("label").htmlFor = inputId;
  container.append(form);
  const input = form.querySelector("input");
  const status = form.querySelector(".hotspot-picker__status");
  const results = form.querySelector(".hotspot-picker__results");
  const selected = form.querySelector("ul");
  const previous = form.querySelector('[data-action="previous"]');
  const next = form.querySelector('[data-action="next"]');
  const pageLabel = form.querySelector(".hotspot-picker__pages span");
  const labels = new Map();
  let county = null;
  let page = 1;
  let search = "";
  let rows = [];
  let total = 0;
  let request = 0;
  let busy = false;
  let destroyed = false;

  function draw() {
    if (destroyed) return;
    const focusedId = results.contains(document.activeElement) ? document.activeElement.value : null;
    const ids = store.getFilters("t4").candidateLocationIds;
    selected.replaceChildren(...ids.map(id => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Remove " + (labels.get(id) || id) + " [" + id + "]";
      button.addEventListener("click", () => store.setChart("t4", { candidateLocationIds: ids.filter(value => value !== id) }));
      item.append(button);
      return item;
    }));
    results.replaceChildren(...rows.map(row => {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = row.locality_id;
      checkbox.checked = ids.includes(row.locality_id);
      checkbox.disabled = busy || (!checkbox.checked && ids.length >= maxCandidates);
      const text = document.createElement("span");
      text.textContent = row.locality_name + " [" + row.locality_id + "] · " + row.species_richness + " species";
      checkbox.addEventListener("change", () => {
        const current = store.getFilters("t4").candidateLocationIds;
        const updated = checkbox.checked ? [...current, row.locality_id] : current.filter(id => id !== row.locality_id);
        if (updated.length <= maxCandidates) store.setChart("t4", { candidateLocationIds: updated });
      });
      label.append(checkbox, text);
      return label;
    }));
    if (focusedId) [...results.querySelectorAll("input")].find(input => input.value === focusedId)?.focus();
    previous.disabled = busy || !county || page <= 1;
    next.disabled = busy || !county || page * 50 >= total;
    input.disabled = !county;
    form.querySelector('[type="submit"]').disabled = busy || !county;
    pageLabel.textContent = county && !busy ? "Page " + page + " of " + Math.max(1, Math.ceil(total / 50)) : "";
    if (!busy) status.textContent = county
      ? ids.length + "/" + maxCandidates + " candidates selected · " + total + " matching hotspots. " + (total ? "Select candidates below." : "No matching hotspots.")
      : "Select a county to find hotspots.";
  }

  async function load() {
    if (destroyed) return;
    const token = ++request;
    rows = []; total = 0;
    if (!county) { busy = false; draw(); return; }
    busy = true; draw(); status.textContent = "Loading hotspot locations…";
    try {
      const data = await loadLocations(county, search, page);
      if (token !== request) return;
      rows = data.locations; total = data.total;
      rows.forEach(row => labels.set(row.locality_id, row.locality_name));
      busy = false; draw();
    } catch (error) {
      if (token !== request) return;
      busy = false; draw();
      status.textContent = "Hotspot summaries unavailable. Complete node scripts/build_location_summaries.js, then search again. " + error.message;
    }
  }
  form.addEventListener("submit", event => { event.preventDefault(); search = input.value.trim(); page = 1; load(); });
  previous.addEventListener("click", () => { page--; load(); });
  next.addEventListener("click", () => { page++; load(); });
  const unsubscribe = store.subscribe({ keys: ["shared.countyCode", "charts.t4.candidateLocationIds"] }, () => {
    const current = store.getFilters("t4").countyCode;
    if (county !== current) { county = current; page = 1; search = ""; input.value = ""; labels.clear(); load(); }
    else draw();
  });
  county = store.getFilters("t4").countyCode;
  load();
  return {
    setLabels(locations) { locations.forEach(row => labels.set(row.locality_id, row.locality_name)); draw(); },
    destroy() { if (destroyed) return; destroyed = true; request++; unsubscribe(); form.remove(); } };
}
