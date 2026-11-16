// Tooltip which displays detailed information when hover over a county
const countyTooltip = d3.select("body")
  .append("div")
  .attr("class", "county-tooltip")
  .style("position", "absolute") // make the tooltip follow the cursor rather than placed at the bottom
  .style("visibility", "hidden");

// Display the tooltip
export function showCountyTooltip(event, countyName) {
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
export function moveCountyTooltip(event) {
  countyTooltip
    .style("left", `${event.pageX + 10}px`)
    .style("top", `${event.pageY + 10}px`);
}

// Hide the tooltip
export function hideCountyTooltip() {
  countyTooltip.style("visibility", "hidden");
}