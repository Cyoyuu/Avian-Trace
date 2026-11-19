import { createFilterStore } from "../filters/filter-store.js";
import { createFilterHeader } from "../components/filter-header.js";
import * as api from "../api/info-loader.js";
import { mountCountyRichnessBar } from "../visualizations/t1/county-richness-bar-view.js";

const store = createFilterStore();
const container = document.querySelector("#visualization");
let disposed = false, header, view;
async function initialize() {
  try {
    const geography = await api.loadGeographicOptions();
    const taxa = undefined;
    if (disposed) return;
    header = createFilterHeader({ container: "#filters", store, chartId: "t1", options: {
      stateCode: geography.filter(row => row.region_level === "state").map(row => ({ value: row.region_code, label: row.region_name })),
      countyCode: geography.filter(row => row.region_level === "county").map(row => ({ value: row.region_code, label: row.region_name })),
      
    } });
    container.replaceChildren();
    view = mountCountyRichnessBar({ container, store, geography, taxa, d3, data: { ...api, loadCountyGeometry: () => d3.json("/data/counties-10m.json") } });
    await view.ready;
  } catch (error) { if (!disposed) container.textContent = "Unable to initialize visualization: " + error.message; }
}
initialize();
window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  disposed = true; view?.destroy(); header?.destroy();
});
