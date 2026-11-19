import { createVisualizationFrame } from "../../components/visualization-frame.js";
import { createHotspotPicker } from "../../components/hotspot-picker.js";
import { buildExclusiveIntersections } from "./hotspot-overlap-data.js";
import { createHotspotOverlapChart } from "./hotspot-overlap-chart.js";
import { validateLoadedHotspots } from "./hotspot-overlap-selection.js";

const HTML = `
<p id="selection-message" role="alert" hidden></p>
  <section aria-labelledby="overlap-picker-title">
    <h2 id="overlap-picker-title">Choose 3–5 hotspots in one county</h2>
    <div id="hotspot-picker"></div>
  </section>
  <section aria-labelledby="overlap-title">
    <h2 id="overlap-title">Exclusive species intersections</h2>
    <p id="overlap-status" role="status" aria-live="polite">Loading county choices…</p>
    <p id="overlap-total" class="overlap-total" aria-live="polite"></p>
    <p>Each bar counts species recorded at <strong>exactly</strong> the filled-dot hotspots, and at none of the other selected hotspots. Connected filled dots identify that membership pattern; pale dots indicate absence from that set.</p>
    <div id="overlap-chart" data-plot aria-busy="false"></div>
    <div id="overlap-selection" aria-live="polite">Select an intersection to inspect its participating hotspots.</div>
    <h3>Selected hotspot sets</h3>
    <ul id="overlap-hotspots"></ul>
    <p>Hover or focus a column for full hotspot names and its species count. Click, Enter, or Space selects it. Use Left/Right, Home, or End to move between columns; Escape dismisses the tooltip. Scroll horizontally to inspect every intersection.</p>
    <p>Only nonempty intersections are displayed, ordered by species count. Their counts sum to total distinct-species richness. Shared species, year-range, season, and combination-size filters do not restrict this fixed 2012–2025 comparison.</p>
    <p><a href="location-combinations.html">Back to the hotspot combination bar chart</a>. Select a combination there to open this page with those hotspot IDs. The current valid overlap selection is also represented in this page’s URL for sharing.</p>
  </section>
<div id="overlap-tooltip" role="tooltip" hidden></div>
`;

export function mountHotspotSpeciesOverlap({ container: host, presentation = "standalone", store, data, d3 = globalThis.d3, sizing = {}, initialRows = [], initialMessage = "", initialIntersectionIds = [], onIntersectionSelect, selection, onSelectionChange }) {
  const frame = createVisualizationFrame({ container: host, html: HTML, presentation, className: "location-combinations-page hotspot-overlap-page" });
  const { elements } = frame;
  let disposed = false;
  const { loadHotspotSpecies, loadHotspots } = data;
  const selectionSource = selection || {
    getIds: () => store.getFilters("t4").candidateLocationIds,
    setIds: ids => store.setChart("t4", { candidateLocationIds: ids }),
    keys: ["charts.t4.candidateLocationIds"]
  };

  const status = elements["overlap-status"];
  const total = elements["overlap-total"];
  const details = elements["overlap-selection"];
  const message = elements["selection-message"];
  const container = elements["overlap-chart"];
  const locationList = elements["overlap-hotspots"];
  let picker, chart, unsubscribe;
  let request = 0;
  let cacheKey = initialRows.length ? store.getFilters("t4").countyCode + ":" + selectionSource.getIds().join(",") : "";
  let cachedRows = initialRows;
  let model;
  let selectedMask = null;
  let pendingIntersectionIds = [...initialIntersectionIds];

  function renderSelection() {
    const row = model?.intersections.find(intersection => intersection.mask === selectedMask);
    details.replaceChildren();
    if (!row) { details.textContent = "Select an intersection to inspect its participating hotspots."; return; }
    const title = document.createElement("strong");
    title.textContent = row.count + " species recorded exclusively at these selected hotspots:";
    const list = document.createElement("ul");
    model.locations.filter(location => row.locationIds.includes(location.id)).forEach(location => {
      const item = document.createElement("li"); item.textContent = location.name + " [" + location.id + "]"; list.append(item);
    });
    const note = document.createElement("p");
    note.textContent = "These species are absent from the other hotspots in this comparison; observations outside the selected sets do not affect this exclusive intersection.";
    details.append(title,list,note);
  }

  async function update({ changedKeys = [] } = {}) {
    if (disposed) return;
    const filters = { ...store.getFilters("t4"), candidateLocationIds: selectionSource.getIds() };
    if (frame.pickerTrigger) frame.pickerTrigger.textContent = "Hotspots · " + filters.candidateLocationIds.length + "/5";
    const token = ++request;
    if (changedKeys.length) message.hidden = true;
    selectedMask = null; model = undefined;
    chart.clear(); total.textContent = ""; locationList.replaceChildren(); renderSelection();
    container.setAttribute("aria-busy","false");
    if (!filters.countyCode || filters.candidateLocationIds.length < 3) {
      status.textContent = !filters.countyCode ? "Select a state and county, then choose 3–5 hotspots." : "Choose at least 3 hotspots; currently selected: " + filters.candidateLocationIds.length + ".";
      onSelectionChange?.({ filters, valid: false });
      return;
    }
    if (filters.candidateLocationIds.length > 5) { status.textContent = "Choose at most 5 hotspots for the UpSet comparison."; onSelectionChange?.({ filters, valid: false }); return; }
    const key = filters.countyCode + ":" + filters.candidateLocationIds.join(",");
    status.textContent = "Loading precomputed hotspot species memberships…";
    container.setAttribute("aria-busy","true");
    try {
      if (key !== cacheKey) {
        const rows = validateLoadedHotspots(await loadHotspotSpecies(filters.countyCode,filters.candidateLocationIds),filters.candidateLocationIds);
        if (token !== request) return;
        cachedRows = rows; cacheKey = key;
      }
      model = buildExclusiveIntersections(cachedRows);
      if (pendingIntersectionIds.length) {
        const key=[...pendingIntersectionIds].sort().join("|");
        selectedMask=model.intersections.find(row=>[...row.locationIds].sort().join("|")===key)?.mask ?? null;
        pendingIntersectionIds=[];
      }
      picker?.setLabels(cachedRows);
      renderSelection();
      chart.render({ model, selectedMask });
      model.locations.forEach(location => {
        const item = document.createElement("li"); item.textContent = location.name + " [" + location.id + "] · " + location.richness + " distinct species"; locationList.append(item);
      });
      const sum = model.intersections.reduce((value,row)=>value+row.count,0);
      total.textContent = presentation === "compact" ? "Union: " + model.unionRichness + " species · intersection sum: " + sum : "Total distinct-species richness: " + model.unionRichness + " · sum of exclusive intersections: " + sum;
      status.textContent = model.intersections.length
        ? model.locations.length + " hotspots · " + model.intersections.length + " nonempty exclusive intersections · " + filters.countyCode + " · 2012–2025."
        : "No species recorded in these hotspot memberships. All selected sets are empty.";
      onSelectionChange?.({ filters, valid: true });
    } catch (error) {
      if (disposed) return;
      if (token !== request) return;
      model = undefined; chart.clear(); onSelectionChange?.({ filters, valid: false });
      status.textContent = "Unable to load this selection. Hotspot IDs must belong to the selected county and the offline summary must be available. " + error.message + ". Remove or change a hotspot to retry; unavailable data is not zero overlap.";
    } finally { if (token === request) container.setAttribute("aria-busy","false"); }
  }

  async function initialize() {
    try {
      chart = createHotspotOverlapChart({ d3, sizing, presentation, container, tooltip:elements["overlap-tooltip"], onSelect:mask=>{
        selectedMask=mask; renderSelection(); chart.render({model,selectedMask});
        onIntersectionSelect?.([...model.intersections.find(row=>row.mask===mask).locationIds]);
      } });
      if (selectionSource.setIds) picker = createHotspotPicker({ container:elements["hotspot-picker"], store, loadLocations:loadHotspots, maxCandidates:5, selection: selectionSource });
      else { elements["hotspot-picker"].closest("section").hidden = true; if (frame.pickerTrigger) frame.pickerTrigger.hidden = true; }
      picker?.setLabels(cachedRows);
      unsubscribe = store.subscribe({keys:["shared.stateCode","shared.countyCode",...selectionSource.keys]},update);
      await update();
    } catch (error) {
      if (disposed) return; status.textContent = "Unable to initialize hotspot overlap: " + error.message; }
  }
  if (initialMessage) { message.textContent = initialMessage; message.hidden = false; }
  const ready = initialize();
  return { root: frame.root, controls: frame.controls, ready, destroy() {
    if (disposed) return; disposed = true; request++;
    unsubscribe?.(); picker?.destroy(); chart?.destroy(); frame.destroy();
  } };
}
