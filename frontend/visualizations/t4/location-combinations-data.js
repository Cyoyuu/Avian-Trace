const names = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export const MAX_CANDIDATES = 10;
export const COMBINATIONS_PER_PAGE = 50;
export const combinationKey = ids => [...ids].sort().join("|");

/** Pure exact unions of already-fetched memberships; no data access or filter-store dependency. */
export function buildLocationCombinations(locations, size) {
  if (![3, 4, 5].includes(size)) throw new Error("Invalid combination size");
  if (!Array.isArray(locations) || locations.length > MAX_CANDIDATES) throw new Error("Choose at most 10 candidates");
  const ids = new Set();
  const candidates = locations.map(location => {
    if (!/^L[0-9]+$/.test(location.locality_id) || ids.has(location.locality_id) || !Array.isArray(location.species_ids) ||
        location.species_ids.some(id => typeof id !== "string" || !id.trim())) throw new Error("Invalid hotspot membership");
    ids.add(location.locality_id);
    return { id: location.locality_id, name: location.locality_name || location.locality_id, species: new Set(location.species_ids) };
  }).sort((a,b) => names.compare(a.name,b.name) || names.compare(a.id,b.id));
  const result = [];
  function visit(start, chosen, species) {
    if (chosen.length === size) {
      const locationIds = chosen.map(location => location.id).sort();
      result.push({ key: combinationKey(locationIds), locationIds, locations: chosen.map(({ id, name }) => ({ id, name })), label: chosen.map(location => location.name).join(" + "), richness: species.size });
      return;
    }
    for (let index = start; index <= candidates.length - (size - chosen.length); index++) {
      visit(index + 1, [...chosen, candidates[index]], new Set([...species, ...candidates[index].species]));
    }
  }
  visit(0, [], new Set());
  const maximum = Math.max(0, ...result.map(row => row.richness));
  return result.map(row => ({ ...row, isBest: row.richness === maximum }));
}

export function sortLocationCombinations(rows, order = "desc") {
  if (!["alpha", "asc", "desc"].includes(order)) throw new Error("Invalid sort order");
  return [...rows].sort((a,b) => {
    const alphabetical = names.compare(a.label,b.label) || names.compare(a.key,b.key);
    return order === "alpha" ? alphabetical : (order === "asc" ? a.richness-b.richness : b.richness-a.richness) || alphabetical;
  });
}

export function pageLocationCombinations(rows, page = 1) {
  if (!Number.isInteger(page) || page < 1) throw new Error("Invalid combination page");
  const pages = Math.max(1, Math.ceil(rows.length / COMBINATIONS_PER_PAGE));
  const current = Math.min(page, pages);
  return { rows: rows.slice((current-1)*COMBINATIONS_PER_PAGE,current*COMBINATIONS_PER_PAGE), page: current, pages, total: rows.length };
}
