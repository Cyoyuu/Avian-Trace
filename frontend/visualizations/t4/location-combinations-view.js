import { hotspotOverlapUrl } from "./hotspot-overlap-selection.js";
import { createHotspotPicker } from "../../components/hotspot-picker.js";
import { buildLocationCombinations, sortLocationCombinations, pageLocationCombinations, combinationKey } from "./location-combinations-data.js";
import { createLocationCombinationChart } from "./location-combinations-chart.js";
import { createVisualizationFrame } from "../../components/visualization-frame.js";

const HTML = `
<section aria-labelledby="candidate-title">
    <h2 id="candidate-title">Choose candidate hotspots</h2>
    <p>Select up to 10 locations within one county. Candidate count is separate from locations per combination. No candidates are selected automatically.</p>
    <div id="hotspot-picker"></div>
  </section>
  <section aria-labelledby="combination-title">
    <h2 id="combination-title">Combination richness</h2>
    <p id="combination-status" role="status" aria-live="polite">Loading county choices…</p>
    <p><span class="best-swatch" aria-hidden="true"></span> Orange: greatest richness across all combinations, including ties. Outlined: selected combination.</p>
    <div class="combination-pages"><button id="previous-combinations" type="button" disabled>Previous combinations</button><span id="combination-page"></span><button id="next-combinations" type="button" disabled>Next combinations</button></div>
    <div id="combination-chart" aria-busy="false"></div>
    <div id="selected-combination" aria-live="polite">Select a bar to inspect its complete location names and IDs.</div>
    <p>All combinations are calculated before sorting and pagination (50 per page). Hover or focus a bar for full names and richness; click, Enter, or Space selects it. Scroll horizontally to explore the current page.</p>
    <p>Richness counts distinct species across the union of locations, counting each species once. It reflects recorded coverage, not population size or equal observation effort. Shared species, year-range, and season selections do not restrict T4.</p>
  </section>
<div id="combination-tooltip" role="tooltip" hidden></div>
`;

export function mountLocationCombinations({ container: host, store, data, geography, taxa, d3 = globalThis.d3, sizing = {}, onExploreOverlap }) {
  const frame = createVisualizationFrame({ container: host, html: HTML, className: "location-combinations-page" });
  const { elements } = frame;
  let disposed = false;
  const { loadHotspots, loadHotspotSpecies } = data;

  const status = elements["combination-status"];
  const container = elements["combination-chart"];
  const details = elements["selected-combination"];
  const previous = elements["previous-combinations"];
  const next = elements["next-combinations"];
  let page = 1;
  let combinations = [];
  let membershipKey = "";
  let memberships = [];
  let request = 0;
  let header, picker, chart, unsubscribe;

  function render() {
    const filters = store.getFilters("t4");
    const sorted = sortLocationCombinations(combinations, filters.sortOrder);
    const result = pageLocationCombinations(sorted, page);
    page = result.page;
    previous.disabled = page <= 1 || !combinations.length;
    next.disabled = page >= result.pages || !combinations.length;
    elements["combination-page"].textContent = combinations.length
      ? "Page " + page + " of " + result.pages + " · " + combinations.length + " combinations" : "";
    const selected = combinations.find(row => row.key === combinationKey(filters.selectedCombinationIds));
    details.replaceChildren();
    if (selected) {
      const title = document.createElement("strong");
      title.textContent = "Selected combination: " + selected.richness + " distinct species (2012–2025)";
      const list = document.createElement("ul");
      selected.locations.forEach(location => { const item = document.createElement("li"); item.textContent = location.name + " [" + location.id + "]"; list.append(item); });
      const overlapLink = document.createElement("a");
      overlapLink.textContent = "Explore this combination in the UpSet chart";
      overlapLink.href = hotspotOverlapUrl({ stateCode: filters.stateCode, countyCode: filters.countyCode, locationIds: selected.locationIds });
      if (onExploreOverlap) overlapLink.addEventListener("click", event => {
      event.preventDefault();
      if (!disposed) onExploreOverlap(selected.locationIds);
    });
    details.append(title, list, overlapLink);
    } else details.textContent = "Select a bar to inspect its complete location names and IDs.";
    if (!combinations.length) { chart.clear(); return; }
    chart.render({ rows: result.rows, maximum: Math.max(...combinations.map(row => row.richness)), selectedIds: filters.selectedCombinationIds });
  }

  async function update({ filters, changedKeys = [] }) {
        if (disposed) return;
    if (changedKeys.length && changedKeys.every(key => key === "charts.t4.selectedCombinationIds")) { render(); return; }
    const token = ++request;
    page = 1;
    combinations = [];
    container.setAttribute("aria-busy", "false");
    render();
    if (!filters.countyCode) { status.textContent = "Select a county, then explicitly choose candidate hotspots."; membershipKey = ""; memberships = []; return; }
    if (filters.candidateLocationIds.length < filters.numberOfLocations) {
      status.textContent = "Choose at least " + filters.numberOfLocations + " candidates to compare combinations of exactly " + filters.numberOfLocations + " hotspots. Currently selected: " + filters.candidateLocationIds.length + ".";
      return;
    }
    const key = filters.countyCode + ":" + filters.candidateLocationIds.join(",");
    try {
      if (membershipKey !== key) {
        status.textContent = "Loading prepared hotspot species memberships…";
        container.setAttribute("aria-busy", "true");
        const rows = await loadHotspotSpecies(filters.countyCode, filters.candidateLocationIds);
        if (token !== request) return;
        memberships = rows; membershipKey = key;
      }
      combinations = buildLocationCombinations(memberships, filters.numberOfLocations);
      status.textContent = combinations.length + " exact combinations of " + filters.numberOfLocations + " hotspots · " + filters.countyCode + " · 2012–2025. Greatest richness: " + Math.max(...combinations.map(row => row.richness)) + " species.";
      render();
    } catch (error) {
          if (disposed) return;
      if (token === request) status.textContent = "Unable to load hotspot memberships: " + error.message + ". Search or change candidates to retry; offline summaries must be complete.";
    } finally { if (token === request) container.setAttribute("aria-busy", "false"); }
  }

  async function initialize() {
    try {
      chart = createLocationCombinationChart({ d3, sizing, container, tooltip: elements["combination-tooltip"], onSelect: ids => store.setChart("t4", { selectedCombinationIds: ids }) });
      picker = createHotspotPicker({ container: elements["hotspot-picker"], store, loadLocations: loadHotspots });
      unsubscribe = store.subscribe({ chartId: "t4" }, update);
      previous.addEventListener("click", onPrevious);
      next.addEventListener("click", onNext);
      await update({ filters: store.getFilters("t4") });
    } catch (error) {
          if (disposed) return; status.textContent = "Unable to initialize hotspot combinations: " + error.message; }
  }
  function onPrevious() { page--; render(); }
  function onNext() { page++; render(); }

  const ready = initialize();
  return { root: frame.root, ready, destroy() {
    if (disposed) return; disposed = true;
    request++;
    unsubscribe?.();
    previous.removeEventListener("click", onPrevious); next.removeEventListener("click", onNext); picker?.destroy();
    chart?.destroy(); frame.destroy();
  } };
}
