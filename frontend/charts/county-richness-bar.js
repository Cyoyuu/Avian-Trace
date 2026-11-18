import { COLORS } from "./constants.js";
import { getCountyBarLayout } from "./county-richness-bar-data.js";

// Adapt task1-chart.js's keyed joins and selection colors to a vertical county axis.
export function createCountyRichnessBarChart({ container, tooltip, onCountySelect }) {
  const root = d3.select(container).append("div").attr("class", "county-bars__layout");
  const yAxis = root.append("svg").attr("class", "county-bars__y-axis").attr("aria-hidden", "true");
  const viewport = root.append("div").attr("class", "county-bars__viewport")
    .attr("tabindex", 0).attr("role", "region")
    .attr("aria-label", "County bars and labels. Scroll horizontally to explore all counties.");
  const svg = viewport.append("svg").attr("class", "county-bars__plot")
    .attr("role", "group").attr("aria-label", "County species richness bars. Press Enter or Space to select a county.");
  const grid = svg.append("g").attr("class", "county-bars__grid").attr("aria-hidden", "true");
  const bars = svg.append("g");
  const xAxis = svg.append("g").attr("class", "county-bars__x-axis").attr("aria-hidden", "true");
  const format = d3.format(",");
  let current = null;
  let layout;
  let x;

  function hideTooltip() { tooltip.hidden = true; }

  function positionTooltip(event, node) {
    const bounds = node.getBoundingClientRect();
    const pointer = event.type.startsWith("pointer");
    const left = pointer ? event.clientX + 12 : bounds.right + 8;
    const top = pointer ? event.clientY + 12 : Math.max(8, bounds.top);
    tooltip.style.left = Math.max(8, Math.min(left, innerWidth - tooltip.offsetWidth - 8)) + "px";
    tooltip.style.top = Math.max(8, Math.min(top, innerHeight - tooltip.offsetHeight - 8)) + "px";
  }

  function showTooltip(event, county) {
    const title = document.createElement("strong");
    const richness = document.createElement("div");
    const records = document.createElement("div");
    title.textContent = county.countyName;
    richness.textContent = "Distinct species: " + format(county.speciesRichness);
    records.textContent = "Observation records: " + format(county.observationRecords);
    tooltip.replaceChildren(title, richness, records);
    tooltip.hidden = false;
    positionTooltip(event, event.currentTarget);
  }

  function setSelectedCounty(countyCode, reveal = true) {
    if (current) current.selectedCounty = countyCode;
    bars.selectAll(".county-bars__county")
      .classed("is-selected", county => county.regionCode === countyCode)
      .attr("aria-pressed", county => String(county.regionCode === countyCode));
    bars.selectAll(".county-bars__bar")
      .attr("fill", county => county.regionCode === countyCode ? COLORS.selected : COLORS.default);
    if (reveal && countyCode && x?.domain().includes(countyCode)) {
      const center = x(countyCode) + x.bandwidth() / 2;
      viewport.node().scrollLeft = Math.max(0, center - viewport.node().clientWidth / 2);
    }
  }

  function render(model) {
    current = { ...model };
    const { rows, selectedCounty } = current;
    hideTooltip();
    layout = getCountyBarLayout(rows, viewport.node().clientWidth);
    const { width, height, left, right, top, plotHeight } = layout;
    svg.attr("width", width).attr("height", height);
    yAxis.attr("width", 84).attr("height", height);
    x = d3.scaleBand().domain(rows.map(row => row.regionCode)).range([left, width - right]).padding(0.2);
    const y = d3.scaleLinear().domain([0, Math.max(1, d3.max(rows, row => row.speciesRichness) || 0)]).nice()
      .range([top + plotHeight, top]);
    const tickCount = Math.min(6, y.domain()[1]);
    yAxis.selectAll("*").remove();
    yAxis.append("g").attr("transform", "translate(76,0)").call(d3.axisLeft(y).ticks(tickCount).tickFormat(d3.format("d")));
    yAxis.append("text").attr("transform", "rotate(-90)")
      .attr("x", -(top + plotHeight / 2)).attr("y", 16).attr("text-anchor", "middle")
      .text("Number of distinct recorded species");
    grid.attr("transform", "translate(" + left + ",0)")
      .call(d3.axisLeft(y).ticks(tickCount).tickSize(-(width - left - right)).tickFormat(""));
    grid.select(".domain").remove();
    const labels = new Map(rows.map(row => [row.regionCode, row.countyName]));
    xAxis.attr("transform", "translate(0," + (top + plotHeight) + ")")
      .call(d3.axisBottom(x).tickFormat(code => labels.get(code)));
    xAxis.selectAll("text").attr("transform", "rotate(-65)").attr("text-anchor", "end")
      .attr("dx", "-0.6em").attr("dy", "0.25em");
    const counties = bars.selectAll(".county-bars__county").data(rows, county => county.regionCode)
      .join(enter => {
        const group = enter.append("g").attr("class", "county-bars__county");
        // Full-column targets make zero-height bars keyboard and pointer accessible.
        group.append("rect").attr("class", "county-bars__hit-target").attr("fill", "transparent");
        group.append("rect").attr("class", "county-bars__bar");
        group.append("line").attr("class", "county-bars__zero-marker");
        return group;
      }).order()
      .attr("transform", county => "translate(" + x(county.regionCode) + ",0)")
      .attr("data-county-code", county => county.regionCode)
      .attr("role", "button").attr("tabindex", 0)
      .attr("aria-label", county => county.countyName + ": " + format(county.speciesRichness) + " distinct species; " + format(county.observationRecords) + " observation records")
      .attr("aria-describedby", tooltip.id)
      .on("pointerenter focus", showTooltip)
      .on("pointermove", function(event) { positionTooltip(event, this); })
      .on("pointerleave blur", hideTooltip)
      .on("click", (event, county) => onCountySelect(county.regionCode))
      .on("keydown", (event, county) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onCountySelect(county.regionCode);
        }
        if (event.key === "Escape") hideTooltip();
      });
    counties.select(".county-bars__hit-target").attr("width", x.bandwidth()).attr("y", top).attr("height", plotHeight + 4);
    counties.select(".county-bars__bar").attr("width", x.bandwidth())
      .attr("y", county => y(county.speciesRichness)).attr("height", county => y(0) - y(county.speciesRichness));
    counties.select(".county-bars__zero-marker").attr("x1", 0).attr("x2", x.bandwidth())
      .attr("y1", y(0)).attr("y2", y(0)).attr("display", county => county.speciesRichness === 0 ? null : "none");
    viewport.node().scrollLeft = 0;
    setSelectedCounty(selectedCounty);
  }

  const resize = new ResizeObserver(() => { if (current && viewport.node().clientWidth !== current.viewportWidth) {
    render({ ...current, viewportWidth: viewport.node().clientWidth });
  } });
  resize.observe(viewport.node());
  return {
    render(model) { render({ ...model, viewportWidth: viewport.node().clientWidth }); },
    setSelectedCounty,
    clear() {
      current = null;
      hideTooltip();
      bars.selectAll("*").remove();
      xAxis.selectAll("*").remove();
      grid.selectAll("*").remove();
      yAxis.selectAll("*").remove();
      svg.attr("width", 0).attr("height", 0);
      yAxis.attr("height", 0);
      viewport.node().scrollLeft = 0;
    },
    destroy() { resize.disconnect(); hideTooltip(); root.remove(); }
  };
}
