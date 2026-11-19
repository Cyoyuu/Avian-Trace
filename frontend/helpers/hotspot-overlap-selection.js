/** URL state contains stable IDs only. Membership/existence is checked against the API before committing it. */
export function parseHotspotOverlapSelection(search, geography) {
  const params = new URLSearchParams(search);
  if (!params.size) return null;
  const allowed = ["stateCode", "countyCode", "locationIds"];
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new Error("Invalid overlap link parameters");
  }
  const countyCode = params.get("countyCode");
  const stateCode = params.get("stateCode") || countyCode?.slice(0,5);
  const locationIds = (params.get("locationIds") || "").split(",");
  validateHotspotOverlapSelection({ stateCode, countyCode, locationIds });
  if (!geography.some(row => row.region_level === "state" && row.region_code === stateCode) ||
      !geography.some(row => row.region_level === "county" && row.region_code === countyCode)) throw new Error("Unknown state or county in overlap link");
  return { stateCode, countyCode, locationIds: locationIds.sort() };
}

export function validateHotspotOverlapSelection({ stateCode, countyCode, locationIds }) {
  if (typeof stateCode !== "string" || !/^US-[A-Z]{2}$/.test(stateCode) ||
      typeof countyCode !== "string" || !/^US-[A-Z]{2}-[0-9]{3}$/.test(countyCode) || !countyCode.startsWith(stateCode + "-") ||
      !Array.isArray(locationIds) || locationIds.length < 3 || locationIds.length > 5 ||
      locationIds.some(id => typeof id !== "string" || !/^L[0-9]+$/.test(id)) || new Set(locationIds).size !== locationIds.length) {
    throw new Error("Invalid overlap link: use one county and 3–5 distinct hotspot IDs from its state");
  }
}

export function hotspotOverlapUrl(selection) {
  validateHotspotOverlapSelection(selection);
  return "hotspot-species-overlap.html?" + new URLSearchParams({ stateCode: selection.stateCode,
    countyCode: selection.countyCode, locationIds: [...selection.locationIds].sort().join(",") });
}

export function validateLoadedHotspots(rows, ids) {
  if (!Array.isArray(rows) || rows.length !== ids.length || new Set(rows.map(row => row.locality_id)).size !== ids.length ||
      rows.some(row => !ids.includes(row.locality_id))) throw new Error("Missing or incompatible hotspot memberships");
  return rows;
}
