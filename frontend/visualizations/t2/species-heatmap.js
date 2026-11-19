import { MONTH_NAMES } from "./species-heatmap-data.js";

export function createSpeciesHeatmap({ d3 = globalThis.d3, sizing = {}, container, tooltip }) {
  const svg = d3.select(container).append("svg").attr("class", "species-heatmap__plot")
    .attr("role", "group").attr("aria-label", "Monthly observation totals by species")
    .attr("width", 0).attr("height", 0);
  const format = d3.format(",");
  let current;
  const hideTooltip = () => { tooltip.hidden = true; };

  function positionTooltip(event, node) {
    const box = node.getBoundingClientRect();
    const pointer = event.type.startsWith("pointer");
    const left = pointer ? event.clientX + 12 : box.right + 8;
    const top = pointer ? event.clientY + 12 : box.top;
    tooltip.style.left = Math.max(8, Math.min(left, innerWidth - tooltip.offsetWidth - 8)) + "px";
    tooltip.style.top = Math.max(8, Math.min(top, innerHeight - tooltip.offsetHeight - 8)) + "px";
  }

  function showTooltip(event, cell) {
    const species = document.createElement("strong");
    const month = document.createElement("div");
    const records = document.createElement("div");
    species.textContent = cell.speciesName;
    month.textContent = MONTH_NAMES[cell.month - 1];
    records.textContent = cell.observationRecords === null ? "Observation total: unavailable" : "Observation total: " + format(cell.observationRecords);
    tooltip.replaceChildren(species, month, records);
    tooltip.hidden = false;
    positionTooltip(event, event.currentTarget);
  }

  function render(model) {
    const { species, startYear, endYear } = model;
    current = { ...model, viewportWidth: container.clientWidth };
    hideTooltip();
    const left = Math.max(180, (d3.max(species, item => item.speciesName.length * 7.5) || 0) + 36);
    const top = 94;
    const width = Math.max(container.clientWidth, left + 12 * 64 + 24);
    const height = top + species.length * 30 + 104;
    svg.attr("width", width).attr("height", height).selectAll("*").remove();
    const x = d3.scaleBand().domain(d3.range(1, 13)).range([left, width - 24]).padding(0.03);
    const y = d3.scaleBand().domain(species.map(item => item.taxonId)).range([top, top + species.length * 30]).padding(0.06);
    const cells = species.flatMap(item => item.cells);
    const max = Math.max(1, d3.max(cells, cell => cell.observationRecords) || 0);
    const color = d3.scaleSequential(d3.interpolateBlues).domain([0, max]);
    svg.append("g").attr("class", "species-heatmap__month-axis").attr("aria-hidden", "true")
      .attr("transform", "translate(0," + (top - 8) + ")")
      .call(d3.axisTop(x).tickSize(0).tickFormat(month => MONTH_NAMES[month - 1]))
      .call(axis => axis.select(".domain").remove())
      .selectAll("text").attr("transform", "rotate(-45)").attr("text-anchor", "start").attr("dx", "0.3em");
    const names = new Map(species.map(item => [item.taxonId, item.speciesName]));
    svg.append("g").attr("class", "species-heatmap__species-axis").attr("aria-hidden", "true")
      .attr("transform", "translate(" + (left - 8) + ",0)")
      .call(d3.axisLeft(y).tickSize(0).tickFormat(id => names.get(id)))
      .call(axis => axis.select(".domain").remove());
    svg.append("text").attr("x", 14).attr("y", top - 14).text("Bird species");
    svg.append("g").selectAll(".species-heatmap__cell").data(cells, cell => cell.taxonId + ":" + cell.month)
      .join("rect").attr("class", "species-heatmap__cell")
      .attr("x", cell => x(cell.month)).attr("y", cell => y(cell.taxonId))
      .attr("width", x.bandwidth()).attr("height", y.bandwidth())
      .attr("fill", cell => cell.observationRecords === null ? "#d1d5db" : color(cell.observationRecords))
      .attr("data-taxon-id", cell => cell.taxonId).attr("data-month", cell => cell.month)
      .attr("tabindex", 0).attr("role", "img").attr("aria-describedby", tooltip.id)
      .attr("aria-label", cell => cell.speciesName + ", " + MONTH_NAMES[cell.month - 1] + ": " +
        (cell.observationRecords === null ? "unavailable" : format(cell.observationRecords) + " observation records") +
        " across " + startYear + "–" + endYear)
      .on("pointerenter focus", showTooltip)
      .on("pointermove", function(event) { positionTooltip(event, this); })
      .on("pointerleave blur", hideTooltip)
      .on("keydown", event => { if (event.key === "Escape") hideTooltip(); });
    const legend = svg.append("g").attr("class", "species-heatmap__legend")
      .attr("transform", "translate(" + left + "," + (height - 72) + ")");
    legend.append("text").attr("y", 0).text("Observation totals across " + startYear + "–" + endYear + " · darker means more records");
    legend.selectAll("rect").data(d3.range(64)).join("rect")
      .attr("x", index => index * 4).attr("y", 12).attr("width", 4.1).attr("height", 12)
      .attr("fill", index => color(index / 63 * max));
    legend.append("g").attr("transform", "translate(0,24)")
      .call(d3.axisBottom(d3.scaleLinear().domain([0, max]).range([0, 256]))
        .tickValues([...new Set([0, Math.round(max / 2), max])]).tickFormat(format));
    if (cells.some(cell => cell.observationRecords === null)) {
      legend.append("rect").attr("x", 292).attr("y", 12).attr("width", 12).attr("height", 12).attr("fill", "#d1d5db");
      legend.append("text").attr("x", 312).attr("y", 23).text("Unavailable");
    }
  }
  const resize = new ResizeObserver(() => { if (current && current.viewportWidth !== container.clientWidth) render(current); });
  resize.observe(container);
  return {
    render,
    clear() { current = null; hideTooltip(); svg.selectAll("*").remove(); svg.attr("width", 0).attr("height", 0); },
    destroy() { resize.disconnect(); hideTooltip(); svg.remove(); }
  };
}
