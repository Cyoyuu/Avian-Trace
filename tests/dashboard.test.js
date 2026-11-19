import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { DASHBOARD_CONFIGURATIONS, getDashboardConfiguration, selectedCombinationSource } from "../frontend/dashboard/configurations.js";
import { createFilterStore } from "../frontend/filters/filter-store.js";

test("dashboard configurations swap only the analysis view and reject unknown modes", () => {
  assert.deepEqual(Object.keys(DASHBOARD_CONFIGURATIONS), ["seasonal", "overlap"]);
  assert.equal(getDashboardConfiguration("seasonal").chartId, "t2Heatmap");
  assert.equal(getDashboardConfiguration("overlap").chartId, "t4UpSet");
  assert.throws(() => getDashboardConfiguration("toString"));
  assert.throws(() => getDashboardConfiguration("other"));
});
test("dashboard UpSet reads the existing combination and clears atomically with geography", () => {
  const store = createFilterStore(), selection = selectedCombinationSource(store);
  assert.equal(selection.setIds, undefined);
  const updates = [];
  store.subscribe({ keys: selection.keys }, () => updates.push(selection.getIds()));
  store.setShared({ stateCode: "US-MA", countyCode: "US-MA-017" });
  store.setChart("t4", { candidateLocationIds: ["L1","L2","L3","L4"], selectedCombinationIds: ["L1","L2","L3"] });
  assert.deepEqual(selection.getIds(), ["L1","L2","L3"]);
  const copy = selection.getIds(); assert.throws(() => copy.push("L5"));
  store.setChart("t4", { sortOrder: "alpha" }); assert.equal(updates.length, 1);
  store.setChart("t4", { selectedCombinationIds: ["L2","L3","L4"] }); assert.equal(updates.length, 2);
  store.setShared({ countyCode: "US-MA-025" }); assert.deepEqual(selection.getIds(), []);
  assert.deepEqual(updates.at(-1), []); assert.deepEqual(store.getFilters("t4").candidateLocationIds, []);
});
test("dashboard imports without a browser and its page dependencies resolve", async () => {
  assert.equal(typeof (await import("../frontend/dashboard/dashboard.js")).mountDashboard, "function");
  const html = await readFile(new URL("../frontend/dashboard.html", import.meta.url), "utf8");
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!match[1].includes(":")) await stat(new URL("../frontend/" + match[1], import.meta.url));
  }
  assert.ok(html.includes('src="pages/dashboard.js"'));
});
