import { createFilterOptions } from "../helpers/filter-options.js";
import { createFilterStore } from "../filters/filter-store.js";
import { createFilterHeader } from "../components/filter-header.js";
import * as api from "../api/info-loader.js";
import { loadTaxonNameMap } from "../api/taxon-converter.js";
import { mountHolidayObservationPatterns } from "../visualizations/t3/holiday-observation-patterns-view.js";

const store = createFilterStore();
const container = document.querySelector("#visualization");
let disposed = false, header, view;
async function initialize() {
  try {
    const geography = await api.loadGeographicOptions();
    const taxa = await loadTaxonNameMap();
    if (disposed) return;
    header = createFilterHeader({ container: "#filters", store, chartId: "t3", options: createFilterOptions(geography, taxa) });
    container.replaceChildren();
    view = mountHolidayObservationPatterns({ container, store, geography, taxa, d3, data: api });
    await view.ready;
  } catch (error) { if (!disposed) container.textContent = "Unable to initialize visualization: " + error.message; }
}
initialize();
window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  disposed = true; view?.destroy(); header?.destroy();
});
