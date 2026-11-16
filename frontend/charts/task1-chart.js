import { 
  MARGIN, 
  WIDTH, 
  BAR_HEIGHT, 
  COLORS, 
  TRANSITION_INTERVAL 
} from "./constants.js";
import { getCountyIdFromRegionCode } from "../helpers/location-converter.js";

// Draw a horizontal bar chart to visualize Task 1: Geographic Species Richness
export function renderRichnessRankingChart(
  data, 
  selectedCounty=null, 
  onCountySelect,
  sortOrder
) {
  // Convert species richness to numbers and sort the data
  data = data
    .map(d => ({
      ...d,
      speciesRichness: Number(d.species_richness)
    }))
    .sort((a, b) => {
      return sortOrder === "asc"
        ? a.speciesRichness - b.speciesRichness
        : b.speciesRichness - a.speciesRichness;
    });

  // Calculate the height of the SVG
  const height = data.length * BAR_HEIGHT + MARGIN.top + MARGIN.bottom;

  // Create the SVG
  const container = d3.select("#richness-chart");
  const svg = container.selectAll("svg")
    .data([null])
    .join("svg")
    .attr("width", WIDTH)
    .attr("height", height);

  // Clear previous chart elements
  svg.selectAll("*").remove();

  // Main plotting area
  const chart = svg.append("g")
    .attr("class", "chart")
    .attr("transform", `translate(${MARGIN.left}, ${MARGIN.top})`);

  // X scale
  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.speciesRichness)])
    .range([0, WIDTH - MARGIN.left - MARGIN.right]);

  // Y scale
  const y = d3.scaleBand()
    .domain(data.map(d => d.county_name))
    .range([0, data.length * BAR_HEIGHT])
    .padding(0.2);

  // X axis: species richness
  chart.selectAll(".x-axis")
    .data([null])
    .join("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0, ${data.length * BAR_HEIGHT})`)
    .call(d3.axisBottom(x));

  // Y axis: county name
  chart.selectAll(".y-axis")
    .data([null])
    .join("g")
    .attr("class", "y-axis")
    .transition()
    .duration(TRANSITION_INTERVAL)
    .call(d3.axisLeft(y));

  // Title
  svg.selectAll(".chart-title")
    .data([null])
    .join("text")
    .attr("class", "chart-title")
    .attr("x", WIDTH / 2)
    .attr("y", 10)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("font-weight", "bold")
    .text("Geographic Species Richness Ranking");

  // Draw bars
  chart.selectAll(".bar")
    .data(data, d => d.region_code)
    .join(
      enter => enter.append("rect")
        .attr("class", "bar")
        .attr("x", 0)
        .attr("y", d => y(d.county_name))
        .attr("width", d => x(d.speciesRichness))
        .attr("height", y.bandwidth())
        // Highlight bar for selected county
        .attr("fill", d =>
          String(d.region_code) === String(selectedCounty)
            ? COLORS.selected
            : COLORS.default
        ),
      update => update
        .transition()
        .duration(TRANSITION_INTERVAL)
        .attr("y", d => y(d.county_name))
        .attr("width", d => x(d.speciesRichness))
        // Highlight bar for selected county
        .attr("fill", d =>
          String(d.region_code) === String(selectedCounty)
            ? COLORS.selected
            : COLORS.default
        ),
      exit => exit.remove()
    )
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      // Trigger the "handleCountySelection" function upon clicking on a bar
      onCountySelect?.(getCountyIdFromRegionCode(d.region_code));
    });

  // Values at the end of bars
  chart.selectAll(".bar-label")
  .data(data, d => d.region_code)
  .join(
    enter => enter.append("text")
      .attr("class", "bar-label")
      .attr("x", d => x(d.speciesRichness) + 5)
      .attr("y", d => y(d.county_name) + y.bandwidth() / 2)
      .attr("dy", "0.35em")
      .text(d => d.speciesRichness),

    update => update
      .transition()
      .duration(TRANSITION_INTERVAL)
      // Update the position of the labels
      .attr("x", d => x(d.speciesRichness) + 5)
      .attr("y", d => y(d.county_name) + y.bandwidth() / 2)
      // Update the position of texts on the labels
      .tween("text", function(d) {
        const current = Number(this.textContent);
        const interpolate = d3.interpolateNumber(
          current,
          d.speciesRichness
        );

        return function(t) {
          d3.select(this).text(Math.round(interpolate(t)));
        };
      }),

    exit => exit.remove()
  )
  .style("font-size", "11px");
}