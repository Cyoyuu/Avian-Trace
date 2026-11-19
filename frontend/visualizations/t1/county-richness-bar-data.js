const nameOrder = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Convert API counts without changing their meaning; retain every returned county. */
export function sortCountyRichness(rows, sortOrder = "desc") {
  if (!["alpha", "asc", "desc"].includes(sortOrder)) throw new Error("Invalid sort order");
  const counties = rows.map(row => {
    const speciesRichness = Number(row.species_richness);
    const observationRecords = Number(row.observation_records);
    if (row.species_richness === null || row.species_richness === "" ||
        row.observation_records === null || row.observation_records === "" ||
        !Number.isSafeInteger(speciesRichness) || speciesRichness < 0 ||
        !Number.isSafeInteger(observationRecords) || observationRecords < 0) {
      throw new Error("Invalid county observation metrics");
    }
    return {
      regionCode: row.region_code,
      countyName: row.county_name || row.region_code,
      speciesRichness,
      observationRecords
    };
  });
  return counties.sort((a, b) => {
    const alphabetical = nameOrder.compare(a.countyName, b.countyName) || nameOrder.compare(a.regionCode, b.regionCode);
    if (sortOrder === "alpha") return alphabetical;
    const difference = a.speciesRichness - b.speciesRichness;
    return (sortOrder === "asc" ? difference : -difference) || alphabetical;
  });
}

/** Reserve a readable slot per county and enough room for untruncated angled labels. */
export function getCountyBarLayout(rows, viewportWidth, sizing = {}) {
  if (sizing.presentation === "compact") {
    const left=90, right=16, top=16, bottom=84;
    const plotHeight=Math.max(85,(sizing.availableHeight||280)-top-bottom-16);
    return { width:Math.max(viewportWidth,left+rows.length*36+right), height:top+plotHeight+bottom, left,right,top,plotHeight,bottom };
  }
  const labelWidth = Math.max(0, ...rows.map(row => row.countyName.length * 7));
  const angle = 65 * Math.PI / 180;
  const left = Math.ceil(labelWidth * Math.cos(angle)) + 12;
  const bottom = Math.max(140, Math.ceil(labelWidth * Math.sin(angle)) + 28);
  const top = 24;
  const plotHeight = sizing.plotHeight ?? 400;
  const width = Math.max(viewportWidth, left + rows.length * 42 + 20);
  return { width, height: top + plotHeight + bottom, left, right: 20, top, plotHeight, bottom };
}
