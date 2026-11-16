import { query } from "./database.js";

function getStateCode() {
  return query(`
    SELECT DISTINCT state_code
    FROM species_region_year
    ORDER BY state_code
    LIMIT 30;
  `);
}

function getTaxonIds() {
  return query(`
    SELECT
      taxon_id,
      common_name,
      scientific_name,
      category
    FROM taxa
    WHERE category = 'species'
    ORDER BY taxon_id
    LIMIT 20;
  `);
}

// const result = await getTaxonIds("US-MA-025",
//                                  "county",
//                                  [123, 456, 789],
//                                  2020,
//                                  2025);
// console.log(result);

async function getTaxonNameMap() {
  return query(`
    SELECT DISTINCT
      taxon_id,
      common_name
    FROM taxa
    WHERE category = 'species'
    ORDER BY common_name;
  `);
}
const result = await getTaxonNameMap();
const taxonNameMap = new Map(
  result.data.map(d => [d.taxon_id, d.common_name])
);
console.log(taxonNameMap)