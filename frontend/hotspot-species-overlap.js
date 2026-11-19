import { createFilterStore } from "./filters/filter-store.js";
import { createFilterHeader } from "./components/filter-header.js";
import { createHotspotPicker } from "./components/hotspot-picker.js";
import { loadGeographicOptions, loadHotspots, loadHotspotSpecies } from "./api/info-loader.js";
import { buildExclusiveIntersections } from "./charts/hotspot-overlap-data.js";
import { createHotspotOverlapChart } from "./charts/hotspot-overlap-chart.js";
import { parseHotspotOverlapSelection, hotspotOverlapUrl, validateLoadedHotspots } from "./helpers/hotspot-overlap-selection.js";

const store = createFilterStore();
const status = document.querySelector("#overlap-status");
const total = document.querySelector("#overlap-total");
const details = document.querySelector("#overlap-selection");
const message = document.querySelector("#selection-message");
const container = document.querySelector("#overlap-chart");
const locationList = document.querySelector("#overlap-hotspots");
let header, picker, chart, unsubscribe;
let request = 0;
let cacheKey = "";
let cachedRows = [];
let model;
let selectedMask = null;

function updateUrl(filters, valid) {
  const url = valid ? hotspotOverlapUrl({ stateCode: filters.stateCode, countyCode: filters.countyCode, locationIds: filters.candidateLocationIds }) : "hotspot-species-overlap.html";
  history.replaceState(null, "", url);
}

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
  const filters = store.getFilters("t4");
  const token = ++request;
  if (changedKeys.length) message.hidden = true;
  selectedMask = null; model = undefined;
  chart.clear(); total.textContent = ""; locationList.replaceChildren(); renderSelection();
  container.setAttribute("aria-busy","false");
  if (!filters.countyCode || filters.candidateLocationIds.length < 3) {
    status.textContent = !filters.countyCode ? "Select a state and county, then choose 3–5 hotspots." : "Choose at least 3 hotspots; currently selected: " + filters.candidateLocationIds.length + ".";
    updateUrl(filters,false);
    return;
  }
  if (filters.candidateLocationIds.length > 5) { status.textContent = "Choose at most 5 hotspots for the UpSet comparison."; updateUrl(filters,false); return; }
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
    picker.setLabels(cachedRows);
    chart.render({ model, selectedMask });
    model.locations.forEach(location => {
      const item = document.createElement("li"); item.textContent = location.name + " [" + location.id + "] · " + location.richness + " distinct species"; locationList.append(item);
    });
    const sum = model.intersections.reduce((value,row)=>value+row.count,0);
    total.textContent = "Total distinct-species richness: " + model.unionRichness + " · sum of exclusive intersections: " + sum;
    status.textContent = model.intersections.length
      ? model.locations.length + " hotspots · " + model.intersections.length + " nonempty exclusive intersections · " + filters.countyCode + " · 2012–2025."
      : "No species recorded in these hotspot memberships. All selected sets are empty.";
    updateUrl(filters,true);
  } catch (error) {
    if (token !== request) return;
    model = undefined; chart.clear(); updateUrl(filters,false);
    status.textContent = "Unable to load this selection. Hotspot IDs must belong to the selected county and the offline summary must be available. " + error.message + ". Remove or change a hotspot to retry; unavailable data is not zero overlap.";
  } finally { if (token === request) container.setAttribute("aria-busy","false"); }
}

async function initialize() {
  try {
    const geography = await loadGeographicOptions();
    try {
      const initial = parseHotspotOverlapSelection(location.search,geography);
      if (initial) {
        const rows = validateLoadedHotspots(await loadHotspotSpecies(initial.countyCode,initial.locationIds),initial.locationIds);
        buildExclusiveIntersections(rows); // Validate complete memberships before accepting any URL selection.
        store.setShared({ stateCode: initial.stateCode, countyCode: initial.countyCode });
        store.setChart("t4", { candidateLocationIds: initial.locationIds, numberOfLocations: initial.locationIds.length, selectedCombinationIds: initial.locationIds });
        cachedRows = rows; cacheKey = initial.countyCode + ":" + initial.locationIds.join(",");
      }
    } catch (error) {
      const reason = error.message.includes("400") ? "One or more hotspot IDs are unknown or do not belong to the selected county"
        : error.message.includes("503") ? "The precomputed hotspot summary is unavailable; complete the offline preparation" : error.message;
      message.textContent = "Link selection rejected or unavailable: " + reason + ". Nothing from the link was selected. Choose a county and 3–5 eligible hotspots below.";
      message.hidden = false;
    }
    header = createFilterHeader({ container:"#filters", store, chartId:"t4UpSet", options: {
      stateCode: geography.filter(row=>row.region_level==="state").map(row=>({value:row.region_code,label:row.region_name})),
      countyCode: geography.filter(row=>row.region_level==="county").map(row=>({value:row.region_code,label:row.region_name}))
    } });
    chart = createHotspotOverlapChart({ container, tooltip:document.querySelector("#overlap-tooltip"), onSelect:mask=>{
      selectedMask=mask; renderSelection(); chart.render({model,selectedMask});
    } });
    picker = createHotspotPicker({ container:document.querySelector("#hotspot-picker"), store, loadLocations:loadHotspots, maxCandidates:5 });
    picker.setLabels(cachedRows);
    unsubscribe = store.subscribe({keys:["shared.stateCode","shared.countyCode","charts.t4.candidateLocationIds"]},update);
    await update();
  } catch (error) { status.textContent = "Unable to initialize hotspot overlap: " + error.message; }
}
initialize();
window.addEventListener("pagehide",event=>{
  if(event.persisted)return;
  request++;unsubscribe?.();picker?.destroy();header?.destroy();chart?.destroy();
});
