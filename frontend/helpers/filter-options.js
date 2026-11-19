/** Pure labels/options shared by page composition, independent of stores and rendering. */
export function createFilterOptions(geography, taxa, { stateCodes } = {}) {
  const options = {
    stateCode: geography.filter(row => row.region_level === "state" && (!stateCodes || stateCodes.includes(row.region_code)))
      .map(row => ({ value: row.region_code, label: row.region_name })),
    countyCode: geography.filter(row => row.region_level === "county")
      .map(row => ({ value: row.region_code, label: row.region_name }))
  };
  if (taxa) options.taxonId = [...taxa].map(([value, label]) => ({ value, label }));
  return options;
}
