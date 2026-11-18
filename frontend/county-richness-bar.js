import { createFilterStore } from "./filters/filter-store.js";
import { createFilterHeader } from "./components/filter-header.js";
import { loadCountyRichness, loadGeographicOptions } from "./api/info-loader.js";
import { sortCountyRichness } from "./charts/county-richness-bar-data.js";
import { createCountyRichnessBarChart } from "./charts/county-richness-bar.js";

const store = createFilterStore();
const status = document.querySelector("#chart-status");
const container = document.querySelector("#richness-chart");
const selection = document.querySelector("#county-selection");
const cache = new Map();
let displayedRows = [];
let requestId = 0;
let header;
let chart;
let unsubscribe;

function updateHighlight(countyCode) {
  chart.setSelectedCounty(countyCode);
  const row = displayedRows.find(row => row.region_code === countyCode);
  selection.textContent = row
    ? row.county_name + " highlighted: " + Number(row.species_richness).toLocaleString() + " distinct species; " + Number(row.observation_records).toLocaleString() + " observation records. Statewide comparison retained."
    : "No county highlighted.";
}

function renderCurrent() {
  const filters = store.getFilters("t1");
  chart.render({ rows: sortCountyRichness(displayedRows, filters.sortOrder), selectedCounty: filters.countyCode });
  updateHighlight(filters.countyCode);
}

async function initialize() {
  try {
    const geography = await loadGeographicOptions();
    const states = geography.filter(row => row.region_level === "state");
    header = createFilterHeader({
      container: "#filters", store, chartId: "t1",
      options: {
        stateCode: states.map(row => ({ value: row.region_code, label: row.region_name })),
        countyCode: geography.filter(row => row.region_level === "county").map(row => ({ value: row.region_code, label: row.region_name }))
      }
    });
    chart = createCountyRichnessBarChart({
      container,
      tooltip: document.querySelector("#bar-tooltip"),
      onCountySelect: countyCode => store.setShared({ countyCode })
    });
    chart.clear();

    async function update({ filters, changedKeys }) {
      if (changedKeys.length && changedKeys.every(key => key === "shared.countyCode")) {
        updateHighlight(filters.countyCode);
        return;
      }
      if (changedKeys.length && changedKeys.every(key => key === "charts.t1.sortOrder")) {
        if (displayedRows.length) renderCurrent();
        return;
      }
      const currentRequest = ++requestId;
      displayedRows = [];
      chart.clear();
      selection.textContent = "No county highlighted.";
      if (!filters.stateCode) {
        status.textContent = "Select a state to compare its counties.";
        document.querySelector("#chart-title").textContent = "Select a state";
        container.setAttribute("aria-busy", "false");
        return;
      }
      const stateName = states.find(row => row.region_code === filters.stateCode)?.region_name || filters.stateCode;
      document.querySelector("#chart-title").textContent = stateName + " · 2012–2025";
      status.textContent = "Loading all counties in " + stateName + "…";
      container.setAttribute("aria-busy", "true");
      try {
        let rows = cache.get(filters.stateCode);
        if (!rows) {
          rows = await loadCountyRichness(filters.stateCode, 2012, 2025);
          cache.set(filters.stateCode, rows);
        }
        if (currentRequest !== requestId) return;
        displayedRows = rows;
        renderCurrent();
        status.textContent = rows.length
          ? "Showing all " + rows.length + " counties in " + stateName + ". Sort or select a county without removing others."
          : "No county summaries available for " + stateName + ".";
      } catch (error) {
        if (currentRequest !== requestId) return;
        status.textContent = "Unable to load county richness: " + error.message + ". Reselect a state to retry.";
      } finally {
        if (currentRequest === requestId) container.setAttribute("aria-busy", "false");
      }
    }
    unsubscribe = store.subscribe({ chartId: "t1" }, update);
    await update({ filters: store.getFilters("t1"), changedKeys: [] });
  } catch (error) {
    status.textContent = "Unable to initialize county bar chart: " + error.message;
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
