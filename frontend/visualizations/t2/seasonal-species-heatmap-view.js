import { buildSpeciesHeatmap } from "./species-heatmap-data.js";
import { createSpeciesHeatmap } from "./species-heatmap.js";
import { createVisualizationFrame } from "../../components/visualization-frame.js";

const HTML = `
<p id="heatmap-status" role="status" aria-live="polite">Loading geographic options…</p>
      <h2 id="heatmap-title">Select a state</h2>
      <p id="heatmap-context"></p>
      <div id="species-heatmap" aria-busy="true" tabindex="0" role="region" aria-label="Monthly observation totals. Scroll horizontally on narrow screens to see all months."></div>
      <p id="coverage-note" aria-live="polite"></p>
      <p class="species-heatmap-page__note">Cell values are observation totals aggregated across the selected years, not monthly averages. Darker blue means more records. Hover or focus a cell to inspect its species, month, and total.</p>
      <p class="species-heatmap-page__note">Species are selected by total observation records across all twelve months before display sorting. A zero means no matching records in processed data; it does not establish that a species was absent. Shared single-species selections and the trends chart's season do not restrict this heatmap.</p>
<div id="heatmap-tooltip" class="species-heatmap__tooltip" role="tooltip" hidden></div>
`;

export function mountSeasonalSpeciesHeatmap({ container: host, store, data, geography, taxa, d3 = globalThis.d3, sizing = {} }) {
  const frame = createVisualizationFrame({ container: host, html: HTML, className: "species-heatmap-page" });
  const { elements } = frame;
  let disposed = false;
  const { loadSpeciesHeatmap } = data;

  const status = elements["heatmap-status"];
  const container = elements["species-heatmap"];
  const coverage = elements["coverage-note"];
  let rows = [];
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
      chart = createSpeciesHeatmap({ d3, sizing, container, tooltip: elements["heatmap-tooltip"] });
      async function update({ filters, changedKeys }) {
        if (disposed) return;
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
          elements["heatmap-title"].textContent = "Select a state";
          elements["heatmap-context"].textContent = "";
          container.setAttribute("aria-busy", "false");
          return;
        }
        const regionCode = filters.countyCode || filters.stateCode;
        const regionLevel = filters.countyCode ? "county" : "state";
        const name = geography.find(row => row.region_code === regionCode)?.region_name || regionCode;
        elements["heatmap-title"].textContent = "Top species in " + name;
        elements["heatmap-context"].textContent = "Observation totals aggregated across " + filters.startYear + "–" + filters.endYear + " · all twelve months";
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
          if (disposed) return;
          if (currentRequest === requestId) status.textContent = "Unable to load species heatmap: " + error.message + ". Change a filter to retry.";
        } finally {
          if (currentRequest === requestId) container.setAttribute("aria-busy", "false");
        }
      }
      unsubscribe = store.subscribe({ chartId: "t2Heatmap" }, update);
      await update({ filters: store.getFilters("t2Heatmap"), changedKeys: [] });
    } catch (error) {
          if (disposed) return;
      status.textContent = "Unable to initialize species heatmap: " + error.message;
      container.setAttribute("aria-busy", "false");
    }
  }
  const ready = initialize();
  return { root: frame.root, ready, destroy() {
    if (disposed) return; disposed = true;
    requestId++;
    unsubscribe?.();

    chart?.destroy(); frame.destroy();
  } };
}
