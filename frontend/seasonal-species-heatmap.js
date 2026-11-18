import { createFilterStore } from "./filters/filter-store.js";
import { createFilterHeader } from "./components/filter-header.js";
import { loadGeographicOptions, loadSpeciesHeatmap } from "./api/info-loader.js";
import { buildSpeciesHeatmap } from "./charts/species-heatmap-data.js";
import { createSpeciesHeatmap } from "./charts/species-heatmap.js";

const store = createFilterStore();
const status = document.querySelector("#heatmap-status");
const container = document.querySelector("#species-heatmap");
const coverage = document.querySelector("#coverage-note");
let rows = [];
let header;
let chart;
let unsubscribe;
let requestId = 0;

function renderCurrent() {
  const filters = store.getFilters("t2Heatmap");
  const species = buildSpeciesHeatmap(rows, filters.sortOrder);
  chart.render({ species, startYear: filters.startYear, endYear: filters.endYear });
  return species;
}

async function initialize() {
  try {
    const geography = await loadGeographicOptions();
    header = createFilterHeader({ container: "#filters", store, chartId: "t2Heatmap", options: {
      stateCode: geography.filter(row => row.region_level === "state").map(row => ({ value: row.region_code, label: row.region_name })),
      countyCode: geography.filter(row => row.region_level === "county").map(row => ({ value: row.region_code, label: row.region_name }))
    } });
    chart = createSpeciesHeatmap({ container, tooltip: document.querySelector("#heatmap-tooltip") });
    async function update({ filters, changedKeys }) {
      if (changedKeys.length && changedKeys.every(key => key === "charts.t2Heatmap.sortOrder")) {
        if (rows.length) renderCurrent();
        return;
      }
      const currentRequest = ++requestId;
      rows = [];
      chart.clear();
      coverage.textContent = "";
      if (!filters.stateCode) {
        status.textContent = "Select a state. Choose a county to narrow the area.";
        document.querySelector("#heatmap-title").textContent = "Select a state";
        document.querySelector("#heatmap-context").textContent = "";
        container.setAttribute("aria-busy", "false");
        return;
      }
      const regionCode = filters.countyCode || filters.stateCode;
      const regionLevel = filters.countyCode ? "county" : "state";
      const name = geography.find(row => row.region_code === regionCode)?.region_name || regionCode;
      document.querySelector("#heatmap-title").textContent = "Top species in " + name;
      document.querySelector("#heatmap-context").textContent = "Observation totals aggregated across " + filters.startYear + "–" + filters.endYear + " · all twelve months";
      status.textContent = "Loading monthly observation totals…";
      container.setAttribute("aria-busy", "true");
      try {
        const result = await loadSpeciesHeatmap(regionCode, regionLevel, filters.startYear, filters.endYear, filters.speciesCount);
        if (currentRequest !== requestId) return;
        if (result.unavailableYears.length) {
          status.textContent = "Monthly totals are unavailable for the complete selected range.";
          coverage.textContent = "Missing processed summaries for: " + result.unavailableYears.join(", ") + ". No partial totals or incomplete top-species ranking are shown.";
          return;
        }
        rows = result.rows;
        if (!rows.length) {
          status.textContent = "No species observation records in the selected area and years.";
          return;
        }
        const species = renderCurrent();
        status.textContent = "Showing " + species.length + " top species and all twelve months in " + name + ".";
        coverage.textContent = species.some(item => item.cells.some(cell => cell.observationRecords === null))
          ? "Some monthly totals are unavailable. Gray cells are not zero observations."
          : "All selected years have processed summaries. Months with no matching records are zero.";
      } catch (error) {
        if (currentRequest === requestId) status.textContent = "Unable to load species heatmap: " + error.message + ". Change a filter to retry.";
      } finally {
        if (currentRequest === requestId) container.setAttribute("aria-busy", "false");
      }
    }
    unsubscribe = store.subscribe({ chartId: "t2Heatmap" }, update);
    await update({ filters: store.getFilters("t2Heatmap"), changedKeys: [] });
  } catch (error) {
    status.textContent = "Unable to initialize species heatmap: " + error.message;
    container.setAttribute("aria-busy", "false");
  }
}
initialize();
window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  requestId += 1;
  unsubscribe?.();
  header?.destroy();
  chart?.destroy();
});
