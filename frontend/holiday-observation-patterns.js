import { createFilterStore } from "./filters/filter-store.js";
import { createFilterHeader } from "./components/filter-header.js";
import { loadGeographicOptions, loadHolidayObservations } from "./api/info-loader.js";
import { loadTaxonNameMap } from "./helpers/taxon-converter.js";
import { buildHolidaySeries } from "./charts/holiday-observations-data.js";
import { createHolidayObservationsChart } from "./charts/holiday-observations-chart.js";

const store = createFilterStore();
const container = document.querySelector("#holiday-chart");
const status = document.querySelector("#holiday-status");
const coverage = document.querySelector("#coverage-note");
let chart;
let header;
let unsubscribe;
let requestId = 0;

async function initialize() {
  try {
    const [geography, taxa] = await Promise.all([loadGeographicOptions(), loadTaxonNameMap()]);
    header = createFilterHeader({
      container: "#filters", store, chartId: "t3", options: {
        stateCode: geography.filter(row => row.region_level === "state").map(row => ({ value: row.region_code, label: row.region_name })),
        countyCode: geography.filter(row => row.region_level === "county").map(row => ({ value: row.region_code, label: row.region_name })),
        taxonId: [...taxa.entries()].map(([value, label]) => ({ value, label }))
      }
    });
    chart = createHolidayObservationsChart({ container, tooltip: document.querySelector("#holiday-tooltip") });

    async function update({ filters }) {
      const currentRequest = ++requestId;
      chart.clear();
      coverage.textContent = "";
      if (!filters.countyCode || !filters.taxonId) {
        status.textContent = "Select a county and species. State narrows the county choices.";
        document.querySelector("#holiday-title").textContent = "Select a county and species";
        document.querySelector("#holiday-context").textContent = "";
        container.setAttribute("aria-busy", "false");
        return;
      }
      const name = geography.find(row => row.region_code === filters.countyCode)?.region_name || filters.countyCode;
      document.querySelector("#holiday-title").textContent = (taxa.get(filters.taxonId) || filters.taxonId) + " in " + name;
      document.querySelector("#holiday-context").textContent = name + " · " + filters.startYear + "–" + filters.endYear + " · actual holidays versus all other dates";
      status.textContent = "Loading daily observation averages…";
      container.setAttribute("aria-busy", "true");
      try {
        const rows = await loadHolidayObservations(filters.countyCode, filters.taxonId, filters.startYear, filters.endYear);
        if (currentRequest !== requestId) return;
        if (!rows.length) {
          status.textContent = "No matching county or species reference found.";
          return;
        }
        const series = buildHolidaySeries(rows, filters.startYear, filters.endYear);
        chart.render({ series, startYear: filters.startYear, endYear: filters.endYear });
        const missing = series.filter(point => point.holidayAverage === null);
        status.textContent = "Showing " + series.length + (series.length === 1 ? " year: " : " years: ") + (series.length - missing.length) + " available, " + missing.length + " unavailable.";
        coverage.textContent = missing.length
          ? "Unavailable summaries: " + missing.map(point => point.year + " (" + point.reason + ")").join("; ") + ". Gaps are not zero observations."
          : "Daily averages use all calendar days in each group, including zero-observation days.";
      } catch (error) {
        if (currentRequest === requestId) status.textContent = "Unable to load holiday patterns: " + error.message + ". Change a filter to retry.";
      } finally {
        if (currentRequest === requestId) container.setAttribute("aria-busy", "false");
      }
    }
    unsubscribe = store.subscribe({ chartId: "t3" }, update);
    await update({ filters: store.getFilters("t3") });
  } catch (error) {
    status.textContent = "Unable to initialize holiday patterns: " + error.message;
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
