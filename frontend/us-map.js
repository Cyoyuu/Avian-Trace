// JSON data on states and counties: https://github.com/topojson/us-atlas

// Test the map: "npm start", then http://127.0.0.1:3000/us-map.html

import { 
  loadRichnessRanking, 
  loadSpeciesTrend 
} from "./api/info-loader.js";
import { renderRichnessRankingChart } from "./charts/task1-chart.js";
import { renderSpeciesTrendChart } from "./charts/task2-chart.js";
import { 
  getCountyIdFromRegionCode,
  getCountiesByStateId 
} from "./helpers/location-converter.js";
import { loadTaxonNameMap } from "./helpers/taxon-converter.js";
import { setUpBackButton } from "./helpers/backbutton-initializer.js";
import { setUpSearch } from "./helpers/searchbar-initializer.js";
import { 
  showCountyTooltip,
  moveCountyTooltip,
  hideCountyTooltip
} from "./helpers/tooltip-handler.js";
import { clearCharts } from "./helpers/task-chart-remover.js";

// ====================================================================
// Configurations
// ====================================================================

// Size of the SVG (i.e. the US map)
const WIDTH = 960;
const HEIGHT = 600;

// The mapping of state ID (from TopoJSON) to state abbreviations
export const STATE_ABBREVIATIONS = {
    "01": "AL", "02": "AK", "04": "AZ",
    "05": "AR", "06": "CA", "08": "CO",
    "09": "CT", "10": "DE", "11": "DC",
    "12": "FL", "13": "GA", "15": "HI",
    "16": "ID", "17": "IL", "18": "IN",
    "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD",
    "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT",
    "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY",
    "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA",
    "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT",
    "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY"
};

// The mapping of state ID (from TopoJSON) to the fullname of the corresponding state
let STATE_ID_TO_NAME_MAP = new Map();

// The mapping of taxon ID to taxon common name
// Each taxon ID has its own unique species common name
const TAXON_ID_TO_NAME_MAP = await loadTaxonNameMap();

// Colors for the state and county polygons
const MAP_COLORS = {
  default: "#bfdbfe",
  hover: "#60a5fa",
  selected: "#60a5fa",
  border: "white" // border between states or between counties
};

// Limit for Task 1
const RICHNESS_RANKING_LIMIT = 10;

// ====================================================================
// Data Loading
// ====================================================================

// Geographic data (not yet loaded)
const stateDataPromise = d3.json("/data/states-10m.json");
const countyDataPromise = d3.json("/data/counties-10m.json");

// Load the state data of the US map
async function loadStateData() {
  // Load the TopoJSON state data
  const us = await stateDataPromise;

  // Convert TopoJSON to GeoJSON to work with D3's geographic functions
  return topojson.feature(us, us.objects.states);
}

// Load the county data of the US map
async function loadCountyData() {
  // Load the TopoJSON county data
  const us = await countyDataPromise;

  // Convert TopoJSON to GeoJSON to work with D3's geographic functions
  return topojson.feature(us, us.objects.counties);
}

// ====================================================================
// Components
// ====================================================================

// The US map
const svg = d3.select("#map")
  .append("svg")
  .attr("width", WIDTH)
  .attr("height", HEIGHT);

// Keep track of the current state of the map, which updates per every user interaction with the map
const mapState = {
  currentView: "state",   // state view or county view
  currentStateId: null,   // the ID of the currently selected state (null when in state view)
  currentCounties: [],    // the list of counties in the selected state
  currentCountyId: null, // the ID of the selected county
  countyPath: null,       // D3 geographic path generator; calculates county boundaries and geographic positions on the map
  currentRichnessRanking: [],  // the richness ranking of counties within the selected state
  currentTaxonId: null,   // the taxon of the current interested species (e.g. "avibase-00AF5DA1")
  currentStartYear: 2012, // the start of the year filter
  currentEndYear: 2025    // the end of the year filter
};

// Keep track of the current state of the task charts
const taskChartState = {
  sortOrder: "desc"       // the global sort order for values in each task chart
}

// ====================================================================
// Sort Button Function
// ====================================================================

// Add functionalities to the sort button
function setUpSortButton() {
  d3.select("#sortButton")
    .on("click", function() {
      // Update the sort order
      taskChartState.sortOrder = taskChartState.sortOrder === "desc" ? "asc" : "desc";

      // Update sort button label
      d3.select(this).text(
        taskChartState.sortOrder === "desc"
          ? "Richness: High to Low ↓"
          : "Richness: Low to High ↑"
      );

      let regionCode = null;
      if (mapState.currentCountyId) {
        // Retrieve the state id from county id
        const stateId = mapState.currentCountyId.slice(0, 2);
        // Convert state id to state abbreviation
        const abbreviation = STATE_ABBREVIATIONS[stateId];
        // Compose region code using state abbreviation and the last 3 digits of county id
        regionCode = `US-${abbreviation}-${mapState.currentCountyId.slice(2)}`;
      } else {
        regionCode = null
      }

      // Update the bar chart for Task 1
      renderRichnessRankingChart(
        mapState.currentRichnessRanking,
        regionCode,
        handleCountySelection,
        taskChartState.sortOrder);
    });
}

// ====================================================================
// Apply Trend Filters Button Function
// ====================================================================

function setUpApplyTrendFiltersButton() {
  d3.select("#applyTrendFiltersButton")
    .on("click", function() {
      // Retrieve inputs
      const taxonId = d3.select("#speciesSelect").property("value");
      const startYear = Number(d3.select("#startYear").property("value"));
      const endYear = Number(d3.select("#endYear").property("value"));

      // Validate inputs
      if (!taxonId) {
        alert("Please select a species.");
        return;
      }
      if (
        !Number.isInteger(startYear) ||
        !Number.isInteger(endYear) ||
        startYear < 2012 ||
        endYear > 2025 ||
        startYear > endYear
      ) {
        alert("Please enter a valid year range.");
        return;
      }

      // Update mapState
      mapState.currentTaxonId = taxonId;
      mapState.currentStartYear = startYear;
      mapState.currentEndYear = endYear;

      // Initialize the line chart for Task 2
      processSpecialTrendChart(
        getRegionCode(), 
        getRegionLevel(), 
        mapState.currentTaxonId, 
        mapState.currentStartYear, 
        mapState.currentEndYear
      );
    });
}

// ====================================================================
// Function Helpers
// ====================================================================

// Obtain the region code based on map state
function getRegionCode() {
  if (mapState.currentView !== "county") return null;

  const stateId = mapState.currentStateId;
  const abbreviation = STATE_ABBREVIATIONS[stateId];

  if (mapState.currentCountyId) {
    const countyId = String(mapState.currentCountyId).padStart(5, "0");
    return `US-${abbreviation}-${countyId.slice(2)}`;
  }

  return `US-${abbreviation}`;
}

// Obtain the region level based on map state
function getRegionLevel() {
  if (mapState.currentView !== "county") return null;
  return mapState.currentCountyId ? "county" : "state";
}

// Convert region code (e.g., "US-MA" or "US-MA-017") to its corresponding county name
function getCountyNameFromRegionCode(regionCode) {
  // Obtain the county id
  const countyId = getCountyIdFromRegionCode(regionCode);

  // Look up the current counties within the selected state
  // and check for a match in county id
  const county = mapState.currentCounties.find(d =>
    String(d.id).padStart(5, "0") === countyId
  );

  // Return the name of the county, if found a match
  return county ? county.properties.name : "Unknown County";
}

// Add a dropdown menu which contains a full list of species common names
function populateSpeciesDropdown() {
  d3.select("#speciesSelect")
    .selectAll("option.species-option")
    .data([...TAXON_ID_TO_NAME_MAP.entries()])
    .join("option")
    .attr("class", "species-option")
    .attr("value", d => d[0])
    .text(d => d[1]);
}

// ====================================================================
// Shared Things for Both Views
// ====================================================================

async function processSpecialTrendChart(regionCode, regionLevel, taxonId, startYear, endYear) {
  const regionName = !regionLevel
    ? "the US"
    : regionLevel === "state"
      ? STATE_ID_TO_NAME_MAP.get(mapState.currentStateId)
      : getCountyNameFromRegionCode(regionCode);

  // Display an empty chart if no selection on region level or taxon
  if (!regionCode || !regionLevel || !taxonId) {
    renderSpeciesTrendChart(null, regionName, startYear, endYear);
    return;
  }

  const data = await loadSpeciesTrend(
    regionCode,
    regionLevel,
    taxonId,
    startYear,
    endYear
  );

  console.log("Selected region:", regionCode);
  console.log("Returned data:", data);
  console.log("Number of rows:", data?.length);
  console.table(data);

  renderSpeciesTrendChart(data, regionName, startYear, endYear);
}

// ====================================================================
// County View
// ====================================================================

// Update county colors based on selection
function updateCountyColors() {
  svg.selectAll(".county")
    .attr("fill", d => {
      return String(d.id) === String(mapState.currentCountyId)
        ? MAP_COLORS.selected
        : MAP_COLORS.default;
    });
}

// Select a county for inspection
function selectCounty(countyId) {
  // Proceed only if the selected county is within the currently selected state
  const selected = mapState.currentCounties.find(d =>
    String(d.id) === String(countyId)
  );
  if (!selected) return;
  mapState.currentCountyId = countyId;

  // Update map highlighting on county selection
  updateCountyColors();

  // Update sidebar selection on county selection
  d3.select("#county-list")
    .selectAll("li")
    .classed("selected", d =>
      String(d.id) === String(countyId)
    );

  // Update county label to display the name of the selected county in the center of the corresponding polygon
  const [x, y] = mapState.countyPath.centroid(selected);
  svg.select(".county-label")
    .attr("transform", `translate(${x}, ${y})`)
    .text(selected.properties.name);
  console.log(`Selected county: ${selected.properties.name}`);
}

// Select the county and update task charts accordingly
function handleCountySelection(countyId) {
  // Retrieve the state id from county id
  const stateId = countyId.slice(0, 2);
  // Convert state id to state abbreviation
  const abbreviation = STATE_ABBREVIATIONS[stateId];
  // Compose region code using state abbreviation and the last 3 digits of county id
  const regionCode = `US-${abbreviation}-${countyId.slice(2)}`;

  // Update map and sidebar
  selectCounty(countyId);

  // Update the bar chart for Task 1
  renderRichnessRankingChart(
    mapState.currentRichnessRanking,
    regionCode,
    handleCountySelection,
    taskChartState.sortOrder
  );

  // Update the line chart for Task 2 (county view)
  processSpecialTrendChart(
    getRegionCode(), 
    getRegionLevel(), 
    mapState.currentTaxonId, 
    mapState.currentStartYear, 
    mapState.currentEndYear
  );
}

// Render the county sidebar
function renderCountyList(counties) {
  // Sort the county names alphabetically
  const sortedCounties = [...counties].sort((a, b) =>
    a.properties.name.localeCompare(b.properties.name)
  );

  // Display the number of counties inside the selected state
  d3.select("#county-count")
    .text(`${sortedCounties.length} counties`);

  // Append the sorted counties to the county list, and
  // enable the on-click funcitonality on each list element
  d3.select("#county-list")
    .selectAll("li")
    .data(sortedCounties)
    .join("li")
    .attr("data-county-id", d => d.id)
    .text(d => d.properties.name)
    .classed("selected", d =>
      String(d.id) === String(mapState.currentCountyId)
    )
    .on("click", (event, d) => {
      // Select the county and update task charts accordingly
      handleCountySelection(d.id); // county id
    });
}

// Render the county polygons
function renderCountyMap(counties) {
  // Use the Albers projection to display the counties within a state
  // and fit them within the specified map dimensions
  const projection = d3.geoAlbers()
    .fitSize([WIDTH, HEIGHT], counties);

  // D3 geographic path generator; calculates county boundaries and geographic positions on the map
  const path = d3.geoPath()
    .projection(projection);
  mapState.countyPath = path;

  // Reset the exisint content on the SVG before rendering the county view of the map
  svg.selectAll("*").remove();

  // Draw the polygons of the counties, and add functionalities to mouse events
  svg.selectAll(".county")
    .data(counties.features)
    .join("path")
    .attr("class", "county")
    .attr("d", path)
    .attr("fill", MAP_COLORS.default)
    .attr("stroke", MAP_COLORS.border)
    .attr("stroke-width", 1)
    .style("cursor", "pointer")
    // Update color and display tooltip for the hovering county
    .on("mouseover", function(event, d) {
      const isSelected = String(d.id) === String(mapState.currentCountyId);
      if (!isSelected) d3.select(this).attr("fill", MAP_COLORS.hover);
      showCountyTooltip(event, d.properties.name);
    })
    // Make the tooltip follow the cursor movement
    .on("mousemove", function(event) {
      moveCountyTooltip(event);
    })
    // Update color and hide tooltip upon exiting from hovering the county
    .on("mouseout", function(event, d) {
      const isSelected = String(d.id) === String(mapState.currentCountyId);
      d3.select(this).attr(
        "fill",
        isSelected ? MAP_COLORS.selected : MAP_COLORS.default
      );
      hideCountyTooltip();
    })
    // Select the county upon clicking its corresponding polygon
    .on("click", function(event, d) {
      // Select the county and update task charts accordingly
      handleCountySelection(d.id); // county id
    });

  // Create a text label for displaying the name of the selected county
  svg.append("text")
    .attr("class", "county-label");
}

// Switch to county view
async function showCountyView(stateId) {
  // Update map state upon entering county view
  mapState.currentView = "county";
  mapState.currentStateId = stateId;
  mapState.currentCountyId = null;

  // Display the back button
  d3.select("#backButton")
    .style("display", "block");

  // Display the sort button
  d3.select("#sortButton")
    .style("display", "block");

  // Display the sidebar
  d3.select(".county-sidebar")
    .style("display", "flex");

  // Load county data and filter counties which belongs to the selected state
  const allCounties = await loadCountyData();
  const counties = getCountiesByStateId(stateId, allCounties);

  // Update map state
  mapState.currentCounties = counties.features;

  // Get the abbreviation of the selected state as part of
  // the state code argument used for loading richness ranking
  const stateAbbreviation = STATE_ABBREVIATIONS[stateId];
  // Load richness ranking for selected state
  mapState.currentRichnessRanking = await loadRichnessRanking(
    "county", 
    `US-${stateAbbreviation}`, 
    2012, 
    2025,
    RICHNESS_RANKING_LIMIT,
    taskChartState.sortOrder
  );
  // Add county name to each of the element of the data returned
  mapState.currentRichnessRanking = mapState.currentRichnessRanking.map(d => ({
    ...d,
    county_name: getCountyNameFromRegionCode(d.region_code)
  }));

  // Render map (county polygons) and the sidebar
  renderCountyMap(counties);
  renderCountyList(counties.features);

  // Render the initial bar chart for Task 1 without a selected county
  renderRichnessRankingChart(
    mapState.currentRichnessRanking, 
    null, 
    handleCountySelection,
    taskChartState.sortOrder
  );

  // Update the line chart for Task 2 (state view)
  processSpecialTrendChart(
    getRegionCode(),
    getRegionLevel(),
    mapState.currentTaxonId,
    mapState.currentStartYear,
    mapState.currentEndYear
  );
}

// ================================================================
// State View
// ================================================================

// Render the state polygons
function renderStateMap(states) {
  // Use the Albers USA projection to display the states of the US
  // and fit them within the specified map dimensions
  const projection = d3.geoAlbersUsa()
    .fitSize([WIDTH, HEIGHT], states);

  // D3 geographic path generator; calculates state boundaries and geographic positions on the map
  const path = d3.geoPath()
    .projection(projection);

  // The mapping of state ID (from TopoJSON) to the fullname of the corresponding state
  STATE_ID_TO_NAME_MAP = new Map(
    states.features.map(d => [
      String(d.id).padStart(2, "0"),
      d.properties.name
    ])
  );

  // Reset the exisint content on the SVG before rendering the county view of the map
  svg.selectAll("*").remove();

  // Draw the polygons of the states, and add functionalities to mouse events  
  svg.selectAll(".state")
    .data(states.features)
    .join("path")
    .attr("class", "state")
    .attr("d", path)
    .attr("fill", MAP_COLORS.default)
    .attr("stroke", MAP_COLORS.border)
    .attr("stroke-width", 1)
    .style("cursor", "pointer")
    // Update color for the hovering state
    .on("mouseover", function() {
      d3.select(this).attr("fill", MAP_COLORS.hover);
    })
    // Update color upon exiting from hovering the state
    .on("mouseout", function() {
      d3.select(this).attr("fill", MAP_COLORS.default);
    })
    // Select the state upon clicking its corresponding polygon,
    // and display the county view of the map (which is about the selected state)
    .on("click", function(event, d) {
      console.log("Selected state:", STATE_ID_TO_NAME_MAP.get(d.id));
      showCountyView(
        String(d.id).padStart(2, "0")
      );
    });

  // Display the state abbreviations in the center of the each state polygon
  const validStates = states.features.filter(d => {
    return path.centroid(d).every(Number.isFinite);
  });
  svg.selectAll(".state-label")
    .data(validStates)
    .join("text")
    .attr("class", "state-label")
    .attr("transform", d => {
      const [x, y] = path.centroid(d);
      return `translate(${x}, ${y})`;
    })
    .text(d => {
      const code = String(d.id).padStart(2, "0");
      return STATE_ABBREVIATIONS[code];
    });
}

// Switch to state view
export async function showStateView() {
  // Update map state upon entering the state view
  mapState.currentView = "state";
  mapState.currentStateId = null;
  mapState.currentCountyId = null;
  mapState.currentCounties = [];

  // Hide the back button
  d3.select("#backButton")
    .style("display", "none");

  // Hide the sort button
  d3.select("#sortButton")
    .style("display", "none");

  // Hide the sidebar
  d3.select(".county-sidebar")
    .style("display", "none");

  // Remove the charts for each task
  clearCharts()

  // Hide the tooltip (which should only be used inside county view)
  hideCountyTooltip();

  // Load state data
  const states = await loadStateData();

  // Render map (state polygons)
  renderStateMap(states);
}

// ====================================================================
// Initialization
// ====================================================================

// Render the US map, which defaults in state view
async function initializeMap() {
  // Initialize the county-search mechanism of the sidebar in county view
  setUpSearch();
  // Initialize the back button in county view
  setUpBackButton();
  // Initialize the sort button
  setUpSortButton();
  // Initialize trend filters
  populateSpeciesDropdown();
  setUpApplyTrendFiltersButton();

  try {
    // Render the map with the state view
    await showStateView();

    // Render an empty chart for Task 2 on default
    renderSpeciesTrendChart();
  } catch (error) {
    console.error("Failed to initialize map:", error);
  }
}
initializeMap();