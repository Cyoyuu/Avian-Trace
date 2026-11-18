import { createFilterStore } from "./filters/filter-store.js";
import { createFilterHeader } from "./components/filter-header.js";
import { loadCountyRichness, loadGeographicOptions } from "./api/info-loader.js";
import { STATE_ABBREVIATIONS } from "./helpers/geographic-codes.js";
import { getCountiesByStateId } from "./helpers/location-converter.js";
import { joinCountyRichness } from "./charts/county-choropleth-data.js";
import { createCountyChoropleth } from "./charts/county-choropleth.js";

const store = createFilterStore();
const period = { startYear: 2012, endYear: 2025 };
const status = document.querySelector("#map-status");
const mapContainer = document.querySelector("#county-map");
const selection = document.querySelector("#county-selection");
const geometryNote = document.querySelector("#geometry-note");
const cache = new Map();
let requestId = 0;
let displayedCounties = null;
let displayedRows = [];
let header;
let unsubscribe;
let chart;

function updateHighlight(countyCode) {
  chart.setSelectedCounty(countyCode);
  const selected = displayedCounties?.features.find(feature => feature.properties.regionCode === countyCode);
  if (!selected) {
    const row = displayedRows.find(row => row.region_code === countyCode);
    selection.textContent = row
      ? row.county_name + " selected: " + Number(row.species_richness).toLocaleString() + " distinct species; " + Number(row.observation_records).toLocaleString() + " observation records. No matching boundary to highlight; statewide comparison retained."
      : "No county highlighted.";
    return;
  }
  const { countyName, speciesRichness, observationRecords } = selected.properties;
  selection.textContent = speciesRichness === null
    ? countyName + " highlighted. No matching county summary."
    : countyName + " highlighted: " + speciesRichness.toLocaleString() + " distinct species; " + observationRecords.toLocaleString() + " observation records. Statewide comparison retained.";
}

async function initialize() {
  try {
    const [geography, topology] = await Promise.all([
      loadGeographicOptions(), d3.json("/data/counties-10m.json")
    ]);
    const allCounties = topojson.feature(topology, topology.objects.counties);
    const states = geography.filter(row => row.region_level === "state" && Object.values(STATE_ABBREVIATIONS).includes(row.region_code.slice(3)));
    header = createFilterHeader({
      container: "#filters", store, chartId: "t1Map",
      options: {
        stateCode: states.map(row => ({ value: row.region_code, label: row.region_name })),
        countyCode: geography.filter(row => row.region_level === "county").map(row => ({ value: row.region_code, label: row.region_name }))
      }
    });
    chart = createCountyChoropleth({
      container: mapContainer,
      tooltip: document.querySelector("#county-tooltip"),
      onCountySelect: countyCode => store.setShared({ countyCode })
    });

    async function update({ filters, changedKeys }) {
      // Highlight changes never request or filter statewide data.
      if (changedKeys.length && changedKeys.every(key => key === "shared.countyCode")) {
        updateHighlight(filters.countyCode);
        return;
      }
      const currentRequest = ++requestId;
      displayedCounties = null;
      displayedRows = [];
      chart.clear();
      geometryNote.textContent = "";
      selection.textContent = "No county highlighted.";
      if (!filters.stateCode) {
        status.textContent = "Select a state to compare its counties.";
        document.querySelector("#map-title").textContent = "Select a state";
        mapContainer.setAttribute("aria-busy", "false");
        return;
      }
      const stateName = states.find(row => row.region_code === filters.stateCode).region_name;
      document.querySelector("#map-title").textContent = stateName + " · 2012–2025";
      status.textContent = "Loading all counties in " + stateName + "…";
      mapContainer.setAttribute("aria-busy", "true");
      try {
        let rows = cache.get(filters.stateCode);
        if (!rows) {
          rows = await loadCountyRichness(filters.stateCode, period.startYear, period.endYear);
          cache.set(filters.stateCode, rows);
        }
        if (currentRequest !== requestId) return;
        displayedRows = rows;
        const stateId = Object.keys(STATE_ABBREVIATIONS).find(id => STATE_ABBREVIATIONS[id] === filters.stateCode.slice(3));
        const counties = getCountiesByStateId(stateId, allCounties);
        displayedCounties = joinCountyRichness(counties, filters.stateCode, rows);
        chart.render({ counties: displayedCounties, selectedCounty: store.getFilters("t1Map").countyCode, stateName });
        updateHighlight(store.getFilters("t1Map").countyCode);
        const codes = new Set(displayedCounties.features.map(feature => feature.properties.regionCode));
        const unmatched = rows.filter(row => !codes.has(row.region_code));
        const missing = displayedCounties.features.filter(feature => feature.properties.speciesRichness === null);
        geometryNote.textContent = [
          unmatched.length ? "County summaries without matching bundled boundaries: " + unmatched.map(row => row.county_name + " (" + Number(row.species_richness).toLocaleString() + " species; " + Number(row.observation_records).toLocaleString() + " observation records)").join("; ") + "." : "",
          missing.length ? "Gray counties have no matching summary; they are not treated as zero observations." : ""
        ].filter(Boolean).join(" ");
        status.textContent = "Showing all " + counties.features.length + " county boundaries in " + stateName + ". Select a county to highlight it.";
      } catch (error) {
        if (currentRequest !== requestId) return;
        status.textContent = "Unable to load county richness: " + error.message + ". Reselect a state to retry.";
      } finally {
        if (currentRequest === requestId) mapContainer.setAttribute("aria-busy", "false");
      }
    }
    unsubscribe = store.subscribe({ chartId: "t1Map" }, update);
    await update({ filters: store.getFilters("t1Map"), changedKeys: [] });
  } catch (error) {
    status.textContent = "Unable to initialize county map: " + error.message;
    mapContainer.setAttribute("aria-busy", "false");
  }
}

initialize();
window.addEventListener("pagehide", () => {
  requestId += 1;
  unsubscribe?.();
  header?.destroy();
  chart?.destroy();
}, { once: true });
