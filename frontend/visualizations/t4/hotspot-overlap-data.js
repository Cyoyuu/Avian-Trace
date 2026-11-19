const compareNames = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** A species is counted once, in the exact nonempty mask of selected hotspots containing it. */
export function buildExclusiveIntersections(input) {
  if (!Array.isArray(input) || input.length < 3 || input.length > 5) throw new Error("Select 3–5 hotspots");
  const ids = new Set();
  const locations = input.map(row => {
    if (typeof row.locality_id !== "string" || !/^L[0-9]+$/.test(row.locality_id) || ids.has(row.locality_id) ||
        !Array.isArray(row.species_ids) || row.species_ids.some(id => typeof id !== "string" || !id.trim())) {
      throw new Error("Invalid or missing hotspot memberships");
    }
    ids.add(row.locality_id);
    return { id: row.locality_id, name: row.locality_name || row.locality_id, species: new Set(row.species_ids) };
  }).sort((a,b) => compareNames.compare(a.name,b.name) || compareNames.compare(a.id,b.id));
  const speciesMasks = new Map();
  locations.forEach((location, index) => {
    location.species.forEach(id => speciesMasks.set(id, (speciesMasks.get(id) || 0) | (1 << index)));
  });
  const counts = new Map();
  speciesMasks.forEach(mask => counts.set(mask, (counts.get(mask) || 0) + 1));
  const intersections = [...counts].map(([mask, count]) => ({
    mask, count, locationIds: locations.filter((location,index) => mask & (1 << index)).map(location => location.id)
  })).sort((a,b) => b.count - a.count || a.mask - b.mask);
  const unionRichness = speciesMasks.size;
  if (intersections.reduce((sum,row) => sum + row.count,0) !== unionRichness) throw new Error("Intersection union mismatch");
  return { locations: locations.map(({ id, name, species }) => ({ id, name, richness: species.size })), intersections, unionRichness };
}
