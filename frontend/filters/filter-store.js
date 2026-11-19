import {
  SHARED_FILTER_DEFINITIONS, CHART_FILTER_DEFINITIONS, TASK_DEFINITIONS, getFilterEntries
} from "./filter-definitions.js";

function snapshot(value) {
  const copy = structuredClone(value);
  function freeze(item) {
    if (item && typeof item === "object") {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
    return item;
  }
  return freeze(copy);
}

function defaults(definitions) {
  return Object.fromEntries(Object.entries(definitions).map(([key, definition]) => [key, definition.default]));
}

function assertPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Expected a filter patch object");
}

/** Create one store per standalone page, or one store for the whole dashboard. */
export function createFilterStore({ yearBounds = { min: 2012, max: 2025 } } = {}) {
  const { min, max } = yearBounds;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) throw new Error("Invalid year bounds");
  const bounds = Object.freeze({ min, max });
  let state = {
    shared: { ...defaults(SHARED_FILTER_DEFINITIONS), startYear: min, endYear: max },
    charts: Object.fromEntries(Object.entries(CHART_FILTER_DEFINITIONS).map(([id, definitions]) => [id, defaults(definitions)]))
  };
  const listeners = new Set();
  const paths = new Set([
    ...Object.keys(SHARED_FILTER_DEFINITIONS).map(key => "shared." + key),
    ...Object.entries(CHART_FILTER_DEFINITIONS).flatMap(([id, definitions]) => Object.keys(definitions).map(key => "charts." + id + "." + key))
  ]);
  const readPath = (source, path) => path.split(".").reduce((value, key) => value[key], source);

  function assertChart(chartId) {
    if (!Object.hasOwn(TASK_DEFINITIONS, chartId)) throw new Error("Unknown chart: " + chartId);
  }

  function validateValue(key, value, definition) {
    if (value === null && definition.default === null) return;
    if (definition.type === "state" && typeof value === "string" && /^US-[A-Z]{2}$/.test(value)) return;
    if (definition.type === "county" && typeof value === "string" && /^US-[A-Z]{2}-\d{3}$/.test(value)) return;
    if (definition.type === "taxon" && typeof value === "string" && value.trim().length > 0) return;
    if (definition.type === "integer" && Number.isInteger(value) && value >= min && value <= max) return;
    if (definition.type === "locationIds" && Array.isArray(value) && value.length <= definition.maxItems &&
        value.every(id => typeof id === "string" && /^L[0-9]+$/.test(id)) && new Set(value).size === value.length) return;
    if (definition.type === "enum" && definition.options.some(option => option.value === value)) return;
    throw new Error("Invalid value for " + key);
  }

  function validatePatch(patch, definitions) {
    assertPatch(patch);
    Object.entries(patch).forEach(([key, value]) => {
      if (!Object.hasOwn(definitions, key)) throw new Error("Unknown filter: " + key);
      validateValue(key, value, definitions[key]);
    });
  }

  function selectChart(source, chartId) {
    return Object.fromEntries(getFilterEntries({ chartId }).map(entry => [entry.key, readPath(source, entry.path)]));
  }

  // Capture each transaction so subscriptions observe its exact committed values.
  const notifications = [];
  let notifying = false;
  function commit(next) {
    const changedKeys = [...paths].filter(path => {
      const before = readPath(state, path);
      const after = readPath(next, path);
      return Array.isArray(before) && Array.isArray(after)
        ? before.length !== after.length || before.some((value, index) => value !== after[index])
        : before !== after;
    });
    if (!changedKeys.length) return;
    state = next;
    notifications.push({ state: snapshot(state), changedKeys: Object.freeze(changedKeys), subscribers: [...listeners] });
    if (notifying) return;
    notifying = true;
    const errors = [];
    try {
      while (notifications.length) {
        const change = notifications.shift();
        change.subscribers.forEach(listener => {
          if (!listeners.has(listener)) return;
          const relevant = change.changedKeys.filter(key => listener.keys.includes(key));
          if (!relevant.length) return;
          const filters = listener.chartId
            ? selectChart(change.state, listener.chartId)
            : Object.fromEntries(listener.keys.map(key => [key, readPath(change.state, key)]));
          try {
            listener.callback(snapshot({ filters, changedKeys: relevant }));
          } catch (error) {
            errors.push(error);
          }
        });
      }
    } finally {
      notifying = false;
    }
    // State stays committed; listener failures do not interrupt other subscribers.
    if (errors.length) throw new AggregateError(errors, "Filter subscriber failed after state was committed");
  }

  return {
    getState: () => snapshot(state),
    getYearBounds: () => bounds,
    getFilters(chartId) {
      assertChart(chartId);
      return snapshot(selectChart(state, chartId));
    },
    setShared(patch) {
      validatePatch(patch, SHARED_FILTER_DEFINITIONS);
      const shared = { ...state.shared, ...patch };
      if (shared.stateCode !== state.shared.stateCode && !Object.hasOwn(patch, "countyCode")) shared.countyCode = null;
      if (shared.countyCode !== null && (!shared.stateCode || !shared.countyCode.startsWith(shared.stateCode + "-"))) {
        throw new Error("County must belong to the selected state");
      }
      if (shared.startYear > shared.endYear) throw new Error("Start year must not exceed end year");
      const charts = shared.countyCode !== state.shared.countyCode
        ? { ...state.charts, t4: { ...state.charts.t4, candidateLocationIds: [], selectedCombinationIds: [] } }
        : state.charts;
      commit({ ...state, shared, charts });
    },
    setChart(chartId, patch) {
      assertChart(chartId);
      validatePatch(patch, CHART_FILTER_DEFINITIONS[chartId]);
      const local = structuredClone({ ...state.charts[chartId], ...patch });
      if (chartId === "t4") {
        local.candidateLocationIds.sort();
        local.selectedCombinationIds.sort();
        if (local.candidateLocationIds.length && !state.shared.countyCode) throw new Error("Select a county before candidates");
        const validSelection = local.selectedCombinationIds.length === local.numberOfLocations &&
          local.selectedCombinationIds.every(id => local.candidateLocationIds.includes(id));
        if (local.selectedCombinationIds.length && !validSelection) {
          if (Object.hasOwn(patch, "selectedCombinationIds")) throw new Error("Invalid selected combination");
          local.selectedCombinationIds = [];
        }
      }
      commit({ ...state, charts: { ...state.charts, [chartId]: local } });
    },
    /** Subscribe by task or explicit scoped paths. Returns an unsubscribe function. */
    subscribe({ chartId, keys } = {}, callback) {
      if (typeof callback !== "function") throw new Error("A subscriber callback is required");
      if (chartId !== undefined && keys !== undefined) throw new Error("Use chartId or keys, not both");
      if (chartId !== undefined) {
        assertChart(chartId);
        keys = getFilterEntries({ chartId }).map(entry => entry.path);
      }
      if (!Array.isArray(keys) || keys.some(key => !paths.has(key))) throw new Error("Invalid subscription keys");
      const listener = { chartId, keys: [...new Set(keys)], callback };
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
