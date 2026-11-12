// JSON data on states and counties: https://github.com/topojson/us-atlas

// Test the map: "npm start", then http://127.0.0.1:3000/us-map-test.html


// ====================================================================
// Configurations
// ====================================================================

// Size of the SVG (i.e. the US map)
const WIDTH = 960;
const HEIGHT = 600;

// The mapping of state ID (from TopoJSON) to state abbreviations
const STATE_ABBREVIATIONS = {
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

// Colors for the state and county polygons
const MAP_COLORS = {
  default: "#bfdbfe",
  hover: "#60a5fa",
  selected: "#60a5fa",
  border: "white" // border between states or between counties
};

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

// Tooltip which displays detailed information when hover over a county
const countyTooltip = d3.select("body")
  .append("div")
  .attr("class", "county-tooltip")
  .style("position", "absolute") // make the tooltip follow the cursor rather than placed at the bottom
  .style("visibility", "hidden");

// Keep track of the current state of the map, which updates per every user interaction with the map
const mapState = {
  currentView: "state",   // state view or county view
  currentStateCode: null, // the ID of the currently selected state (null when in state view)
  currentCounties: [],    // the list of counties in the selected state
  selectedCountyId: null, // the ID of the selected county
  countyPath: null        // D3 geographic path generator; calculates county boundaries and geographic positions on the map
};

// ====================================================================
// Tooltip Functions
// ====================================================================

// Display the tooltip
function showCountyTooltip(event, countyName) {
  countyTooltip
    .style("visibility", "visible")
    .style("left", `${event.pageX + 10}px`)
    .style("top", `${event.pageY + 10}px`)
    .html(""); // clear existing tooltip content before displaying information for another county

  countyTooltip
    .append("strong")
    .text("County: ");

  countyTooltip
    .append("span")
    .text(countyName);
}

// Make the tooltip follow cursor movement
function moveCountyTooltip(event) {
  countyTooltip
    .style("left", `${event.pageX + 10}px`)
    .style("top", `${event.pageY + 10}px`);
}

// Hide the tooltip
function hideCountyTooltip() {
  countyTooltip.style("visibility", "hidden");
}

// ====================================================================
// Back Button Function
// ====================================================================

// Add functionalities to the back button
function setUpBackButton() {
  d3.select("#backButton")
    .on("click", function() {
      // Hide county sidebar
      d3.select(".county-sidebar")
        .style("display", "none");

      // Clear content in county search bar
      d3.select("#county-search")
        .property("value", "");

      // Reset the county count
      d3.select("#county-count")
        .text("");

      // Clear the county list
      d3.select("#county-list")
        .selectAll("*")
        .remove();
      
      // Display the state view of the map
      showStateView();
    });
}

// ====================================================================
// County View
// ====================================================================

// Filter counties which belongs to the selected state
function getCountiesByState(stateCode, allCounties) {
  return {
    type: "FeatureCollection",
    // Each county ID is represented by a 5-digit code. We filter counties by 
    // the first two digits of the code, which correspond to the ID of a state
    features: allCounties.features.filter(d =>
      String(d.id).padStart(5, "0").slice(0, 2) === stateCode
    )
  };
}

// Update county colors based on selection
function updateCountyColors() {
  svg.selectAll(".county")
    .attr("fill", d => {
      return String(d.id) === String(mapState.selectedCountyId)
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
  mapState.selectedCountyId = countyId;

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

// Initialize the county-searching mechanism in the sidebar
function setUpSearch() {
  d3.select("#county-search")
  .on("input", function() {
    // Obtain the user input on the county-search text field
    const userInput = this.value.toLowerCase().trim();

    // Filter and display the counties which contains the user input,
    // and hide those which do not
    d3.select("#county-list")
      .selectAll("li")
      .style("display", d =>
        d.properties.name.toLowerCase().includes(userInput)
          ? null
          : "none"
      );
  });
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
      String(d.id) === String(mapState.selectedCountyId)
    )
    .on("click", (event, d) => {
      selectCounty(d.id);
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
      const isSelected = String(d.id) === String(mapState.selectedCountyId);
      if (!isSelected) d3.select(this).attr("fill", MAP_COLORS.hover);
      showCountyTooltip(event, d.properties.name);
    })
    // Make the tooltip follow the cursor movement
    .on("mousemove", function(event) {
      moveCountyTooltip(event);
    })
    // Update color and hide tooltip upon exiting from hovering the county
    .on("mouseout", function(event, d) {
      const isSelected = String(d.id) === String(mapState.selectedCountyId);
      d3.select(this).attr(
        "fill",
        isSelected ? MAP_COLORS.selected : MAP_COLORS.default
      );
      hideCountyTooltip();
    })
    // Select the county upon clicking its corresponding polygon
    .on("click", function(event, d) {
      selectCounty(d.id);
    });

  // Create a text label for displaying the name of the selected county
  svg.append("text")
    .attr("class", "county-label");
}

// Switch to county view
async function showCountyView(stateCode) {
  // Update map state upon entering county view
  mapState.currentView = "county";
  mapState.currentStateCode = stateCode;
  mapState.selectedCountyId = null;

  // Display the back button
  d3.select("#backButton")
    .style("display", "block");

  // Display the sidebar
  d3.select(".county-sidebar")
    .style("display", "flex");

  // Load county data and filter counties which belongs to the selected state
  const allCounties = await loadCountyData();
  const counties = getCountiesByState(stateCode, allCounties);

  // Update map state
  mapState.currentCounties = counties.features;

  // Render map (county polygons) and the sidebar
  renderCountyMap(counties);
  renderCountyList(counties.features);
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
  const stateNames = new Map(
    states.features.map(d => [d.id, d.properties.name])
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
      console.log("Selected state:", stateNames.get(d.id));
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
async function showStateView() {
  // Update map state upon entering the state view
  mapState.currentView = "state";
  mapState.currentStateCode = null;
  mapState.selectedCountyId = null;
  mapState.currentCounties = [];

  // Hide the back button
  d3.select("#backButton")
    .style("display", "none");

  // Hide the sidebar
  d3.select(".county-sidebar")
    .style("display", "none");

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

  try {
    // Render the map with the state view
    await showStateView();
  } catch (error) {
    console.error("Failed to initialize map:", error);
  }
}
initializeMap();