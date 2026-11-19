import { STATE_ABBREVIATIONS } from "../helpers/geographic-codes.js";
import { createFilterOptions } from "../helpers/filter-options.js";
import { createFilterStore } from "../filters/filter-store.js";
import { createFilterHeader } from "../components/filter-header.js";
import * as api from "../api/info-loader.js";
import { mountCountyChoropleth } from "../visualizations/t1/county-choropleth-view.js";

const store = createFilterStore();
const container = document.querySelector("#visualization");
let disposed = false, header, view;
async function initialize() {
  try {
    const geography = await api.loadGeographicOptions();
    const taxa = undefined;
    if (disposed) return;
    header = createFilterHeader({ container: "#filters", store, chartId: "t1Map", options: createFilterOptions(geography, taxa, { stateCodes: Object.values(STATE_ABBREVIATIONS).map(code => "US-" + code) }) });
    container.replaceChildren();
    view = mountCountyChoropleth({ container, store, geography, taxa, d3, topojson, data: { ...api, loadCountyGeometry: () => d3.json("/data/counties-10m.json") } });
    await view.ready;
  } catch (error) { if (!disposed) container.textContent = "Unable to initialize visualization: " + error.message; }
}
initialize();
window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  disposed = true; view?.destroy(); header?.destroy();
});
