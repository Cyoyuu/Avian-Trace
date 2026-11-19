import { createFilterOptions } from "../helpers/filter-options.js";
import { createFilterStore } from "../filters/filter-store.js";
import { createFilterHeader } from "../components/filter-header.js";
import * as api from "../api/info-loader.js";
import { mountSeasonalSpeciesHeatmap } from "../visualizations/t2/seasonal-species-heatmap-view.js";

const store = createFilterStore();
const container = document.querySelector("#visualization");
let disposed = false, header, view;
async function initialize() {
  try {
    const geography = await api.loadGeographicOptions();
    const taxa = undefined;
    if (disposed) return;
    header = createFilterHeader({ container: "#filters", store, chartId: "t2Heatmap", options: createFilterOptions(geography, taxa) });
    container.replaceChildren();
    view = mountSeasonalSpeciesHeatmap({ container, store, geography, taxa, d3, data: api });
    await view.ready;
  } catch (error) { if (!disposed) container.textContent = "Unable to initialize visualization: " + error.message; }
}
initialize();
window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  disposed = true; view?.destroy(); header?.destroy();
});
