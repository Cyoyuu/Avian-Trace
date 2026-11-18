import { createFilterStore } from "./filters/filter-store.js";
import { CHART_FILTER_DEFINITIONS } from "./filters/filter-definitions.js";
import { createFilterHeader } from "./components/filter-header.js";
import { loadGeographicOptions, loadSpeciesTrend } from "./api/info-loader.js";
import { loadTaxonNameMap } from "./helpers/taxon-converter.js";
import { buildYearlyTrendSeries } from "./charts/observation-trends-data.js";
import { createObservationTrendsChart } from "./charts/task2-chart.js";

const store = createFilterStore();
const container = document.querySelector("#trend-chart");
const status = document.querySelector("#trend-status");
const coverage = document.querySelector("#coverage-note");
let header;
let chart;
let unsubscribe;
let requestId = 0;

async function initialize() {
  try {
    const [geography, taxa] = await Promise.all([loadGeographicOptions(), loadTaxonNameMap()]);
    header = createFilterHeader({
      container: "#filters", store, chartId: "t2",
      options: {
        stateCode: geography.filter(row => row.region_level === "state").map(row => ({ value: row.region_code, label: row.region_name })),
        countyCode: geography.filter(row => row.region_level === "county").map(row => ({ value: row.region_code, label: row.region_name })),
        taxonId: [...taxa.entries()].map(([value, label]) => ({ value, label }))
      }
    });
    chart = createObservationTrendsChart({ container, tooltip: document.querySelector("#trend-tooltip") });

    async function update({ filters }) {
      const currentRequest = ++requestId;
      chart.clear();
      coverage.textContent = "";
      if (!filters.stateCode || !filters.taxonId) {
        status.textContent = "Select a state and species. Choose a county to narrow the area.";
        document.querySelector("#trend-title").textContent = "Select an area and species";
        document.querySelector("#trend-context").textContent = "";
        container.setAttribute("aria-busy", "false");
        return;
      }
      const regionCode = filters.countyCode || filters.stateCode;
      const regionLevel = filters.countyCode ? "county" : "state";
      const regionName = geography.find(row => row.region_code === regionCode)?.region_name || regionCode;
      const speciesName = taxa.get(filters.taxonId) || filters.taxonId;
      const season = CHART_FILTER_DEFINITIONS.t2.season.options.find(option => option.value === filters.season);
      document.querySelector("#trend-title").textContent = speciesName + " in " + regionName;
      document.querySelector("#trend-context").textContent = regionName + " · " + filters.startYear + "–" + filters.endYear + " · " + season.label;
      status.textContent = "Loading yearly observation records…";
      container.setAttribute("aria-busy", "true");
      try {
        const rows = await loadSpeciesTrend(regionCode, regionLevel, filters.taxonId, filters.startYear, filters.endYear, filters.season);
        if (currentRequest !== requestId) return;
        if (!rows.length) {
          status.textContent = "No matching species or geographic reference was found.";
          return;
        }
        const series = buildYearlyTrendSeries(rows, filters.startYear, filters.endYear);
        chart.render({ series, startYear: filters.startYear, endYear: filters.endYear });
        const unavailable = series.filter(point => point.observationRecords === null).map(point => point.year);
        status.textContent = "Showing " + series.length + (series.length === 1 ? " year: " : " years: ") + (series.length - unavailable.length) + " available, " + unavailable.length + " unavailable.";
        coverage.textContent = unavailable.length
          ? "No processed summary for: " + unavailable.join(", ") + ". Line gaps indicate unavailable data, not zero observations."
          : series.every(point => point.observationRecords === 0)
            ? "No observation records for this species in the selected area, years, and season."
            : "All selected years have processed observation summaries.";
      } catch (error) {
        if (currentRequest === requestId) status.textContent = "Unable to load observation trends: " + error.message + ". Change a filter to retry.";
      } finally {
        if (currentRequest === requestId) container.setAttribute("aria-busy", "false");
      }
    }
    unsubscribe = store.subscribe({ chartId: "t2" }, update);
    await update({ filters: store.getFilters("t2") });
  } catch (error) {
    status.textContent = "Unable to initialize observation trends: " + error.message;
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
