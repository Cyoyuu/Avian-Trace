# Visualization Design

## Reusable filtering

The filter infrastructure uses browser ES modules and has no added dependencies.
It does not import charts, fetch data, generate combinations, or modify existing pages or routes.

### Modules

- frontend/filters/filter-definitions.js: immutable shared/local definitions, defaults, options, month sets, task applicability, and T1/T3 selection roles.
- frontend/filters/filter-store.js: store factory, typed validation, snapshots, atomic patches, and relevant-change subscriptions.
- frontend/components/filter-header.js and .css: reusable labeled controls bound to an injected store.
- frontend/filter-demo.html and .js: standalone task selector with snapshots and notification counters. One store is used throughout this small demonstration; it renders no charts or combined dashboard.

### State contract

~~~js
{
  shared: {
    stateCode: null,
    countyCode: null,
    taxonId: null,
    startYear: 2012,
    endYear: 2025
  },
  charts: {
    t1Map: {},
    t1: { sortOrder: "desc" },
    t2: { season: "all" },
    t3: {},
    t4: { numberOfLocations: 3, sortOrder: "desc" }
  }
}
~~~

State and county codes use eBird region codes, such as US-MA and US-MA-017.
Species selections use taxon IDs, not display names. Null means unset, not a query for all species or a fabricated county.
Years and location counts are numbers; the store rejects numeric strings.
State/county validation checks code structure and their matching state prefix; existence is the caller's option/data responsibility.
A county requires a matching state. Changing or clearing state clears the county in the same transaction unless the patch explicitly provides a compatible county.

| Task | Shared values | Local values |
| --- | --- | --- |
| T1 choropleth (`t1Map`) | State, county | None |
| T1 bar chart (`t1`) | State, county | Sorting |
| T2 | State, county, species, start/end year | Season |
| T3 | State (county context), county, species, start/end year | None |
| T4 | State, county | Locations per combination, sorting |

T1 uses stateCode as the statewide comparison context and countyCode solely to highlight an entry. A county selection does not replace or clear stateCode. Its future data loader must keep using the state for the comparison query.
T3 uses state to narrow county choices; an unset county is an incomplete selection for the planned county comparison.

Sorting values are alpha (alphabetical), asc (ascending), and desc (descending), separately stored for T1 and T4.
Season belongs only to T2: all (Jan–Dec), spring (Mar–May), summer (Jun–Aug), fall (Sep–Nov), winter (Dec–Feb). Definitions expose numeric month sets. These describe calendar months; cross-year winter aggregation belongs to future chart/data work.

T4 numberOfLocations defaults to 3 and accepts exactly the numbers 3, 4, or 5. It means exactly that many locations per combination within the selected county. A combination's richness is the count of distinct species in the union of its locations. The store imposes no candidate-count limit and contains no combination-generation algorithm.

### Standalone use

~~~js
import { createFilterStore } from "./filters/filter-store.js";
import { createFilterHeader } from "./components/filter-header.js";

const store = createFilterStore();
const header = createFilterHeader({
  container: "#filters",
  store,
  chartId: "t2", // scope defaults to "all": relevant shared + local controls
  options: {
    stateCode: [{ value: "US-MA", label: "Massachusetts" }],
    countyCode: [{ value: "US-MA-017", label: "Middlesex County" }],
    taxonId: [{ value: "avibase-4E74AE22", label: "Northern Cardinal" }]
  }
});

const unsubscribe = store.subscribe({ chartId: "t2" }, ({ filters, changedKeys }) => {
  console.log("T2 update", filters, changedKeys);
});
store.setShared({ stateCode: "US-MA", countyCode: "US-MA-017" });
store.setShared({ startYear: 2015, endYear: 2020 });
store.setChart("t2", { season: "spring" });

// Read initial values explicitly: subscribe does not invoke an initial callback.
console.log(store.getFilters("t2"));
// On teardown:
unsubscribe();
header.destroy();
~~~

Include components/filter-header.css in the page. Headers require an existing container.
The header uses inline labels and 34 px controls in a horizontal toolbar targeting 52 px tall. Narrow containers scroll horizontally to keep controls on one row; visible validation errors can increase its height.
Multiple instances have distinct label/control IDs. Controls commit on change; invalid input displays an inline error and restores the committed value. County controls are disabled until a state is chosen and list only counties from that state.
Use header.setOptions({ taxonId: [...] }) to supply asynchronously loaded labels/options. Values already in the store remain visible while labels are loading.
Option loading remains outside the header; existing taxon helpers can supply species labels. Do not import us-map.js into this infrastructure: it initializes a visualization.

### Future dashboard wiring (example only)

~~~js
const store = createFilterStore(); // one shared owner, passed to every consumer
const sharedHeader = createFilterHeader({ container: "#shared", store, scope: "shared", options });
const t2Controls = createFilterHeader({ container: "#t2-controls", store, chartId: "t2", scope: "chart" });
const t4Controls = createFilterHeader({ container: "#t4-controls", store, chartId: "t4", scope: "chart" });
~~~

A shared header without chartId displays all shared definitions. With chartId it displays only that task's relevant shared definitions. scope: "chart" renders only that task's local controls; T3 currently has none.
Each visualization subscribes by chartId to the same store. Do not create a second shared store per visualization or synchronize independent stores manually. Independent standalone pages can each create their own store.

### Subscription and update guarantees

- setShared(patch) and setChart(chartId, patch) validate the entire patch before committing. Unknown filters/tasks and invalid values throw without state changes or notifications.
- Each affected subscriber receives one callback per patch, even when several relevant values change. Unchanged values and unrelated filters produce no callback.
- Task callbacks receive a flat filters snapshot containing relevant shared values and that task's local values. changedKeys contains only relevant scoped paths, e.g. shared.taxonId or charts.t2.season.
- getState(), getFilters(chartId), and callback data are immutable copies. Read them rather than mutating them; all changes go through setters.
- subscribe({ keys: ["shared.taxonId"] }, callback) supports narrower subscriptions, including header bindings. Its filters snapshot is keyed by the supplied scoped paths. Choose keys or chartId, not both.
- The returned unsubscribe function is idempotent. header.destroy() removes its subscription, listeners, and DOM; it does not unsubscribe chart consumers.
- Notifications are synchronous. Nested updates are queued so all subscribers receive transaction snapshots in order. Listener failures do not prevent delivery to others; setters throw an AggregateError after delivery, with state already committed. Keep data-loading errors inside the visualization's own handler.

The default year bounds are 2012–2025, matching existing complete-year controls. To use another known available range, createFilterStore({ yearBounds: { min: 2012, max: 2026 } }); both initial years and number controls follow those bounds. This does not change backend capabilities.
Future chart adapters will translate canonical values to their endpoints. In particular, the current holiday API takes common names and different parameter names and does not implement these year/season controls; existing routes are intentionally unchanged.

### Run and verify

Run npm test for focused Node built-in tests (no database or server needed).
Run `npm start`, then open the filter demo listed in the centralized URL table below.

1. Change species or years under T2: only T2/T3 counters advance.
2. Change T2 season: only T2 advances.
3. Switch to T1 and change county: state stays selected; all tasks receive the county change.
4. Change T1 sorting: only T1 advances.
5. Switch to T4: choose 3, 4, or 5 and any sorting option; only T4 advances.
6. Unsubscribe T3, then change shared species/years: T3's counter stays fixed. Resubscribe to receive future changes.
7. Change state: county clears and its options narrow to that state. Try a reversed year range: the store stays unchanged and the header displays an error.

Switching the displayed task destroys the old header and creates the next one against the same store; state values persist and no filter-change notification is generated merely by switching controls. This is a notification demonstration, not a chart integration.

## Standalone Visualization URLs

Start the application from the repository root:

~~~sh
npm start
~~~

The Express server serves the following implemented pages at http://127.0.0.1:3000.
Future visualization URLs will be added only when their pages are implemented.

| Task | Visualization | URL | Implementation status |
| --- | --- | --- | --- |
| Infrastructure | Filter demo | [Filter demo](http://127.0.0.1:3000/filter-demo.html) | Implemented |
| T1 | County Choropleth | [County Choropleth](http://127.0.0.1:3000/county-choropleth.html) | Implemented |
| T1 | County Richness Bar Chart | [County Richness Bar Chart](http://127.0.0.1:3000/county-richness-bar.html) | Implemented |
| T2 | Observation Trends Line Chart | — | Not implemented as a standalone filter-connected page |
| T2 | Seasonal Species Heatmap | — | Not implemented |
| T3 | Holiday Comparison Line Chart | — | Not implemented as a standalone filter-connected page |
| T4 | Location Combination Bar Chart | — | Not implemented |
| T4 | UpSet Chart | — | Not implemented |

### T1 — County Choropleth

The standalone choropleth reuses the bundled counties-10m.json TopoJSON boundaries, existing state-FIPS lookup, getCountiesByStateId filtering, and the Albers fitting/county-selection pattern from the existing map. The lookup now lives in the side-effect-free geographic-codes.js helper; us-map.js retains its original export for compatibility. Existing map and chart examples remain usable.

**Filters:** the reusable header renders in standalone mode with chartId: "t1Map". Its shared stateCode selects the statewide comparison, and countyCode selects a highlight. This view has no local sorting control. It displays the fixed complete-year period 2012–2025; year/species/season changes used by other charts do not notify it. The shared filter-store API and validation are unchanged.

**Interactions:** selecting a state loads all its county boundaries and summary metrics. County clicks, Enter/Space on a focused polygon, and the county dropdown all write the same countyCode to the store. Selection adds an outline while preserving the richness fill, every other county, and the statewide scale. County-only changes never refetch or restrict statewide data. Clearing the county removes the highlight; changing state clears county through the existing store rule. Cached state results and request IDs prevent stale responses from replacing the current state. Hovering or focusing a county shows its name, distinct-species richness, and observation-record count. The visible selection summary repeats these metrics. A readable sequential blue legend is recomputed for each state's range; darker indicates greater richness, so colors are relative to the currently selected state.

**Data calculations:** /api/county-richness accepts stateCode, startYear, and endYear. The page requests 2012–2025 inclusive. It aggregates species_region_year rows where region_level = 'county', state_code matches the selected state, observation_rows > 0, and the joined taxa.category = 'species'. Richness is COUNT(DISTINCT taxon_id) across the full period, not the sum of annual richness. Observation records are SUM(observation_rows) across the same rows: record counts, not summed reported bird counts, checklists, or unique observers. The existing build_summaries.py generates observation_rows using COUNT(*) of production observation rows and sums those counts into annual summaries; no additional checklist/group deduplication is applied here. The query left-joins metrics to the county reference table so a known county with no qualifying records returns zero. It has no top-N limit. /api/geography supplies existing state/county labels for the header.

**Coverage and limitations:** the page displays every bundled polygon for the selected state. A polygon without a matching county reference/summary is gray and explicitly marked unavailable, not zero. County summaries without matching bundled boundaries are listed with both metrics in a coverage note rather than silently assigned to another polygon. These currently include Alaska codes 063/066/270, South Dakota code 113, and an unnamed Hawaii code 010; unavailable reference names fall back to the county code. Selecting one still shows its metrics, but cannot outline a missing boundary. Invalid/unidentified geographic reference codes are excluded from filter options. The included boundaries may differ from historical reporting geographies. Data is limited to species-category records and the displayed complete-year period; observation effort varies, so richness is recorded coverage rather than a population estimate. D3 and TopoJSON browser scripts follow the existing CDN convention and require network access. Statewide summary results are cached for the page session; reloading refreshes them.

**Verification:** npm test includes synthetic DuckDB calculation tests covering cross-year distinct counting, taxonomy exclusions, geographic/year restrictions, zero-record counties, and missing geometry joins, alongside the existing filter tests. Geometry tests confirm all 14 Massachusetts counties and 254 Texas counties are retained. Browser checks cover selection through the header and keyboard, tooltips, color legend, state changes, clear selection, and stale-state behavior. Real-data API results are compared with independent database aggregations before committing.


### T1 — County Richness Bar Chart

The standalone vertical bar chart adapts the existing task1-chart.js keyed joins and selection colors. It reuses loadCountyRichness and /api/county-richness without adding or changing backend queries. X is County; Y is Number of distinct recorded species. Every county returned by the endpoint is retained, including counties with no matching map polygon and known counties with zero qualifying records. County codes key the bars so repeated display names do not merge entries.

**Filters and selection:** the reusable header runs in standalone mode with the existing chartId: "t1". stateCode selects the statewide comparison; countyCode selects a highlight; local sortOrder defaults to desc and accepts alpha, asc, and desc. Numeric sorts use recorded richness, with alphabetical name/code tie breaks. Neither sorting nor county highlighting refetches or filters statewide data. Header selection, bar clicks, and Enter/Space on focused columns update the same shared countyCode. Selection changes the bar color/outline and scrolls the selected county into view while retaining all other counties. Clearing county removes the highlight; changing state clears county through the existing store rule. Other visualizations' local filters remain independent. Results are cached by state for the page session, and stale requests cannot replace the current state's data.

**County-label readability:** the plot reserves at least 42 px per county, displays complete county names at a 65-degree angle, and calculates margins from the longest name. States with many counties use horizontal scrolling instead of hiding counties or shrinking labels. The separate Y-axis remains visible while the plot scrolls. The scrolling region and county columns support keyboard focus; zero-height bars have full-column interaction targets and a baseline marker so zero-record counties remain selectable. A visible selection summary repeats the tooltip metrics. Resizing recalculates layout without changing the filter state.

**Data calculations:** the chart requests the same fixed 2012–2025 inclusive period and species-category record counts documented for the choropleth. It converts serialized integer counts to numbers and sorts a copy of the returned data; it does not sum annual richness or recalculate observation records. Tooltip fields are county name, distinct-species richness, and observation-record count. Unavailable reference names fall back to the county code. No geometry join, top-N limit, pagination, or county-selection restriction is applied to the returned rows.

**Verification and limitations:** focused tests cover numeric/alphabetical sorting, deterministic ties, default sorting and subscription isolation, zero counts, preservation of all API rows (including unmatched polygons), and large-state label spacing. The existing DuckDB calculation tests continue to verify the reused endpoint's cross-year distinct counts and observation totals. Browser checks cover sorting, pointer/keyboard selection, metric tooltips, all 254 Texas counties, counties without polygons, rapid state changes, and narrow/desktop rendering. Large states intentionally require substantial horizontal scrolling; the county selector brings an individual county into view. The display excludes partial-year 2026, and observation effort affects recorded richness. D3 follows the existing CDN convention and requires network access. Reload the page to refresh cached data.
