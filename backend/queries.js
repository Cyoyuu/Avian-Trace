import { querySpeciesHeatmap } from "./species-heatmap-query.js";
import { SEASONAL_SPECIES_TREND_SQL, getTrendMonths, validateSeasonalTrend } from "./species-trend-query.js";
import { COUNTY_RICHNESS_SQL } from "./county-richness-query.js";

import { query } from "./database.js";

/**
 * Get the total recorded species richness and observation records
 * for a specific state or county within a year range.
 *
 * @param {string} regionCode - Region code (e.g., "US-MA" or "US-MA-017").
 * @param {"state"|"county"} regionLevel - Geographic level of the region.
 * @param {number} startYear - Starting year (inclusive).
 * @param {number} endYear - Ending year (inclusive).
 * @returns {Promise<object>} Query result containing species_richness
 *   and observation_records.
 */
export function getRegionSummary(regionCode, regionLevel, startYear, endYear) {
  return query(`
    SELECT
      COUNT(DISTINCT s.taxon_id) AS species_richness,
      COALESCE(SUM(s.observation_rows), 0)
        AS observation_records
    FROM species_region_year s
    JOIN taxa t ON s.taxon_id = t.taxon_id
    WHERE s.region_level = $1
      AND s.region_code = $2
      AND s.year BETWEEN $3 AND $4
      AND t.category = 'species'
  `, [regionLevel, regionCode, startYear, endYear]);
}

/**
 * Get annual observation records for a particular bird taxon
 * within a selected state or county.
 *
 * @param {string} regionCode - Region code (e.g., "US-MA").
 * @param {"state"|"county"} regionLevel - Geographic level.
 * @param {string} taxonId - Bird taxonomic identifier (Avibase ID).
 * @param {number} startYear - Starting year (inclusive).
 * @param {number} endYear - Ending year (inclusive).
 * @param {string} [season] - Optional T2 season with complete yearly values and availability.
 * @returns {Promise<object>} Query result containing year and observation_records.
 */
export function getSpeciesTrend(regionCode, regionLevel, taxonId, startYear, endYear, season) {
  if (season !== undefined) {
    const months = getTrendMonths(season);
    validateSeasonalTrend(regionCode, regionLevel, startYear, endYear);
    return query(SEASONAL_SPECIES_TREND_SQL, [regionCode, regionLevel, taxonId, startYear, endYear, months.join(",")]);
  }
  // Preserve the annual endpoint contract for existing callers that omit season.
  return query(`
    SELECT
      s.year,
      SUM(s.observation_rows) AS observation_records
    FROM species_region_year s
    JOIN taxa t ON s.taxon_id = t.taxon_id
    WHERE s.region_level = $1
      AND s.region_code = $2
      AND s.taxon_id = $3
      AND t.category = 'species'
      AND s.year BETWEEN $4 AND $5
    GROUP BY s.year
    ORDER BY s.year
  `, [regionLevel, regionCode, taxonId, startYear, endYear]);
}

/**
 * Rank geographic regions by recorded species richness.
 *
 * When regionLevel="state", ranks all U.S. states.
 * When regionLevel="county", ranks counties within the specified state.
 *
 * @param {"state"|"county"} regionLevel - Geographic level to rank.
 * @param {string|null} stateCode - State code (e.g., "US-MA")
 *   used to restrict county rankings. Pass null for no filter.
 * @param {number} startYear - Starting year (inclusive).
 * @param {number} endYear - Ending year (inclusive).
 * @param {number} limit - Maximum number of species to return.
 * @returns {Promise<object>} Query result containing region_code
 *   and species_richness, sorted from highest to lowest.
 */
export function getRichnessRanking(regionLevel, stateCode, startYear, endYear, 
                                   limit, sortOrder="desc") {
  const orderBy = sortOrder === "asc" ? "ASC" : "DESC";
                      
  return query(`
    SELECT
      s.region_code,
      COUNT(DISTINCT s.taxon_id) AS species_richness
    FROM species_region_year s
    JOIN taxa t ON s.taxon_id = t.taxon_id
    WHERE s.region_level = $1
      AND ($2 IS NULL OR s.state_code = $2)
      AND s.year BETWEEN $3 AND $4
      AND t.category = 'species'
    GROUP BY s.region_code
    ORDER BY species_richness ${orderBy}, s.region_code ASC
    LIMIT $5
  `, [regionLevel, stateCode, startYear, endYear, limit]);
}

/**
 * Get the most frequently reported bird species in a region.
 *
 * Ranking is based on observation records, not the number of
 * individual birds or estimated population abundance.
 *
 * @param {string} regionCode - Region code (e.g., "US-MA").
 * @param {"state"|"county"} regionLevel - Geographic level.
 * @param {number} startYear - Starting year (inclusive).
 * @param {number} endYear - Ending year (inclusive).
 * @param {number} limit - Maximum number of species to return.
 * @returns {Promise<object>} Query result containing taxon_id,
 *   common_name, and observation_records, sorted descending.
 */
export function getTopSpecies(regionCode, regionLevel, startYear, endYear, limit) {
  return query(`
    SELECT
      t.taxon_id,
      t.common_name,
      SUM(s.observation_rows) AS observation_records
    FROM species_region_year s
    JOIN taxa t ON s.taxon_id = t.taxon_id
    WHERE s.region_level = $1
      AND s.region_code = $2
      AND s.year BETWEEN $3 AND $4
      AND t.category = 'species'
    GROUP BY t.taxon_id, t.common_name
    ORDER BY observation_records DESC
    LIMIT $5
  `, [regionLevel, regionCode, startYear, endYear, limit]);
}

export async function getTaxonNameMap() {
  return query(`
    SELECT DISTINCT
      taxon_id,
      common_name
    FROM taxa
    WHERE category = 'species'
    ORDER BY common_name;
  `);
}
/** All reference counties in a state, including zero-record counties; no ranking limit. */
export function getCountyRichness(stateCode, startYear, endYear) {
  return query(COUNTY_RICHNESS_SQL, [stateCode, startYear, endYear]);
}

/** Geographic labels and codes for reusable filter option lists. */
export function getGeographicOptions() {
  return query(`
    SELECT 'state' AS region_level, state_code AS region_code,
      state_name AS region_name, state_code
    FROM states WHERE regexp_matches(state_code, '^US-[A-Z]{2}$')
    UNION ALL
    SELECT 'county', county_code, COALESCE(county_name, county_code), state_code
    FROM counties WHERE regexp_matches(county_code, '^US-[A-Z]{2}-[0-9]{3}$')
    ORDER BY region_level, region_name, region_code
  `);
}

/** Top species and twelve monthly record totals across the requested complete years. */
export function getSpeciesHeatmap(regionCode, regionLevel, startYear, endYear, speciesCount) {
  return querySpeciesHeatmap(query, regionCode, regionLevel, startYear, endYear, speciesCount);
}
