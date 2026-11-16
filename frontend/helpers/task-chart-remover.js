// IDs of visualizations for each task
const Chart_CONTAINERS = [
  "#richness-chart",
  "#obsrv-trend-chart"
];

// Remove the charts for each task
export function clearCharts() {
  Chart_CONTAINERS.forEach(selector => {
    d3.select(selector)
      .selectAll("*")
      .remove();
  });
}