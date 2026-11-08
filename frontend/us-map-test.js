// JSON data on states and counties: https://github.com/topojson/us-atlas


// County Tooltip
const countyTooltip = d3.select("body")
  .append("div")
  .attr("class", "county-tooltip")
  .style("position", "absolute")
  .style("visibility", "hidden");

// Geographic data (not loaded yet)
const stateDataPromise = d3.json("/data/states-10m.json");
const countyDataPromise = d3.json("/data/counties-10m.json");

// ====================================================================

// County view of the selected state
async function showCountyView(stateCode) {
  // Display the back button when inside county view
  d3.select("#backButton")
    .style("display", "block");

  // Load county data
  const us = await countyDataPromise;

  // Convert TopoJSON to GeoJSON to work with D3's geographic functions
  const allCounties = topojson.feature(
    us,
    us.objects.counties
  );

  // Filter counties belonging to the selected state
  // Each county ID is represented by a 5-digit code. We filter counties by 
  // the first two digits of the code, which correspond to the ID of a state
  const counties = {
    type: "FeatureCollection",
    features: allCounties.features.filter(d =>
      String(d.id).padStart(5, "0").slice(0, 2) === stateCode
    )
  };

  // Get a mapping of county ID to county name
  const countyNames = new Map(
    counties.features.map(d => [d.id, d.properties.name])
  );

  // Using Albers projection to visualize counties in a state of the U.S. better
  const projection = d3.geoAlbers()
    .fitSize([width, height], counties);

  // Convert geographic data into SVG path instructions
  const path = d3.geoPath()
    .projection(projection);

  // Empty the SVG to make space for the county view
  svg.selectAll("*").remove();

  // Draw counties
  svg.selectAll(".county")
    .data(counties.features)
    .join("path")
    .attr("class", "county")
    .attr("d", path)
    .attr("fill", "#bfdbfe")
    .attr("stroke", "white")
    .attr("stroke-width", 1)
    .style("cursor", "pointer")

    // Mouse hovering
    .on("mouseover", function (event, d) {
      // Highlight the hovering county
      d3.select(this).attr("fill", "#60a5fa")

      // Display the county tooltip
      const countyName = countyNames.get(d.id);
      countyTooltip
        .style("visibility", "visible")
        .html("")
        .append("strong")
        .text("County: ");
      countyTooltip
        .append("span")
        .text(countyName);
    })

    // Mouse moving
    .on("mousemove", function (event) {
      // Make the county tooltip follow mouse movement
      countyTooltip
        .style("left", `${event.pageX + 10}px`)
        .style("top",  `${event.pageY + 10}px`);
    })

    // Mouse exit hovering
    .on("mouseout", function () {
      // De-highlight the hovered county
      d3.select(this).attr("fill", "#bfdbfe");

      // Hide the county tooltip
      countyTooltip.style("visibility", "hidden");
    })

    // Mouse clicking
    .on("click", function (event, d) {
      const countyName = countyNames.get(d.id);
      console.log("Selected county:", countyName);    
    });

  // Add county labels to each county on the county view of the map
  svg.append("g")
    .attr("class", "county-labels")
    .selectAll("text")
    .data(counties.features)
    .join("text")
    .attr("class", "county-label")
    .attr("transform", d => {
      const [x, y] = path.centroid(d);
      return `translate(${x}, ${y})`;
    })
    .text(d => d.properties.name.replace(" County", ""));
}

// ====================================================================

const stateAbbreviations = {
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

// State view of the map
async function showStateView() {
  // Hide the back button when inside state view
  d3.select("#backButton")
    .style("display", "none");

  // Load state data
  const us = await stateDataPromise;

  // Convert TopoJSON to GeoJSON to work with D3's geographic functions
  const states = topojson.feature(
    us,
    us.objects.states
  );

  // Get a mapping of state ID to state name
  const stateNames = new Map(
    states.features.map(d => [d.id, d.properties.name])
  );

  // Using Albers USA projection to visualize the entire U.S. better 
  const projection = d3.geoAlbersUsa()
    .fitSize([width, height], states);

  // Convert geographic data into SVG path instructions
  const path = d3.geoPath()
    .projection(projection);

  // Empty the SVG to make space for the state view
  svg.selectAll("*").remove();

  // Draw states
  svg.selectAll("path")
    .data(states.features)
    .join("path")
    .attr("d", path)
    .attr("fill", "#bfdbfe")
    .attr("stroke", "white")
    .attr("stroke-width", 1)
    .style("cursor", "pointer")

    // Highlight upon hovering
    .on("mouseover", function(event, d) {
      d3.select(this).attr("fill", "#60a5fa");
    })

    // De-highlight upon exiting
    .on("mouseout", function(event, d) {
      d3.select(this).attr("fill", "#bfdbfe");
    })

    // Zoom in to the corresponding state upon clicking
    .on("click", function (event, d) {
      const stateName = stateNames.get(d.id);
      console.log("Selected state:", stateName);
      // Ensures the passed state ID has 2 digits
      showCountyView(String(d.id).padStart(2, "0"));
    });

  // Filter out states with invalid projected centroids
  // This is needed due to the fact that some states
  // run into error when calculating the label position
  // using function path.centroid()
  const validStates = states.features.filter(d => {
    const centroid = path.centroid(d);
    return centroid.every(Number.isFinite);
  });

  // Add state abbereviation to each valid state on the map
  svg.selectAll(".state-label")
    .data(validStates)
    .join("text")
    .attr("class", "state-label")
    .attr("transform", d => {
      const [x, y] = path.centroid(d);
      return `translate(${x}, ${y})`;
    })
    .text(d => {
      const stateCode = String(d.id).padStart(2, "0");
      return stateAbbreviations[stateCode];
    });
}

function setUpBackButton() {
  d3.select("#backButton")
    .on("click", () => {
      showStateView();
    });
}

// ====================================================================

const width = 960;
const height = 600;

const svg = d3.select("#map")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

setUpBackButton();
showStateView();