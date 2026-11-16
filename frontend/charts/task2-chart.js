
import { 
  MARGIN, 
  WIDTH, 
  HEIGHT,
  COLORS,
  TRANSITION_INTERVAL
} from "./constants.js";

// Draw a line chart to visualize Task 2: Long-Term Observation Trends
export function renderSpeciesTrendChart(
  data=null,
  regionName="the US",
  startYear=2012,
  endYear=2025
) {
  // Convert each year into Jan. 1st of that year
  if (data) {
    data = data.map(d => ({
      year: new Date(Number(d.year), 0, 1),
      observationRecords: Number(d.observation_records)
    }));
  }

  // Create the SVG
  const container = d3.select("#obsrv-trend-chart");
  const svg = container.selectAll("svg")
    .data([null])
    .join("svg")
    .attr("width", WIDTH)
    .attr("height", HEIGHT);

  // Clear previous chart elements
  svg.selectAll("*").remove();

  // Main plotting area
  const chart = svg.append("g")
    .attr("class", "chart")
    .attr("transform", `translate(${MARGIN.left}, ${MARGIN.top})`);

  // Title
  svg.selectAll(".chart-title")
    .data([null])
    .join("text")
    .attr("class", "chart-title")
    .attr("x", WIDTH / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("font-weight", "bold")
    .text(`Observation Trends on Target in ${regionName}`);

  // Empty state
  if (!data || data.length === 0) {
    // Text to inform user to select both the location (state/county) and a species
    svg.append("text")
      .attr("x", WIDTH / 2)
      .attr("y", HEIGHT / 2)
      .attr("text-anchor", "middle")
      .attr("fill", COLORS.emptyStateText)
      .text("Select a location and species");
    return;
  }

  // X scale
  const x = d3.scaleTime()
    .domain([
      new Date(startYear, 0, 1),
      new Date(endYear, 11, 31)
    ])
    .range([0, WIDTH - MARGIN.left - MARGIN.right]);

  // Y scale
  const maxValue = d3.max(data, d => d.observationRecords) || 100;
  const y = d3.scaleLinear()
    .domain([0, maxValue * 1.1])
    .range([HEIGHT - MARGIN.top - MARGIN.bottom, 0]);

  // X axis: year
  chart.selectAll(".x-axis")
    .data([null])
    .join("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0, ${HEIGHT - MARGIN.top - MARGIN.bottom})`)
    .transition()
    .duration(TRANSITION_INTERVAL)
    .call(d3.axisBottom(x))
    // Rotate the labels on x-axis a bit to make them fit
    .selection()
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .attr("text-anchor", "end");

  // Y axis: number of observations
  chart.selectAll(".y-axis")
    .data([null])
    .join("g")
    .attr("class", "y-axis")
    .transition()
    .duration(TRANSITION_INTERVAL)
    .call(d3.axisLeft(y));

  // Calculate the line
  const line = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.observationRecords));

  // Draw a circle for each observation point
  chart.selectAll(".data-point")
    .data(data)
    .join("circle")
    .attr("class", "data-point")
    .attr("cx", d => x(d.year))
    .attr("cy", d => y(d.observationRecords))
    .attr("r", 4)
    .attr("fill", "steelblue");

  // Draw the line
  chart.selectAll(".trend-line")
    .data([null])
    .join("path")
    .datum(data)
    .attr("class", "trend-line")
    .attr("fill", "none") // no fillings for the line
    .attr("stroke", "steelblue") // the color of the line
    .attr("stroke-width", 2) // thickness of the line
    .transition()
    .duration(TRANSITION_INTERVAL)
    .attr("d", line);
}
