/** Join recorded metrics onto every bundled county polygon; never drop a county. */
export function joinCountyRichness(counties, stateCode, rows) {
  const metrics = new Map(rows.map(row => [row.region_code, row]));
  return {
    type: "FeatureCollection",
    features: counties.features.map(feature => {
      const regionCode = stateCode + "-" + String(feature.id).padStart(5, "0").slice(2);
      const row = metrics.get(regionCode);
      return {
        ...feature,
        properties: {
          ...feature.properties,
          regionCode,
          countyName: row?.county_name || feature.properties.name,
          speciesRichness: row ? Number(row.species_richness) : null,
          observationRecords: row ? Number(row.observation_records) : null
        }
      };
    })
  };
}
