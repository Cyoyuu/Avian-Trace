import { createFilterStore } from "./filters/filter-store.js";
import { createFilterHeader } from "./components/filter-header.js";
import { createHotspotPicker } from "./components/hotspot-picker.js";
import { loadGeographicOptions, loadHotspots, loadHotspotSpecies } from "./api/info-loader.js";
import { buildLocationCombinations, sortLocationCombinations, pageLocationCombinations, combinationKey } from "./charts/location-combinations-data.js";
import { createLocationCombinationChart } from "./charts/location-combinations-chart.js";

const store = createFilterStore();
const status = document.querySelector("#combination-status");
const container = document.querySelector("#combination-chart");
const details = document.querySelector("#selected-combination");
const previous = document.querySelector("#previous-combinations");
const next = document.querySelector("#next-combinations");
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
  document.querySelector("#combination-page").textContent = combinations.length
    ? "Page " + page + " of " + result.pages + " · " + combinations.length + " combinations" : "";
  const selected = combinations.find(row => row.key === combinationKey(filters.selectedCombinationIds));
  details.replaceChildren();
  if (selected) {
    const title = document.createElement("strong");
    title.textContent = "Selected combination: " + selected.richness + " distinct species (2012–2025)";
    const list = document.createElement("ul");
    selected.locations.forEach(location => { const item = document.createElement("li"); item.textContent = location.name + " [" + location.id + "]"; list.append(item); });
    details.append(title, list);
  } else details.textContent = "Select a bar to inspect its complete location names and IDs.";
  if (!combinations.length) { chart.clear(); return; }
  chart.render({ rows: result.rows, maximum: Math.max(...combinations.map(row => row.richness)), selectedIds: filters.selectedCombinationIds });
}

async function update({ filters, changedKeys = [] }) {
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
    if (token === request) status.textContent = "Unable to load hotspot memberships: " + error.message + ". Search or change candidates to retry; offline summaries must be complete.";
  } finally { if (token === request) container.setAttribute("aria-busy", "false"); }
}

async function initialize() {
  try {
    const geography = await loadGeographicOptions();
    header = createFilterHeader({ container: "#filters", store, chartId: "t4", options: {
      stateCode: geography.filter(row => row.region_level === "state").map(row => ({ value: row.region_code, label: row.region_name })),
      countyCode: geography.filter(row => row.region_level === "county").map(row => ({ value: row.region_code, label: row.region_name }))
    } });
    chart = createLocationCombinationChart({ container, tooltip: document.querySelector("#combination-tooltip"), onSelect: ids => store.setChart("t4", { selectedCombinationIds: ids }) });
    picker = createHotspotPicker({ container: document.querySelector("#hotspot-picker"), store, loadLocations: loadHotspots });
    unsubscribe = store.subscribe({ chartId: "t4" }, update);
    previous.addEventListener("click", () => { page--; render(); });
    next.addEventListener("click", () => { page++; render(); });
    await update({ filters: store.getFilters("t4") });
  } catch (error) { status.textContent = "Unable to initialize hotspot combinations: " + error.message; }
}
initialize();
window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  request++; unsubscribe?.(); picker?.destroy(); header?.destroy(); chart?.destroy();
});
