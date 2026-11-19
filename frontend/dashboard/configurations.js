// Five common slots stay mounted; only the analysis slot changes.
export const DASHBOARD_CONFIGURATIONS = Object.freeze({
  seasonal: Object.freeze({ label: "Dashboard A — Seasonal Analysis", chartId: "t2Heatmap" }),
  overlap: Object.freeze({ label: "Dashboard B — Species Overlap", chartId: "t4UpSet" })
});

export function getDashboardConfiguration(key) {
  if (!Object.hasOwn(DASHBOARD_CONFIGURATIONS, key)) throw new Error("Unknown dashboard configuration");
  return DASHBOARD_CONFIGURATIONS[key];
}

// Read the existing selection, rather than synchronizing a second hotspot store.
export function selectedCombinationSource(store) {
  return {
    getIds: () => store.getFilters("t4").selectedCombinationIds,
    keys: ["charts.t4.selectedCombinationIds"]
  };
}
