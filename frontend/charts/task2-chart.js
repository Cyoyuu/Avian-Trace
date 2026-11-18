
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


/** Responsive standalone adaptation of the existing yearly line and point chart. */
export function createObservationTrendsChart({ container, tooltip }) {
  const svg = d3.select(container).append("svg").attr("class", "observation-trends__plot")
    .attr("role", "group").attr("aria-label", "Yearly observation records for the selected species")
    .attr("width", 0).attr("height", 0);
  let current = null;
  const format = d3.format(",");
  const hideTooltip = () => { tooltip.hidden = true; };

  function positionTooltip(event, node) {
    const bounds = node.getBoundingClientRect();
    const pointer = event.type.startsWith("pointer");
    const left = pointer ? event.clientX + 12 : bounds.right + 8;
    const top = pointer ? event.clientY + 12 : bounds.top;
    tooltip.style.left = Math.max(8, Math.min(left, innerWidth - tooltip.offsetWidth - 8)) + "px";
    tooltip.style.top = Math.max(8, Math.min(top, innerHeight - tooltip.offsetHeight - 8)) + "px";
  }

  function showTooltip(event, point) {
    const year = document.createElement("strong");
    const records = document.createElement("div");
    year.textContent = "Year: " + point.year;
    records.textContent = "Observation records: " + format(point.observationRecords);
    tooltip.replaceChildren(year, records);
    tooltip.hidden = false;
    positionTooltip(event, event.currentTarget);
  }

  function render(model) {
    const width = Math.max(720, container.clientWidth);
    const height = 480;
    const margin = { ...MARGIN, top: 24, bottom: 60 };
    const { series, startYear, endYear } = model;
    current = { ...model, viewportWidth: container.clientWidth };
    hideTooltip();
    svg.attr("width", width).attr("height", height).selectAll("*").remove();
    // A one-year range has one centered point, with an integer year tick.
    const x = d3.scaleLinear().domain(startYear === endYear ? [startYear - 0.5, endYear + 0.5] : [startYear, endYear])
      .range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, Math.max(1, d3.max(series, point => point.observationRecords) || 0)])
      .nice().range([height - margin.bottom, margin.top]);
    const tickCount = Math.min(6, y.domain()[1]);
    const grid = svg.append("g").attr("class", "observation-trends__grid").attr("aria-hidden", "true")
      .attr("transform", "translate(" + margin.left + ",0)")
      .call(d3.axisLeft(y).ticks(tickCount).tickSize(-(width - margin.left - margin.right)).tickFormat(""));
    grid.select(".domain").remove();
    svg.append("g").attr("class", "observation-trends__axis").attr("aria-hidden", "true")
      .attr("transform", "translate(0," + (height - margin.bottom) + ")")
      .call(d3.axisBottom(x).tickValues(series.map(point => point.year)).tickFormat(d3.format("d")));
    svg.append("g").attr("class", "observation-trends__axis").attr("aria-hidden", "true")
      .attr("transform", "translate(" + margin.left + ",0)")
      .call(d3.axisLeft(y).ticks(tickCount).tickFormat(format));
    svg.append("text").attr("class", "observation-trends__axis-label")
      .attr("x", margin.left + (width - margin.left - margin.right) / 2).attr("y", height - 14)
      .attr("text-anchor", "middle").text("Year");
    svg.append("text").attr("class", "observation-trends__axis-label")
      .attr("transform", "rotate(-90)").attr("x", -(height - margin.bottom + margin.top) / 2)
      .attr("y", 20).attr("text-anchor", "middle").text("Number of observation records");
    const line = d3.line().defined(point => point.observationRecords !== null)
      .x(point => x(point.year)).y(point => y(point.observationRecords));
    svg.append("path").datum(series).attr("class", "observation-trends__line")
      .attr("d", line).attr("fill", "none").attr("stroke", COLORS.selected).attr("stroke-width", 2.5);
    const points = svg.append("g").selectAll(".observation-trends__point")
      .data(series.filter(point => point.observationRecords !== null), point => point.year)
      .join("g").attr("class", "observation-trends__point")
      .attr("data-year", point => point.year)
      .attr("transform", point => "translate(" + x(point.year) + "," + y(point.observationRecords) + ")")
      .attr("tabindex", 0).attr("role", "img")
      .attr("aria-label", point => point.year + ": " + format(point.observationRecords) + " observation records")
      .attr("aria-describedby", tooltip.id)
      .on("pointerenter focus", showTooltip)
      .on("pointermove", function(event) { positionTooltip(event, this); })
      .on("pointerleave blur", hideTooltip)
      .on("keydown", event => { if (event.key === "Escape") hideTooltip(); });
    points.append("circle").attr("r", 11).attr("fill", "transparent");
    points.append("circle").attr("class", "observation-trends__dot").attr("r", 4)
      .attr("fill", COLORS.selected).attr("pointer-events", "none");
    if (!series.some(point => point.observationRecords !== null)) {
      svg.append("text").attr("x", (width + margin.left) / 2).attr("y", height / 2)
        .attr("text-anchor", "middle").text("No processed observation summaries available");
    }
  }

  const resize = new ResizeObserver(() => {
    if (current && current.viewportWidth !== container.clientWidth) render(current);
  });
  resize.observe(container);
  return {
    render,
    clear() { current = null; hideTooltip(); svg.selectAll("*").remove(); svg.attr("width", 0).attr("height", 0); },
    destroy() { resize.disconnect(); hideTooltip(); svg.remove(); }
  };
}
