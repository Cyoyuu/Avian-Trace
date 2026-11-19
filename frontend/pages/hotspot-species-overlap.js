import { createFilterOptions } from "../helpers/filter-options.js";
import { createFilterStore } from "../filters/filter-store.js";
import { createFilterHeader } from "../components/filter-header.js";
import * as data from "../api/info-loader.js";
import { mountHotspotSpeciesOverlap } from "../visualizations/t4/hotspot-species-overlap-view.js";
import { parseHotspotOverlapSelection, hotspotOverlapUrl, validateLoadedHotspots } from "../visualizations/t4/hotspot-overlap-selection.js";
import { buildExclusiveIntersections } from "../visualizations/t4/hotspot-overlap-data.js";

const store = createFilterStore();
const container = document.querySelector("#visualization");
let disposed = false, header, view;
async function initialize() {
  try {
    const geography = await data.loadGeographicOptions();
    if (disposed) return;
    let initialRows = [], initialMessage = "";
    try {
      const initial = parseHotspotOverlapSelection(location.search, geography);
      if (initial) {
        initialRows = validateLoadedHotspots(await data.loadHotspotSpecies(initial.countyCode, initial.locationIds), initial.locationIds);
        if (disposed) return;
        buildExclusiveIntersections(initialRows);
        store.setShared({ stateCode: initial.stateCode, countyCode: initial.countyCode });
        store.setChart("t4", { candidateLocationIds: initial.locationIds, numberOfLocations: initial.locationIds.length, selectedCombinationIds: initial.locationIds });
      }
    } catch (error) {
      if (disposed) return;
      initialRows = [];
      const reason = error.message.includes("400") ? "One or more hotspot IDs are unknown or do not belong to the selected county"
        : error.message.includes("503") ? "The precomputed hotspot summary is unavailable; complete the offline preparation" : error.message;
      initialMessage = "Link selection rejected or unavailable: " + reason + ". Nothing from the link was selected. Choose a county and 3–5 eligible hotspots below.";
    }
    header = createFilterHeader({ container: "#filters", store, chartId: "t4UpSet", options: createFilterOptions(geography, undefined) });
    container.replaceChildren();
    view = mountHotspotSpeciesOverlap({ container, store, data, d3, initialRows, initialMessage,
      onSelectionChange({ filters, valid }) {
        if (disposed) return;
        const url = valid ? hotspotOverlapUrl({ stateCode: filters.stateCode, countyCode: filters.countyCode, locationIds: filters.candidateLocationIds }) : "hotspot-species-overlap.html";
        history.replaceState(null, "", url);
      }
    });
    await view.ready;
  } catch (error) { if (!disposed) container.textContent = "Unable to initialize hotspot overlap: " + error.message; }
}
initialize();
window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  disposed = true; view?.destroy(); header?.destroy();
});
