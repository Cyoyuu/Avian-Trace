import { combinationKey } from "./location-combinations-data.js";

// Reuse the county bars' fixed Y-axis, scrollable X-axis and full-column interaction targets.
export function createLocationCombinationChart({ d3 = globalThis.d3, sizing = {}, presentation = "standalone", container, tooltip, onSelect }) {
  const compact = presentation === "compact";
  const root = d3.select(container).append("div").attr("class", "combination-chart");
  const fixed = root.append("svg").attr("class", "combination-chart__y").attr("aria-hidden", "true");
  const viewport = root.append("div").attr("class", "combination-chart__viewport").attr("tabindex", 0)
    .attr("role", "region").attr("aria-label", "Combination bars. Scroll horizontally to read all labels.");
  const svg = viewport.append("svg").attr("role", "group").attr("aria-label", "Hotspot combination richness. Enter or Space selects a combination.");
  let model;
  const hide = () => { tooltip.hidden = true; };
  function show(event, row) {
    const title = document.createElement("strong");
    title.textContent = row.richness + " distinct recorded species" + (row.isBest ? " · greatest richness (ties included)" : "");
    const items = row.locations.map(location => {
      const item = document.createElement("div"); item.textContent = location.name + " [" + location.id + "]"; return item;
    });
    tooltip.replaceChildren(title, ...items); tooltip.hidden = false;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.type.startsWith("pointer") ? event.clientX + 12 : bounds.left;
    const y = event.type.startsWith("pointer") ? event.clientY + 12 : bounds.top;
    tooltip.style.left = Math.max(8, Math.min(x, document.documentElement.clientWidth - tooltip.offsetWidth - 8)) + "px";
    tooltip.style.top = Math.max(8, Math.min(y, document.documentElement.clientHeight - tooltip.offsetHeight - 8)) + "px";
  }
  function render(next) {
    const focusedKey = container.contains(document.activeElement) ? document.activeElement.getAttribute("data-combination") : null;
    model = next; hide();
    const { rows, maximum, selectedIds } = model;
    const width = Math.max(compact ? 280 : 600, viewport.node().clientWidth, rows.length * (compact ? 84 : 125) + 40);
    const top = compact ? 12 : 20, bottom = compact ? 84 : 160;
    const baseline = compact ? Math.max(85, container.clientHeight-bottom-16) : (sizing.plotHeight ?? 350);
    svg.attr("width", width).attr("height", baseline + bottom);
    fixed.attr("width", 78).attr("height", baseline + bottom);
    svg.selectAll("*").remove(); fixed.selectAll("*").remove();
    const x = d3.scaleBand().domain(rows.map(row => row.key)).range([16, width-16]).padding(0.22);
    const y = d3.scaleLinear().domain([0, Math.max(1, maximum)]).nice().range([baseline, top]);
    const ticks = Math.min(6, y.domain()[1]);
    fixed.append("g").attr("transform", "translate(70,0)").call(d3.axisLeft(y).ticks(ticks).tickFormat(d3.format("d")));
    fixed.append("text").attr("transform", "rotate(-90)").attr("x", compact ? -(top+baseline)/2 : -185).attr("y", 15).attr("text-anchor", "middle").text(compact ? "Distinct species" : "Distinct recorded species");
    svg.append("g").attr("class", "combination-chart__grid").attr("transform", "translate(16,0)")
      .call(d3.axisLeft(y).ticks(ticks).tickSize(-(width-32)).tickFormat(""));
    const groups = svg.append("g").selectAll("g").data(rows, row => row.key).join("g")
      .attr("class", "combination-chart__combination").attr("transform", row => "translate(" + x(row.key) + ",0)")
      .attr("tabindex", 0).attr("role", "button").attr("data-combination", row => row.key)
      .attr("aria-describedby", tooltip.id)
      .attr("aria-pressed", row => String(row.key === combinationKey(selectedIds)))
      .attr("aria-label", row => row.label + ": " + row.richness + " distinct species" + (row.isBest ? "; greatest richness" : ""))
      .on("pointerenter focus", show).on("pointermove", show).on("pointerleave blur", hide)
      .on("click", (event, row) => { hide(); onSelect(row.locationIds); })
      .on("keydown", (event, row) => {
        if (event.key === "Escape") hide();
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); hide(); onSelect(row.locationIds); }
      });
    groups.append("rect").attr("class", "combination-chart__target").attr("width", x.bandwidth()).attr("height", baseline).attr("fill", "transparent");
    groups.append("rect").attr("class", "combination-chart__bar").attr("width", x.bandwidth())
      .attr("y", row => y(row.richness)).attr("height", row => baseline-y(row.richness))
      .attr("fill", row => row.isBest ? "#cb681c" : "#377ca8");
    groups.append("text").attr("x", x.bandwidth()/2).attr("y", row => y(row.richness)-5).attr("text-anchor", "middle").text(row => row.richness);
    groups.append("text").attr("class", "combination-chart__label").attr("x", x.bandwidth()/2).attr("y", baseline+(compact?18:23))
      .attr("text-anchor", "middle").each(function(row) {
        row.locations.forEach((location, index) => d3.select(this).append("tspan").attr("x", x.bandwidth()/2).attr("dy", index ? (compact ? "1.1em" : "1.65em") : 0)
          .text((index ? "+ " : "") + (location.name.length > (compact?11:16) ? location.name.slice(0,compact?10:15) + "…" : location.name)));
      });
    if (focusedKey) groups.filter(row => row.key === focusedKey).node()?.focus();
    svg.append("text").attr("x", width/2).attr("y", baseline+bottom-10).attr("text-anchor", "middle").text("Combination of hotspot locations");
  }
  const observer = new ResizeObserver(() => { if (model) render(model); }); observer.observe(container);
  return { render, clear() { model = undefined; hide(); svg.selectAll("*").remove(); fixed.selectAll("*").remove(); svg.attr("height",0); fixed.attr("height",0); }, destroy() { observer.disconnect(); hide(); root.remove(); } };
}
