import { query } from "./database.js";

export function getStateCode() {
  return query(`
    SELECT DISTINCT state_code
    FROM species_region_year
    ORDER BY state_code
    LIMIT 30;
  `);
}

const result = await getStateCode();
console.log(result);