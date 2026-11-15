// Draw a horizontal bar chart to visualize Task 1: Geographic Species Richness
export function renderRichnessRankingChart(data, 
                                           selectedCounty=null, 
                                           onCountySelect, 
                                           sortOrder) {
  // Convert species_richness to numbers and sort the data
  data = data
    .map(d => ({
      ...d,
      species_richness: Number(d.species_richness)
    }))
    .sort((a, b) => {
      return sortOrder === "asc"
        ? a.species_richness - b.species_richness
        : b.species_richness - a.species_richness;
    });
  
  const container = d3.select("#richness-chart");

  const margin = {
    top: 15,
    right: 35,
    bottom: 35,
    left: 100
  };

  const width = 450;
  const barHeight = 25;
  const height = data.length * barHeight + margin.top + margin.bottom;

  const svg = container.selectAll("svg")
    .data([null])
    .join("svg")
    .attr("width", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`);

  const chart = svg.selectAll(".chart")
    .data([null])
    .join("g")
    .attr("class", "chart")
    .attr("transform",
      `translate(${margin.left}, ${margin.top})`);

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => +d.species_richness)])
    .nice()
    .range([0, width - margin.left - margin.right]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.county_name))
    .range([0, data.length * barHeight])
    .padding(0.2);

  // X axis
  chart.selectAll(".x-axis")
    .data([null])
    .join("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0, ${data.length * barHeight})`)
    .call(d3.axisBottom(x));

  // Y axis
  chart.selectAll(".y-axis")
    .data([null])
    .join("g")
    .attr("class", "y-axis")
    .transition()
    .duration(750)
    .call(d3.axisLeft(y));

  // Title
  svg.selectAll(".chart-title")
    .data([null])
    .join("text")
    .attr("class", "chart-title")
    .attr("x", width / 2)
    .attr("y", 10)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("font-weight", "bold")
    .text("Geographic Species Richness Ranking");

  // Bars
  chart.selectAll(".bar")
    .data(data, d => d.region_code)
    .join(
      enter => enter.append("rect")
        .attr("class", "bar")
        .attr("x", 0)
        .attr("y", d => y(d.county_name))
        .attr("width", d => x(d.species_richness))
        .attr("height", y.bandwidth())
        .attr("fill", d =>
          String(d.region_code) === String(selectedCounty)
            ? "#2563eb"
            : "#93c5fd"
        ),

      update => update
        .transition()
        .duration(750)
        .attr("y", d => y(d.county_name))
        .attr("width", d => x(d.species_richness))
        .attr("fill", d =>
          String(d.region_code) === String(selectedCounty)
            ? "#2563eb"
            : "#93c5fd"
        ),

      exit => exit.remove()
    )
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      onCountySelect?.(d.region_code);
    });

  // Values at the end of bars
  chart.selectAll(".bar-label")
  .data(data, d => d.region_code)
  .join(
    enter => enter.append("text")
      .attr("class", "bar-label")
      .attr("x", d => x(d.species_richness) + 5)
      .attr("y", d => y(d.county_name) + y.bandwidth() / 2)
      .attr("dy", "0.35em")
      .text(d => d.species_richness),

    update => update
      .transition()
      .duration(750)
      .attr("x", d => x(d.species_richness) + 5)
      .attr("y", d => y(d.county_name) + y.bandwidth() / 2)
      .tween("text", function(d) {
        const current = Number(this.textContent);
        const interpolate = d3.interpolateNumber(
          current,
          d.species_richness
        );

        return function(t) {
          d3.select(this).text(Math.round(interpolate(t)));
        };
      }),

    exit => exit.remove()
  )
  .style("font-size", "11px");
}