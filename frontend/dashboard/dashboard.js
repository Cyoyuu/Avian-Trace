import { createFilterHeader } from "../components/filter-header.js";
import { createFilterOptions } from "../helpers/filter-options.js";
import { STATE_ABBREVIATIONS } from "../helpers/geographic-codes.js";
import { mountCountyChoropleth } from "../visualizations/t1/county-choropleth-view.js";
import { mountCountyRichnessBar } from "../visualizations/t1/county-richness-bar-view.js";
import { mountObservationTrends } from "../visualizations/t2/observation-trends-view.js";
import { mountHolidayObservationPatterns } from "../visualizations/t3/holiday-observation-patterns-view.js";
import { mountLocationCombinations } from "../visualizations/t4/location-combinations-view.js";
import { mountSeasonalSpeciesHeatmap } from "../visualizations/t2/seasonal-species-heatmap-view.js";
import { mountHotspotSpeciesOverlap } from "../visualizations/t4/hotspot-species-overlap-view.js";
import { DASHBOARD_CONFIGURATIONS, getDashboardConfiguration, selectedCombinationSource } from "./configurations.js";

/** Composition owns headers and panel lifetimes; all rendering belongs to existing views. */
export function mountDashboard({ container, store, data, geography, taxa, d3, topojson, configuration = "seasonal" }) {
  getDashboardConfiguration(configuration);
  const document = container.ownerDocument;
  const root = document.createElement("div");
  root.className = "dashboard-shell";
  root.innerHTML = `
    <header class="dashboard-header">
      <div class="dashboard-brand">
        <h1>Avian Trace</h1>
        <span class="dashboard-subtitle">U.S. eBird observations · 2012–2025</span>
        <label class="dashboard-configuration">View <select aria-label="Dashboard configuration"></select></label>
        <p class="dashboard-guidance" role="status">Select a state, county and species. T4: choose hotspots, then select a combination for overlap.</p>
      </div>
      <div data-dashboard-shared aria-label="Shared dashboard filters"></div>
    </header>
    <div class="dashboard-grid">
      <div class="dashboard-row dashboard-row--geography">
        <section class="dashboard-panel" data-panel="map" aria-label="T1 County Choropleth"></section>
        <section class="dashboard-panel" data-panel="bars" aria-label="T1 County Richness Bar Chart"></section>
      </div>
      <div class="dashboard-row dashboard-row--trends">
        <section class="dashboard-panel" data-panel="trends" aria-label="T2 Observation Trends"></section>
        <section class="dashboard-panel" data-panel="holiday" aria-label="T3 Holiday Observation Patterns"></section>
      </div>
      <div class="dashboard-row dashboard-row--coverage">
        <section class="dashboard-panel" data-panel="analysis" aria-label="Seasonal species analysis"></section>
        <section class="dashboard-panel" data-panel="combinations" aria-label="T4 Hotspot Combination Bar Chart"></section>
      </div>
    </div>`;
  container.append(root);
  const select = root.querySelector(".dashboard-configuration select");
  for (const [key, value] of Object.entries(DASHBOARD_CONFIGURATIONS)) {
    const option = document.createElement("option"); option.value = key; option.textContent = value.label; select.append(option);
  }
  const sharedHeader = createFilterHeader({
    container: root.querySelector("[data-dashboard-shared]"), store, scope: "shared",
    options: createFilterOptions(geography, taxa, { stateCodes: Object.values(STATE_ABBREVIATIONS).map(code => "US-" + code) })
  });
  const dependencies = { store, data, geography, taxa, d3, topojson, presentation: "compact" };
  const common = [];
  let disposed = false, current = null, interchangeable, intersectionIds = [];

  function mountPanel(name, chartId, mount, options = {}) {
    const host = root.querySelector('[data-panel="' + name + '"]');
    const view = mount({ ...dependencies, container: host, ...options });
    const header = createFilterHeader({ container: view.controls, store, chartId, scope: "chart" });
    return { ready: view.ready, destroy() { header.destroy(); view.destroy(); } };
  }
  function switchConfiguration(key) {
    const next = getDashboardConfiguration(key);
    if (disposed || current === key) return interchangeable?.ready ?? Promise.resolve();
    const host = root.querySelector('[data-panel="analysis"]');
    if (host.contains(document.activeElement)) select.focus();
    interchangeable?.destroy();
    current = key; root.dataset.configuration = key; select.value = key;
    host.setAttribute("aria-label", next.label);
    if (key === "seasonal") {
      interchangeable = mountPanel("analysis", next.chartId, mountSeasonalSpeciesHeatmap);
    } else {
      interchangeable = mountPanel("analysis", next.chartId, mountHotspotSpeciesOverlap, {
        selection: selectedCombinationSource(store),
        initialIntersectionIds: intersectionIds,
        onIntersectionSelect: ids => { intersectionIds = ids; }
      });
    }
    return interchangeable.ready;
  }
  function onConfigurationChange() { switchConfiguration(select.value); }
  select.addEventListener("change", onConfigurationChange);
  // An intersection highlight is meaningful only for the same county/combination.
  const unsubscribe = store.subscribe({ keys: ["shared.countyCode", "charts.t4.selectedCombinationIds"] }, () => { intersectionIds = []; });
  common.push(mountPanel("map", "t1Map", mountCountyChoropleth));
  common.push(mountPanel("bars", "t1", mountCountyRichnessBar));
  common.push(mountPanel("trends", "t2", mountObservationTrends));
  common.push(mountPanel("holiday", "t3", mountHolidayObservationPatterns));
  common.push(mountPanel("combinations", "t4", mountLocationCombinations, {
    onExploreOverlap() {
      document.activeElement?.closest("dialog")?.close();
      switchConfiguration("overlap");
    }
  }));
  const ready = Promise.all([...common.map(panel => panel.ready), switchConfiguration(configuration)]);
  return {
    root, ready, setConfiguration: switchConfiguration,
    destroy() {
      if (disposed) return; disposed = true;
      select.removeEventListener("change", onConfigurationChange); unsubscribe();
      interchangeable?.destroy(); common.forEach(panel => panel.destroy()); sharedHeader.destroy(); root.remove();
    }
  };
}
